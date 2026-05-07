import { createHmac, timingSafeEqual } from "crypto"
import type { ConnectorAdapter } from "./adapter"
import type { NormalizedFeedback, ConnectorConfig } from "@voxly/types"
import { SourceType } from "@voxly/types"

interface ZendeskTicket {
  id: number
  url: string
  subject: string
  description: string
  type: string | null
  tags: string[]
  created_at: string
  updated_at: string
  satisfaction_rating?: { score: string } | null
  requester?: { name?: string; email?: string }
}

interface ZendeskWebhookPayload {
  ticket: ZendeskTicket
}

/** Map Zendesk CSAT score to sentiment float. */
function csatToSentiment(score: string | undefined): number | undefined {
  if (!score) return undefined
  switch (score) {
    case "good":        return 0.7
    case "bad":         return -0.7
    case "unoffered":   return undefined
    default:            return undefined
  }
}

/**
 * Verify Zendesk webhook signature.
 * Zendesk signs with HMAC-SHA256 over the raw body using the webhook secret.
 * Header: X-Zendesk-Webhook-Signature  (base64-encoded)
 */
export function verifyZendeskSignature(
  signingSecret: string,
  rawBody: Buffer,
  timestamp: string,
  signature: string,
): boolean {
  const message = timestamp + rawBody.toString("utf8")
  const expected = createHmac("sha256", signingSecret)
    .update(message)
    .digest("base64")
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

export const zendeskConnector: ConnectorAdapter & {
  normalizeSentimentHint?: (score: string) => number | undefined
} = {
  type: SourceType.ZENDESK,

  normalize(raw: unknown, config: ConnectorConfig): (NormalizedFeedback & { csatSentiment?: number; ticketType?: string; tags?: string[] })[] {
    const payload = raw as ZendeskWebhookPayload
    const ticket = payload?.ticket
    if (!ticket) return []

    const text = [ticket.subject, ticket.description].filter(Boolean).join("\n\n").trim()
    if (!text) return []

    // Stage 2 will filter by tag allowlist from config
    const allowedTags = (config.settings?.allowedTags as string[] | undefined) ?? []
    const ticketTags = ticket.tags ?? []

    const csatSentiment = csatToSentiment(ticket.satisfaction_rating?.score)

    return [
      {
        externalId:     String(ticket.id),
        externalUrl:    ticket.url,
        verbatimText:   text,
        authorName:     ticket.requester?.name,
        authorEmail:    ticket.requester?.email,
        sourceType:     SourceType.ZENDESK,
        publishedAt:    new Date(ticket.created_at),
        rawPayload:     raw,
        csatSentiment,
        ticketType:     ticket.type ?? undefined,
        tags:           ticketTags,
        // Attach for Stage 2 tag filtering
        ...(allowedTags.length > 0 && { _allowedTags: allowedTags }),
      } as NormalizedFeedback & { csatSentiment?: number; ticketType?: string; tags?: string[] },
    ]
  },

  async setupWebhook(_connectorId: string, _config: ConnectorConfig): Promise<void> {
    // Zendesk webhooks are created via the Zendesk Admin UI or Webhooks API.
    // In production: POST /api/v2/webhooks with the Voxly endpoint URL.
  },

  async validate(config: ConnectorConfig): Promise<{ valid: boolean; error?: string }> {
    if (!config.accessToken) return { valid: false, error: "Missing Zendesk API token" }
    if (!config.webhookSecret) return { valid: false, error: "Missing Zendesk webhook signing secret" }
    if (!config.settings?.subdomain) return { valid: false, error: "Missing Zendesk subdomain" }
    return { valid: true }
  },
}
