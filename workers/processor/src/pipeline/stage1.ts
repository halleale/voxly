import type { NormalizedFeedback } from "@voxly/types"

// Words that indicate a support/billing ticket, not product feedback
const BLOCKLIST = [
  "password reset",
  "reset my password",
  "forgot password",
  "billing",
  "invoice",
  "payment failed",
  "refund",
  "cancel subscription",
  "charge",
  "credit card",
]

const BOT_NAME_PATTERNS = [/bot$/i, /^bot/i, /webhook/i, /automation/i, /zapier/i, /integromat/i]

export interface Stage1Result {
  pass: boolean
  rejectReason?: string
}

export function runStage1(item: NormalizedFeedback): Stage1Result {
  const words = item.verbatimText.trim().split(/\s+/)
  if (words.length < 15) {
    return { pass: false, rejectReason: "too_short" }
  }

  if (item.authorName) {
    for (const pattern of BOT_NAME_PATTERNS) {
      if (pattern.test(item.authorName)) {
        return { pass: false, rejectReason: "bot_author" }
      }
    }
  }

  const textLower = item.verbatimText.toLowerCase()
  for (const phrase of BLOCKLIST) {
    if (textLower.includes(phrase)) {
      return { pass: false, rejectReason: `blocklist:${phrase}` }
    }
  }

  return { pass: true }
}
