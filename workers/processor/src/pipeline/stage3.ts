import { embedText, cosineSimilarity } from "@voxly/ai"
import { FEEDBACK_EXAMPLES } from "@voxly/ai"

// Centroid is computed lazily from FEEDBACK_EXAMPLES on first call.
// In production, this is stored in Redis after bootstrapClassifierCentroid() runs on workspace init.
let centroidCache: number[] | null = null

async function getFeedbackCentroid(): Promise<number[]> {
  if (centroidCache) return centroidCache

  // Compute centroid from seed examples (batched to avoid rate limits)
  const { embedBatch } = await import("@voxly/ai")
  const batchSize = 20
  const allEmbeddings: number[][] = []
  for (let i = 0; i < FEEDBACK_EXAMPLES.length; i += batchSize) {
    const batch = FEEDBACK_EXAMPLES.slice(i, i + batchSize)
    const embeddings = await embedBatch(batch)
    allEmbeddings.push(...embeddings)
  }

  const dims = allEmbeddings[0].length
  const centroid = new Array(dims).fill(0)
  for (const emb of allEmbeddings) {
    for (let j = 0; j < dims; j++) {
      centroid[j] += emb[j]
    }
  }
  for (let j = 0; j < dims; j++) {
    centroid[j] /= allEmbeddings.length
  }

  centroidCache = centroid
  return centroid
}

export type Stage3Decision = "PASS" | "UNCERTAIN" | "REJECT"

export interface Stage3Result {
  decision: Stage3Decision
  score: number
  embedding: number[]
}

const PASS_THRESHOLD = 0.85
const REJECT_THRESHOLD = 0.65

export async function runStage3(text: string): Promise<Stage3Result> {
  const [embedding, centroid] = await Promise.all([
    embedText(text),
    getFeedbackCentroid(),
  ])

  const score = cosineSimilarity(embedding, centroid)

  let decision: Stage3Decision
  if (score >= PASS_THRESHOLD) {
    decision = "PASS"
  } else if (score >= REJECT_THRESHOLD) {
    decision = "UNCERTAIN"
  } else {
    decision = "REJECT"
  }

  return { decision, score, embedding }
}
