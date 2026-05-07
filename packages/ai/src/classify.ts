import { getOpenAI } from "./client"

export type ClassifyResult = "feedback" | "not_feedback" | "uncertain"

const SYSTEM_PROMPT = `You are a feedback classifier for a B2B SaaS product intelligence tool.
Classify whether the given text is product feedback from a customer.

FEEDBACK: Opinions, feature requests, bug reports, complaints, praise, or suggestions about a software product.
NOT_FEEDBACK: Password resets, billing questions, account issues, spam, sales outreach, internal team messages, or irrelevant content.
UNCERTAIN: Could go either way, or contains mixed content.

Respond with exactly one word: feedback, not_feedback, or uncertain.`

export async function classifyFeedback(text: string): Promise<ClassifyResult> {
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

  const raw = response.choices[0]?.message?.content?.trim().toLowerCase() ?? "uncertain"
  if (raw === "feedback") return "feedback"
  if (raw === "not_feedback") return "not_feedback"
  return "uncertain"
}
