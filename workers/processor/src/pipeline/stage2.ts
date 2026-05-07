import type { NormalizedFeedback, SourceType } from "@voxly/types"
import type { ConnectorConfig } from "@voxly/types"

export interface Stage2Result {
  pass: boolean
  rejectReason?: string
}

export function runStage2(
  item: NormalizedFeedback,
  config: ConnectorConfig
): Stage2Result {
  switch (item.sourceType as SourceType) {
    case "SLACK":
      return checkSlack(item, config)
    case "ZENDESK":
      return checkZendesk(item, config)
    case "INTERCOM":
      return checkIntercom(item, config)
    case "REDDIT":
      return checkReddit(item, config)
    // G2, TRUSTRADIUS, HN are pre-filtered by their APIs — always pass
    case "G2":
    case "TRUSTRADIUS":
    case "HN":
    case "CANNY":
    case "GONG":
    case "API":
      return { pass: true }
    default:
      return { pass: true }
  }
}

function checkSlack(item: NormalizedFeedback, config: ConnectorConfig): Stage2Result {
  const allowedChannels = (config.settings?.allowedChannels as string[]) ?? []
  if (allowedChannels.length === 0) return { pass: true }

  const channel = (item.rawPayload as Record<string, unknown>)?.channel as string | undefined
  if (channel && !allowedChannels.includes(channel)) {
    return { pass: false, rejectReason: "slack:channel_not_in_allowlist" }
  }
  return { pass: true }
}

function checkZendesk(item: NormalizedFeedback, config: ConnectorConfig): Stage2Result {
  const raw = item.rawPayload as Record<string, unknown>
  const ticketType = raw?.ticket_type as string | undefined
  const tags = (raw?.tags as string[]) ?? []

  const allowedTypes = ["question", "problem"]
  if (ticketType && !allowedTypes.includes(ticketType)) {
    return { pass: false, rejectReason: "zendesk:ticket_type_not_feedback" }
  }

  const billingTags = ["billing", "payment", "invoice", "refund"]
  if (tags.some((t) => billingTags.includes(t.toLowerCase()))) {
    return { pass: false, rejectReason: "zendesk:billing_tag" }
  }

  return { pass: true }
}

function checkIntercom(item: NormalizedFeedback, config: ConnectorConfig): Stage2Result {
  const raw = item.rawPayload as Record<string, unknown>
  const conversationType = raw?.type as string | undefined

  if (conversationType === "bot") {
    return { pass: false, rejectReason: "intercom:bot_conversation" }
  }
  return { pass: true }
}

function checkReddit(item: NormalizedFeedback, config: ConnectorConfig): Stage2Result {
  const keywords = (config.settings?.keywords as string[]) ?? []
  if (keywords.length === 0) return { pass: true }

  const searchText = `${item.verbatimText} ${(item.rawPayload as Record<string, unknown>)?.title ?? ""}`.toLowerCase()
  const matched = keywords.some((kw) => searchText.includes(kw.toLowerCase()))
  if (!matched) {
    return { pass: false, rejectReason: "reddit:no_keyword_match" }
  }
  return { pass: true }
}
