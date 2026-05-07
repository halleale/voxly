import OpenAI from "openai"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ─── Embedding ────────────────────────────────────────────────────────────────

export async function embed(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text.slice(0, 8000),
  })
  const result = response.data[0]
  if (!result) throw new Error("OpenAI embedding returned no data")
  return result.embedding
}

// ─── Cosine similarity ────────────────────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0
    const bi = b[i] ?? 0
    dot += ai * bi
    magA += ai * ai
    magB += bi * bi
  }
  if (magA === 0 || magB === 0) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

// ─── Stage 3: embedding classifier ───────────────────────────────────────────

export type Stage3Result = "approved" | "uncertain" | "rejected"

/**
 * Cosine similarity vs. the positive feedback centroid.
 * Thresholds tuned against the 200-example seed set.
 */
export function runEmbeddingClassifier(
  embedding: number[],
  positiveCentroid: number[],
): { result: Stage3Result; score: number } {
  const score = cosineSimilarity(embedding, positiveCentroid)
  if (score > 0.85) return { result: "approved", score }
  if (score < 0.65) return { result: "rejected", score }
  return { result: "uncertain", score }
}

// ─── Stage 4: LLM classifier ─────────────────────────────────────────────────

export type LLMClassification = "feedback" | "not_feedback" | "uncertain"

const CLASSIFY_SYSTEM = `You are a classifier that determines whether text contains genuine product feedback.

Product feedback includes: feature requests, bug reports, usability complaints, praise for specific features, performance issues, integration requests, workflow problems, missing functionality, data quality issues.

NOT product feedback: billing questions, password resets, account access issues, spam, personal conversations, job inquiries, generic support noise, marketing messages.

Respond with exactly one word: "feedback", "not_feedback", or "uncertain".`

export async function classifyFeedback(text: string): Promise<LLMClassification> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: CLASSIFY_SYSTEM },
      { role: "user", content: text.slice(0, 4000) },
    ],
    temperature: 0,
    max_tokens: 10,
  })
  const raw = response.choices[0]?.message.content?.trim().toLowerCase() ?? "uncertain"
  if (raw === "feedback") return "feedback"
  if (raw === "not_feedback") return "not_feedback"
  return "uncertain"
}

// ─── Sentiment scoring ────────────────────────────────────────────────────────

const SENTIMENT_SYSTEM = `Rate the sentiment of this customer feedback on a scale from -1.0 (very negative) to +1.0 (very positive). 0.0 is neutral. Return only a decimal number, nothing else. Examples: -0.8, 0.3, -0.1, 0.9`

export async function scoreSentiment(text: string): Promise<number> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SENTIMENT_SYSTEM },
      { role: "user", content: text.slice(0, 4000) },
    ],
    temperature: 0,
    max_tokens: 10,
  })
  const raw = parseFloat(response.choices[0]?.message.content?.trim() ?? "0")
  return Math.max(-1, Math.min(1, isNaN(raw) ? 0 : raw))
}

// ─── Severity inference ───────────────────────────────────────────────────────

const SEVERITY_SYSTEM = `Classify the severity of this customer feedback.

HIGH: blocking issue, data loss, security concern, system outage, enterprise customer with strong negative sentiment, cannot complete core workflow.
MEDIUM: significant friction, important feature missing, moderate frustration, workaround exists but painful.
LOW: minor annoyance, nice-to-have, general suggestion, positive feedback with small improvement request.

Return exactly one word: "HIGH", "MEDIUM", or "LOW".`

export async function inferSeverity(
  text: string,
  customerTier?: string,
): Promise<"HIGH" | "MEDIUM" | "LOW"> {
  const tierNote =
    customerTier === "ENTERPRISE"
      ? "\n\nNote: This feedback is from an Enterprise customer — weight toward higher severity."
      : ""

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SEVERITY_SYSTEM + tierNote },
      { role: "user", content: text.slice(0, 4000) },
    ],
    temperature: 0,
    max_tokens: 10,
  })
  const raw = response.choices[0]?.message.content?.trim().toUpperCase()
  if (raw === "HIGH" || raw === "MEDIUM" || raw === "LOW") return raw
  return "MEDIUM"
}

// ─── AI summary card ──────────────────────────────────────────────────────────

