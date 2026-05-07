import { createHmac, timingSafeEqual } from "crypto"
import type { ConnectorAdapter } from "./adapter"
import type { NormalizedFeedback, ConnectorConfig } from "@voxly/types"
import { SourceType } from "@voxly/types"

// Slack Events API payload shapes we care about
interface SlackEventCallback {
  type: "event_callback"
  event_id: string
  event: SlackMessageEvent
  team_id: string
}

interface SlackMessageEvent {
  type: "message"
  subtype?: string
  text: string
  user?: string
  bot_id?: string
  channel: string
  ts: string
  thread_ts?: string
  username?: string
  // User profile when using users.info enrichment
  user_profile?: { display_name?: string; real_name?: string; email?: string }
}

interface SlackUrlVerification {
  type: "url_verification"
  challenge: string
}

export type SlackWebhookPayload = SlackEventCallback | SlackUrlVerification

/**
 * Verify the X-Slack-Signature header against the raw request body.
 * Returns true if the signature is valid.
 */
export function verifySlackSignature(
  signingSecret: string,
  rawBody: Buffer,
  timestamp: string,
  signature: string,
): boolean {
  // Reject requests older than 5 minutes (replay protection)
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false

  const baseString = `v0:${timestamp}:${rawBody.toString("utf8")}`
  const computed = `v0=${createHmac("sha256", signingSecret).update(baseString).digest("hex")}`

  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(signature))
  } catch {
    return false
  }
}

export const slackConnector: ConnectorAdapter = {
  type: SourceType.SLACK,

  normalize(raw: unknown, _config: ConnectorConfig): (NormalizedFeedback & { channelId?: string })[] {
    const payload = raw as SlackWebhookPayload

    // URL verification challenge — caller handles this before normalize
    if (payload.type === "url_verification") return []

    if (payload.type !== "event_callback") return []
    const event = payload.event

    // Skip subtypes (edits, joins, channel messages, etc.) and bot messages
    if (event.subtype) return []
    if (event.bot_id) return []
    if (!event.text || !event.user) return []

    const authorName =
      event.user_profile?.real_name ??
      event.user_profile?.display_name ??
      `Slack user ${event.user}`

    const publishedAt = new Date(parseFloat(event.ts) * 1000)

    return [
      {
        externalId: event.ts,
        verbatimText: event.text,
        authorName,
        authorEmail: event.user_profile?.email,
        sourceType: SourceType.SLACK,
        publishedAt,
        rawPayload: raw,
        channelId: event.channel,
      },
    ]
  },

  async setupWebhook(_connectorId: string, config: ConnectorConfig): Promise<void> {
    // Slack uses Events API subscriptions configured via the Slack app settings,
    // not a programmatic registration. The webhook URL is set in the Slack app
    // dashboard. Nothing to do here programmatically.
    void config
  },

  async validate(config: ConnectorConfig): Promise<{ valid: boolean; error?: string }> {
    if (!config.accessToken) {
      return { valid: false, error: "Missing Slack access token" }
    }
    if (!config.webhookSecret) {
      return { valid: false, error: "Missing Slack signing secret" }
    }
    // In production: call slack.auth.test to verify the token
    return { valid: true }
  },
}
