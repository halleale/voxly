import type { ConnectorAdapter } from "./adapter"
import type { ConnectorConfig, NormalizedFeedback } from "@voxly/types"
import { SourceType } from "@voxly/types"
import { classifyFeedback } from "@voxly/ai"

interface GongSentence {
  start: number
  end: number
  text: string
}

interface GongTranscriptSegment {
  speakerId: string
  topic?: string
  sentences: GongSentence[]
}

interface GongParty {
  speakerId: string
  name?: string
  title?: string
  emailAddress?: string
  affiliation: "Internal" | "External"
}

interface GongCallMetaData {
  id: string
  title?: string
  started: string
  duration?: number
  primaryUserId?: string
  url?: string
  customData?: string
}

interface GongWebhookPayload {
  metaData: GongCallMetaData
  parties: GongParty[]
  transcript: GongTranscriptSegment[]
}

interface GongCallsResponse {
  calls: Array<{
    metaData: GongCallMetaData
    parties: GongParty[]
  }>
  cursor?: string
}

interface GongTranscriptResponse {
  callTranscripts: Array<{
    callId: string
    transcript: GongTranscriptSegment[]
  }>
}

function buildSegmentText(sentences: GongSentence[]): string {
  return sentences.map((s: GongSentence) => s.text).join(" ").trim()
}

function resolveRole(party: GongParty | undefined): "customer" | "rep" {
  return party?.affiliation === "External" ? "customer" : "rep"
}

export class GongAdapter implements ConnectorAdapter {
  readonly type = SourceType.GONG

  normalize(raw: unknown, _config: ConnectorConfig): NormalizedFeedback[] {
    const payload = raw as GongWebhookPayload
    const { metaData, parties = [], transcript = [] } = payload

    const speakerIndex = new Map<string, GongParty>(
      parties.map((p: GongParty): [string, GongParty] => [p.speakerId, p])
    )

    const results: NormalizedFeedback[] = []

    for (const seg of transcript) {
      const text = buildSegmentText(seg.sentences)
      if (!text) continue

      const party = speakerIndex.get(seg.speakerId)
      const speakerRole = resolveRole(party)

      results.push({
        externalId: `gong:${metaData.id}:${seg.speakerId}:${seg.sentences[0]?.start ?? 0}`,
        externalUrl: metaData.url,
        verbatimText: text,
        authorName: party?.name,
        authorEmail: party?.emailAddress,
        sourceType: SourceType.GONG,
        publishedAt: new Date(metaData.started),
        rawPayload: raw,
        speakerRole,
      })
    }

    return results
  }

  async poll(config: ConnectorConfig, since: Date): Promise<NormalizedFeedback[]> {
    if (!config.accessToken) return []

    const fromDate = since.toISOString().slice(0, 10)
    const callsRes = await fetch(
      `https://api.gong.io/v2/calls?fromDateTime=${fromDate}&limit=100`,
      {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
      }
    )
    if (!callsRes.ok) return []

    const callsData = (await callsRes.json()) as GongCallsResponse
    const calls = callsData.calls ?? []
    if (calls.length === 0) return []

    const callIds = calls.map((c) => c.metaData.id)
    const transcriptRes = await fetch("https://api.gong.io/v2/calls/transcript", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ filter: { callIds } }),
    })
    if (!transcriptRes.ok) return []

    const transcriptData = (await transcriptRes.json()) as GongTranscriptResponse
    type CallEntry = { metaData: GongCallMetaData; parties: GongParty[] }
    const callMap = new Map<string, CallEntry>(
      calls.map((c): [string, CallEntry] => [c.metaData.id, c])
    )

    const results: NormalizedFeedback[] = []

    for (const ct of transcriptData.callTranscripts) {
      const call = callMap.get(ct.callId)
      if (!call) continue

      const speakerIndex = new Map<string, GongParty>(
        (call.parties ?? []).map((p: GongParty): [string, GongParty] => [p.speakerId, p])
      )

      for (const seg of ct.transcript) {
        const party = speakerIndex.get(seg.speakerId)
        if (party?.affiliation !== "External") continue

        const text = buildSegmentText(seg.sentences)
        if (!text || text.length < 20) continue

        const classification = await classifyFeedback(text)
        if (classification === "not_feedback") continue

        results.push({
          externalId: `gong:${ct.callId}:${seg.speakerId}:${seg.sentences[0]?.start ?? 0}`,
          externalUrl: call.metaData.url,
          verbatimText: text,
          authorName: party?.name,
          authorEmail: party?.emailAddress,
          sourceType: SourceType.GONG,
          publishedAt: new Date(call.metaData.started),
          rawPayload: { metaData: call.metaData, parties: call.parties, transcript: [seg] },
          speakerRole: "customer",
        })
      }
    }

    return results
  }

  async validate(config: ConnectorConfig): Promise<{ valid: boolean; error?: string }> {
    if (!config.accessToken) {
      return { valid: false, error: "Missing Gong access token" }
    }
    try {
      const res = await fetch("https://api.gong.io/v2/users/me", {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
      })
      if (!res.ok) return { valid: false, error: "Gong authentication failed" }
      return { valid: true }
    } catch {
      return { valid: false, error: "Network error validating Gong token" }
    }
  }
}
