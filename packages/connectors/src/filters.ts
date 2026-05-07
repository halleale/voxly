import type { NormalizedFeedback, ConnectorConfig } from "@voxly/types"
import { SourceType } from "@voxly/types"

export interface FilterResult {
  pass: boolean
  reason?: string
}

// Words/phrases that indicate non-product-feedback (billing, auth noise)
const BLOCKLIST = [
  "password reset",
  "forgot password",
  "reset my password",
  "billing",
  "invoice",
  "payment failed",
  "subscription",
  "refund",
  "charge",
  "credit card",
  "unsubscribe",
  "spam",
]

/**
 * Stage 1: Sync, free hard filters applied to every item from every source.
 */
export function stage1HardFilter(item: NormalizedFeedback): FilterResult {
  const text = item.verbatimText.trim()

  // Too short to be meaningful feedback
  const wordCount = text.split(/\s+/).filter(Boolean).length
  if (wordCount < 15) {
    return { pass: false, reason: "too_short" }
  }

  // Blocklist match (case-insensitive)
  const lower = text.toLowerCase()
  for (const term of BLOCKLIST) {
    if (lower.includes(term)) {
      return { pass: false, reason: `blocklist:${term}` }
    }
  }

  return { pass: true }
}

/**
 * Stage 2: Source-specific rules — sync, free.
 * Each source type has its own filter logic.
 */
export function stage2SourceFilter(
  item: NormalizedFeedback & { channelId?: string },
  config: ConnectorConfig,
): FilterResult {
  switch (item.sourceType) {
    case SourceType.SLACK: {
      // Only ingest from explicitly allowed channels
      const allowedChannels = (config.settings?.allowedChannels as string[] | undefined) ?? []
      if (allowedChannels.length > 0 && item.channelId) {
        if (!allowedChannels.includes(item.channelId)) {
          return { pass: false, reason: "channel_not_allowlisted" }
        }
      }
      return { pass: true }
    }

    case SourceType.ZENDESK: {
      // Only product-related ticket types
      const ticketType = (config.settings?.ticketType as string | undefined) ?? ""
      const allowed = ["question", "problem", ""]
      if (!allowed.includes(ticketType)) {
        return { pass: false, reason: "zendesk_wrong_ticket_type" }
      }
      return { pass: true }
    }

    case SourceType.REDDIT: {
      // Must match product name keyword
      const keywords = (config.settings?.keywords as string[] | undefined) ?? []
      if (keywords.length > 0) {
        const lower = item.verbatimText.toLowerCase()
        const hasKeyword = keywords.some((kw) => lower.includes(kw.toLowerCase()))
        if (!hasKeyword) {
          return { pass: false, reason: "reddit_no_keyword_match" }
        }
      }
      return { pass: true }
    }

    case SourceType.GONG: {
      // Only ingest customer speech, not rep speech
      // speakerRole is set by the Gong adapter after GPT-4o extraction
      const speakerRole = (item as NormalizedFeedback & { speakerRole?: string }).speakerRole
      if (speakerRole && speakerRole !== "customer") {
        return { pass: false, reason: "gong_rep_speech" }
      }
      return { pass: true }
    }

    case SourceType.CANNY: {
      // Allow all post/comment/vote events — vote events carry post text so
      // Stage 3 relevance will handle noise
      return { pass: true }
    }

    case SourceType.HN: {
      // Already keyword-filtered by Algolia; always pass Stage 2
      return { pass: true }
    }

    case SourceType.G2:
    case SourceType.TRUSTRADIUS:
      // Vendor API results are pre-filtered; always pass
      return { pass: true }

    default:
      return { pass: true }
  }
}
