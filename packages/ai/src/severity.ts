import { getOpenAI } from "./client"

interface SeverityContext {
  text: string
  sentiment?: number
  customerTier?: string
  arrCents?: number
}

const SYSTEM_PROMPT = `Classify the severity of this customer feedback as: high, medium, or low.

HIGH: Data loss, product completely broken, blocks core workflow, or from an enterprise customer with strong negative sentiment.
MEDIUM: Significant friction, important feature missing, moderate impact on workflow.
LOW: Minor annoyance, cosmetic issue, nice-to-have request, or positive feedback.

Return exactly one word: high, medium, or low.`

export async function inferSeverity(ctx: SeverityContext): Promise<"HIGH" | "MEDIUM" | "LOW"> {
  // Enterprise + negative = bump to high without calling LLM
  if (
    ctx.customerTier === "ENTERPRISE" &&
    ctx.sentiment !== undefined &&
    ctx.sentiment < -0.5
  ) {
    return "HIGH"
  }

  const client = getOpenAI()
  const contextStr = [
    ctx.customerTier ? `Customer tier: ${ctx.customerTier}` : "",
    ctx.arrCents ? `ARR: $${Math.round(ctx.arrCents / 100).toLocaleString()}` : "",
    ctx.sentiment !== undefined ? `Sentiment score: ${ctx.sentiment.toFixed(2)}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  const userContent = contextStr ? `${contextStr}\n\nFeedback:\n${ctx.text.slice(0, 4000)}` : ctx.text.slice(0, 4000)

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    max_tokens: 10,
    temperature: 0,
  })

  const raw = response.choices[0]?.message?.content?.trim().toLowerCase() ?? "low"
  if (raw === "high") return "HIGH"
  if (raw === "medium") return "MEDIUM"
  return "LOW"
}
