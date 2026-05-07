import { createHmac, timingSafeEqual } from "crypto"
import type { ConnectorAdapter } from "./adapter"
import type { NormalizedFeedback, ConnectorConfig } from "@voxly/types"
import { SourceType } from "@voxly/types"

// Intercom webhook topic shapes we care about
interface IntercomContact {
  id: string
  name?: string
  email?: string
}

interface IntercomConversation {
  id: string
  created_at: number
  updated_at: number
  source: {
    type: string
    body: string
    url?: string
    author: IntercomContact
  }
  type: string
}

interface IntercomWebhookPayload {
  type: "notification_event"
  topic: string
  data: {
    item: IntercomConversation
  }
}

const ALLOWED_TOPICS = new Set([
  "conversation.created",
  "conversation.replied",
  "conversation.user.replied",
])

/**
 * Verify Intercom webhook via X-Hub-Signature header (HMAC-SHA1).
 */
export function verifyIntercomSignature(
  clientSecret: string,
  rawBody: Buffer,
  signature: string,
): boolean {
  const expected = `sha1=${createHmac("sha1", clientSecret).update(rawBody).digest("hex")}`
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

export const intercomConnector: ConnectorAdapter = {
  type: SourceType.INTERCOM,

  normalize(raw: unknown, _config: ConnectorConfig): NormalizedFeedback[] {
    const payload = raw as IntercomWebhookPayload

    if (!ALLOWED_TOPICS.has(payload.topic)) return []

    const conversation = payload.data?.item
    if (!conversation) return []

    const source = conversation.source
    if (!source?.body) return []

    // Strip HTML tags from Intercom body
    const verbatimText = source.body.replace(/<[^>]*>/g, "").trim()
    if (!verbatimText) return []

    const author = source.author
    const publishedAt = new Date(conversation.created_at * 1000)

    return [
      {
        externalId: conversation.id,
        externalUrl: source.url,
        verbatimText,
        authorName: author?.name,
        authorEmail: author?.email,
        sourceType: SourceType.INTERCOM,
        publishedAt,
        rawPayload: raw,
      },
    ]
  },

  async setupWebhook(_connectorId: string, _config: ConnectorConfig): Promise<void> {
    // Intercom webhooks are registered via the Intercom developer hub or API.
    // In production: call Intercom's subscription API with the webhook URL.
  },

  async validate(config: ConnectorConfig): Promise<{ valid: boolean; error?: string }> {
    if (!config.accessToken) {
      return { valid: false, error: "Missing Intercom access token" }
    }
    if (!config.webhookSecret) {
      return { valid: false, error: "Missing Intercom client secret for signature verification" }
    }
    return { valid: true }
  },
}
