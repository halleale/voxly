import { getOpenAI } from "./client"

interface SummaryContext {
  verbatimText: string
  authorName?: string
  customerName?: string
  customerTier?: string
  arrCents?: number
  themeName?: string
  sourceType?: string
  sentiment?: number
}

const SYSTEM_PROMPT = `You write concise AI summary cards for a product feedback intelligence tool.
Given feedback and context, write 1-2 sentences that synthesize the key insight for a product manager.
Include the customer name/tier, what the problem or request is, and which theme it belongs to if known.
Be direct and specific. Do not start with "This feedback" or "The customer". Write in present tense.`

export async function generateSummary(ctx: SummaryContext): Promise<string> {
  const client = getOpenAI()

  const contextLines = [
    ctx.authorName ? `Author: ${ctx.authorName}` : "",
    ctx.customerName ? `Company: ${ctx.customerName}` : "",
    ctx.customerTier ? `Tier: ${ctx.customerTier}` : "",
    ctx.arrCents ? `ARR: $${Math.round(ctx.arrCents / 100).toLocaleString()}` : "",
    ctx.themeName ? `Theme: #${ctx.themeName}` : "",
    ctx.sourceType ? `Source: ${ctx.sourceType}` : "",
    ctx.sentiment !== undefined ? `Sentiment: ${ctx.sentiment.toFixed(2)}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  const userContent = `Context:\n${contextLines}\n\nFeedback:\n${ctx.verbatimText.slice(0, 6000)}`

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    max_tokens: 120,
    temperature: 0.3,
  })

  return response.choices[0]?.message?.content?.trim() ?? ""
}
