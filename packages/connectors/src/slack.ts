import type { ConnectorAdapter } from "./adapter"
import type { ConnectorConfig, NormalizedFeedback } from "@voxly/types"
import { SourceType } from "@voxly/types"

// Slack Events API payload for message events
interface SlackMessageEvent {
  type: string
  subtype?: string
  text: string
  user?: string
  bot_id?: string
  channel: string
  ts: string
  thread_ts?: string
  username?: string
  // User profile from users.info API
  user_profile?: { real_name?: string; display_name?: string; email?: string }
}

interface SlackEventPayload {
  type: string
  event: SlackMessageEvent
  team_id: string
}

export class SlackAdapter implements ConnectorAdapter {
  readonly type = SourceType.SLACK

  normalize(raw: unknown, _config: ConnectorConfig): NormalizedFeedback[] {
    const payload = raw as SlackEventPayload
    const event = payload.event ?? (raw as SlackMessageEvent)

    // Skip bot messages
    if (event.bot_id || event.subtype === "bot_message") return []

    const text = event.text?.replace(/<[^>]+>/g, " ").trim() // strip Slack mention markup
    if (!text) return []

    const ts = event.ts ? new Date(Number(event.ts.split(".")[0]) * 1000) : new Date()
    const profile = event.user_profile

    return [
      {
        externalId: `${event.channel}:${event.ts}`,
        verbatimText: text,
        authorName: profile?.real_name ?? profile?.display_name ?? event.username,
        authorEmail: profile?.email,
        sourceType: SourceType.SLACK,
        publishedAt: ts,
        rawPayload: raw,
      },
    ]
  }

  async setupWebhook(_connectorId: string, _config: ConnectorConfig): Promise<void> {
    // Slack uses Events API — the workspace registers by setting the Request URL
    // in the Slack app dashboard. Nothing to do server-side.
  }

  async validate(config: ConnectorConfig): Promise<{ valid: boolean; error?: string }> {
    if (!config.accessToken) {
      return { valid: false, error: "Missing Slack bot token" }
    }
    try {
      const res = await fetch("https://slack.com/api/auth.test", {
        headers: { Authorization: `Bearer ${config.accessToken}` },
      })
      const data = (await res.json()) as { ok: boolean; error?: string }
      if (!data.ok) return { valid: false, error: data.error ?? "Slack auth failed" }
      return { valid: true }
    } catch {
      return { valid: false, error: "Network error validating Slack token" }
    }
  }
}
