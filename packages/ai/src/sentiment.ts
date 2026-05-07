import { getOpenAI } from "./client"

const SYSTEM_PROMPT = `Score the sentiment of this customer feedback on a scale from -1.0 (very negative) to +1.0 (very positive).
0.0 is neutral. Return only a decimal number, nothing else. Examples: -0.8, 0.0, 0.6`

export async function scoreSentiment(text: string): Promise<number> {
  const client = getOpenAI()
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text.slice(0, 4000) },
    ],
    max_tokens: 10,
    temperature: 0,
  })

  const raw = response.choices[0]?.message?.content?.trim() ?? "0"
  const score = parseFloat(raw)
  if (isNaN(score)) return 0
  return Math.max(-1, Math.min(1, score))
}
