import { createHmac, timingSafeEqual } from "crypto"
import type { ConnectorAdapter } from "./adapter"
import type { NormalizedFeedback, ConnectorConfig } from "@voxly/types"
import { SourceType } from "@voxly/types"
import { extractGongTranscript } from "@voxly/ai"

// ─── Gong API types ───────────────────────────────────────────────────────────

interface GongCallWebhookPayload {
  callId: string
  workspaceId?: string
  metaData?: {
    id: string
    started: string
    title?: string
    duration?: number
  }
}

interface GongTranscriptSegment {
  speakerId: string
  monologues: Array<{ sentences: Array<{ text: string }> }>
}

interface GongTranscriptResponse {
  callTranscripts: Array<{
    callId: string
    transcript: GongTranscriptSegment[]
  }>
}

interface GongCallParticipant {
  speakerId: string
  name?: string
  affiliation: "Internal" | "External"
}

// ─── Signature verification ───────────────────────────────────────────────────

/**
 * Verify Gong webhook HMAC-SHA256 signature.
 * Header: X-Gong-Signature
 */
export function verifyGongSignature(
  signingKey: string,
  rawBody: Buffer,
  signature: string,
): boolean {
  const expected = createHmac("sha256", signingKey)
    .update(rawBody)
    .digest("hex")
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

// ─── Gong API helpers ─────────────────────────────────────────────────────────

async function fetchGongTranscript(
  accessToken: string,
  callId: string,
): Promise<string> {
  const res = await fetch("https://us-12988.api.gong.io/v2/calls/transcript", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ filter: { callIds: [callId] } }),
  })

  if (!res.ok) throw new Error(`Gong transcript API error: ${res.status}`)

  const data = (await res.json()) as GongTranscriptResponse
  const callTranscript = data.callTranscripts?.[0]
  if (!callTranscript) return ""

  // Flatten transcript to a readable format for GPT-4o extraction
  return callTranscript.transcript
    .map((seg) =>
      `[Speaker ${seg.speakerId}]: ${seg.monologues
        .flatMap((m) => m.sentences.map((s) => s.text))
        .join(" ")}`,
    )
    .join("\n")
}

async function fetchGongCallParticipants(
  accessToken: string,
  callId: string,
): Promise<GongCallParticipant[]> {
  const res = await fetch(`https://us-12988.api.gong.io/v2/calls/extensive`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filter: { callIds: [callId] },
      contentSelector: { context: ["Parties"] },
    }),
  })

  if (!res.ok) return []

  const data = (await res.json()) as {
    calls?: Array<{ parties?: GongCallParticipant[] }>
  }
  return data.calls?.[0]?.parties ?? []
}

// ─── ConnectorAdapter ─────────────────────────────────────────────────────────

export const gongConnector: ConnectorAdapter = {
  type: SourceType.GONG,

  normalize(_raw: unknown, _config: ConnectorConfig): NormalizedFeedback[] {
    // Gong normalization is async (requires Transcript API + GPT-4o extraction).
    // The webhook handler calls normalizeAsync() instead.
    return []
  },

  /**
   * Async path: fetch transcript, run GPT-4o extraction, return customer items.
   * Called by the ingestion worker after receiving a call-completed webhook.
   */
  async normalizeAsync(
    raw: unknown,
    config: ConnectorConfig,
  ): Promise<NormalizedFeedback[]> {
    const payload = raw as GongCallWebhookPayload
    const callId = payload.callId ?? payload.metaData?.id
    if (!callId) return []

    const accessToken = config.accessToken
    if (!accessToken) return []

    const callStarted = payload.metaData?.started
      ? new Date(payload.metaData.started)
      : new Date()

    const [transcriptText, participants] = await Promise.all([
      fetchGongTranscript(accessToken, callId),
      fetchGongCallParticipants(accessToken, callId),
    ])

    if (!transcriptText) return []

    // Build a speaker → affiliation map
    const speakerMap = new Map(
      participants.map((p) => [p.speakerId, p]),
    )

    // GPT-4o extracts customer feedback segments
    const segments = await extractGongTranscript(transcriptText)

    return segments
      .filter((seg) => {
        // Keep only customer (external) speech
        if (seg.speakerRole === "customer") return true
        const participant = speakerMap.get(seg.speakerId)
        if (participant) return participant.affiliation === "External"
        return false
      })
      .map((seg, idx) => {
        const participant = speakerMap.get(seg.speakerId)
        return {
          externalId:   `${callId}:${idx}`,
          verbatimText: seg.verbatimText,
          authorName:   participant?.name ?? seg.speakerId,
          sourceType:   SourceType.GONG,
          publishedAt:  callStarted,
          rawPayload:   { callId, segmentIndex: idx, ...raw as object },
          speakerRole:  "customer" as const,
        }
      })
  },

  async setupWebhook(_connectorId: string, _config: ConnectorConfig): Promise<void> {
    // Register via Gong Settings → Webhooks → Add Webhook in the Gong UI.
    // Event type: "Call Completed"
  },

  async validate(config: ConnectorConfig): Promise<{ valid: boolean; error?: string }> {
    if (!config.accessToken) return { valid: false, error: "Missing Gong access token" }
    if (!config.webhookSecret) return { valid: false, error: "Missing Gong webhook signing key" }
    return { valid: true }
  },
}