export interface SummaryContext {
  authorName?: string
  customerName?: string
  customerTier?: string
  arrCents?: number
  sourceType?: string
  themeName?: string
}

function buildSummarySystem(ctx: SummaryContext): string {
  const parts: string[] = []
  if (ctx.customerName) {
    let who = ctx.customerName
    if (ctx.customerTier) who += ` (${ctx.customerTier}`
    if (ctx.arrCents) who += `, $${Math.round(ctx.arrCents / 100).toLocaleString()} ARR`
    if (ctx.customerTier) who += ")"
    parts.push(who)
  } else if (ctx.authorName) {
    parts.push(ctx.authorName)
  }
  const who = parts[0] ?? "A customer"
  const themeHint = ctx.themeName ? ` The feedback appears related to the theme "${ctx.themeName}".` : ""

  return `Generate a 1-2 sentence contextual summary of the following product feedback for a product manager.
Start with who reported it (${who}), describe the core issue or request specifically, and include any actionable context.${themeHint}
Keep it under 65 words. Be specific — name the exact feature or workflow affected.`
}

export async function generateSummary(
  verbatimText: string,
  ctx: SummaryContext,
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: buildSummarySystem(ctx) },
      { role: "user", content: verbatimText.slice(0, 6000) },
    ],
    temperature: 0.3,
    max_tokens: 120,
  })
  return response.choices[0]?.message.content?.trim() ?? verbatimText.slice(0, 200)
}

// ─── Centroid computation (used by seed script) ───────────────────────────────

/** Average a set of embedding vectors into a single centroid. */
export function computeCentroid(embeddings: number[][]): number[] {
  const first = embeddings[0]
  if (!first) return []
  const dim = first.length
  const centroid = new Array<number>(dim).fill(0)
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      centroid[i] = (centroid[i] ?? 0) + (emb[i] ?? 0)
    }
  }
  const n = embeddings.length
  return centroid.map((v) => (v ?? 0) / n)
}

// ─── Real-time theme assignment ───────────────────────────────────────────────

export interface ThemeCandidate {
  id: string
  centroid: number[]
}

/**
 * Find the nearest existing theme for a given embedding.
 * Returns themeId + confidence, or null if no theme exceeds the threshold.
 */
export function findNearestTheme(
  embedding: number[],
  themes: ThemeCandidate[],
  threshold = 0.78,
): { themeId: string | null; confidence: number } {
  let bestId: string | null = null
  let bestScore = -1

  for (const theme of themes) {
    if (theme.centroid.length === 0) continue
    const score = cosineSimilarity(embedding, theme.centroid)
    if (score > bestScore) {
      bestScore = score
      bestId = theme.id
    }
  }

  if (bestScore >= threshold) return { themeId: bestId, confidence: bestScore }
  return { themeId: null, confidence: bestScore }
}

// ─── Theme naming (GPT-4o) ────────────────────────────────────────────────────

export interface ThemeNameResult {
  name: string
  slug: string
  description: string
}

const THEME_NAME_SYSTEM = `You are naming a product-feedback theme cluster for a PM tool.
Given 3-10 sample feedback quotes, produce:
  - name: a 2-5 word human-readable label (Title Case)
  - slug: kebab-case version of the name (no special chars, max 40 chars)
  - description: one sentence describing the common pattern in the feedback (max 80 words)

Respond with valid JSON only: {"name":"...","slug":"...","description":"..."}`

export async function nameTheme(samples: string[]): Promise<ThemeNameResult> {
  const joined = samples
    .slice(0, 8)
    .map((s, i) => `${i + 1}. "${s.slice(0, 200)}"`)
    .join("\n")

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: THEME_NAME_SYSTEM },
      { role: "user", content: joined },
    ],
    temperature: 0.2,
    max_tokens: 150,
    response_format: { type: "json_object" },
  })

  const raw = response.choices[0]?.message.content ?? "{}"
  try {
    const parsed = JSON.parse(raw) as Partial<ThemeNameResult>
    return {
      name: parsed.name ?? "Untitled Theme",
      slug: (parsed.slug ?? "untitled-theme").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40),
      description: parsed.description ?? "",
    }
  } catch {
    return { name: "Untitled Theme", slug: "untitled-theme", description: "" }
  }
}
