import type { ConnectorAdapter } from "./adapter"
import type { ConnectorConfig, NormalizedFeedback } from "@voxly/types"
import { SourceType } from "@voxly/types"

interface IntercomContact {
  id: string
  email?: string
  name?: string
}

interface IntercomConversationPart {
  body: string
  type: string
  author?: { type: string; email?: string; name?: string }
  created_at: number
}

interface IntercomConversationPayload {
  type: string // "notification_event"
  topic: string // "conversation.created" | "conversation.user.replied"
  data: {
    item: {
      id: string
      source?: { body?: string; author?: IntercomContact }
      conversation_parts?: { conversation_parts: IntercomConversationPart[] }
      contacts?: { contacts: IntercomContact[] }
      created_at: number
      updated_at: number
    }
  }
}

export class IntercomAdapter implements ConnectorAdapter {
  readonly type = SourceType.INTERCOM

  normalize(raw: unknown, _config: ConnectorConfig): NormalizedFeedback[] {
    const payload = raw as IntercomConversationPayload
    const item = payload.data?.item
    if (!item) return []

    const results: NormalizedFeedback[] = []

    // Ingest the opening message if present
    if (item.source?.body) {
      const text = stripHtml(item.source.body)
      if (text) {
        const contact = item.source.author
        results.push({
          externalId: `intercom:${item.id}:opening`,
          externalUrl: `https://app.intercom.com/a/conversations/${item.id}`,
          verbatimText: text,
          authorName: contact?.name,
          authorEmail: contact?.email,
          sourceType: SourceType.INTERCOM,
          publishedAt: new Date(item.created_at * 1000),
          rawPayload: raw,
        })
      }
    }

    // Ingest user replies from conversation parts
    const parts = item.conversation_parts?.conversation_parts ?? []
    for (const part of parts) {
      if (part.author?.type !== "user") continue
      const text = stripHtml(part.body)
      if (!text) continue
      results.push({
        externalId: `intercom:${item.id}:${part.created_at}`,
        externalUrl: `https://app.intercom.com/a/conversations/${item.id}`,
        verbatimText: text,
        authorName: part.author.name,
        authorEmail: part.author.email,
        sourceType: SourceType.INTERCOM,
        publishedAt: new Date(part.created_at * 1000),
        rawPayload: raw,
      })
    }

    return results
  }

  async validate(config: ConnectorConfig): Promise<{ valid: boolean; error?: string }> {
    if (!config.accessToken) {
      return { valid: false, error: "Missing Intercom access token" }
    }
    try {
      const res = await fetch("https://api.intercom.io/me", {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          Accept: "application/json",
        },
      })
      if (!res.ok) return { valid: false, error: "Intercom auth failed" }
      return { valid: true }
    } catch {
      return { valid: false, error: "Network error validating Intercom token" }
    }
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}
