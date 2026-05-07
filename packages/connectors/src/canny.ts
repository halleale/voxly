import { createHmac, timingSafeEqual } from "crypto"
import type { ConnectorAdapter } from "./adapter"
import type { NormalizedFeedback, ConnectorConfig } from "@voxly/types"
import { SourceType } from "@voxly/types"

// Canny webhook event types we ingest
const ALLOWED_EVENTS = new Set([
  "post.created",
  "post.updated",
  "vote.created",
  "comment.created",
])

interface CannyAuthor {
  id: string
  name?: string
  email?: string
  url?: string
}

interface CannyPost {
  id: string
  title: string
  details?: string
  url: string
  score: number            // vote count
  author?: CannyAuthor
  created?: string
}

interface CannyComment {
  id: string
  value: string
  url?: string
  author?: CannyAuthor
  created?: string
  post?: CannyPost
}

interface CannyWebhookPayload {
  type: string
  object: "post" | "vote" | "comment"
  created: string
  post?: CannyPost
  comment?: CannyComment
  voter?: CannyAuthor
}

/**
 * Verify Canny webhook HMAC-SHA256 signature.
 * Header: X-Canny-Signature  (hex digest)
 */
export function verifyCannySignature(
  apiKey: string,
  rawBody: Buffer,
  signature: string,
): boolean {
  const expected = createHmac("sha256", apiKey)
    .update(rawBody)
    .digest("hex")
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

export const cannyConnector: ConnectorAdapter = {
  type: SourceType.CANNY,

  normalize(raw: unknown, _config: ConnectorConfig): NormalizedFeedback[] {
    const payload = raw as CannyWebhookPayload

    if (!ALLOWED_EVENTS.has(payload.type)) return []

    const publishedAt = new Date(payload.created)

    if (payload.type === "post.created" || payload.type === "post.updated") {
      const post = payload.post
      if (!post) return []

      const text = [post.title, post.details].filter(Boolean).join("\n\n").trim()
      if (!text) return []

      return [
        {
          externalId:   post.id,
          externalUrl:  post.url,
          verbatimText: text,
          authorName:   post.author?.name,
          authorEmail:  post.author?.email,
          authorUrl:    post.author?.url,
          sourceType:   SourceType.CANNY,
          publishedAt,
          rawPayload:   raw,
        },
      ]
    }

    if (payload.type === "comment.created") {
      const comment = payload.comment
      if (!comment?.value) return []

      return [
        {
          externalId:   comment.id,
          externalUrl:  comment.url ?? comment.post?.url,
          verbatimText: comment.value,
          authorName:   comment.author?.name,
          authorEmail:  comment.author?.email,
          sourceType:   SourceType.CANNY,
          publishedAt:  comment.created ? new Date(comment.created) : publishedAt,
          rawPayload:   raw,
        },
      ]
    }

    if (payload.type === "vote.created") {
      // A vote itself isn't feedback text, but when vote count is high it's a signal.
      // We surface the post title + details with vote count in rawPayload.
      const post = payload.post
      if (!post || !post.title) return []

      const text = [post.title, post.details].filter(Boolean).join("\n\n").trim()
      if (!text) return []

      return [
        {
          externalId:   `vote:${post.id}:${payload.created}`,
          externalUrl:  post.url,
          verbatimText: text,
          authorName:   payload.voter?.name,
          authorEmail:  payload.voter?.email,
          sourceType:   SourceType.CANNY,
          publishedAt,
          rawPayload:   raw,
        },
      ]
    }

    return []
  },

  async setupWebhook(_connectorId: string, _config: ConnectorConfig): Promise<void> {
    // Canny webhooks are configured in Settings → API → Webhooks in the Canny dashboard.
  },

  async validate(config: ConnectorConfig): Promise<{ valid: boolean; error?: string }> {
    if (!config.accessToken) return { valid: false, error: "Missing Canny API key" }
    return { valid: true }
  },
}
