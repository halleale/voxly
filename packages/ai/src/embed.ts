import { getOpenAI } from "./client"

const EMBED_MODEL = "text-embedding-3-small"
const EMBED_DIMS = 1536

export async function embedText(text: string): Promise<number[]> {
  const client = getOpenAI()
  const response = await client.embeddings.create({
    model: EMBED_MODEL,
    input: text.slice(0, 8000), // model limit guard
    dimensions: EMBED_DIMS,
  })
  return response.data[0].embedding
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const client = getOpenAI()
  const response = await client.embeddings.create({
    model: EMBED_MODEL,
    input: texts.map((t) => t.slice(0, 8000)),
    dimensions: EMBED_DIMS,
  })
  return response.data.map((d) => d.embedding)
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}
