#!/usr/bin/env tsx
/**
 * Seed the Stage 3 embedding classifier.
 *
 * Generates embeddings for the 100 positive and 100 negative example texts in
 * packages/ai/src/seeds.ts, computes a centroid for the positive class, and
 * stores it in system_config so the AI pipeline worker can load it at runtime.
 *
 * Run once after first deploy, and whenever you add new labeled examples:
 *   pnpm seed:classifier
 *
 * Requires OPENAI_API_KEY and DATABASE_URL to be set.
 */

import { PrismaClient } from "@prisma/client"
import { embed, computeCentroid } from "../packages/ai/src/index"
import { POSITIVE_EXAMPLES, NEGATIVE_EXAMPLES } from "../packages/ai/src/seeds"

const BATCH_SIZE = 20 // embed in batches to avoid rate-limit bursts

async function embedBatch(texts: string[]): Promise<number[][]> {
  const results: number[][] = []
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    console.log(`  Embedding ${i + 1}–${Math.min(i + BATCH_SIZE, texts.length)} / ${texts.length}...`)
    const embeddings = await Promise.all(batch.map((t) => embed(t)))
    results.push(...embeddings)
    // Brief pause between batches to stay within rate limits
    if (i + BATCH_SIZE < texts.length) {
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  return results
}

async function main() {
  const prisma = new PrismaClient()

  try {
    console.log(`\n🔵 Seeding classifier with ${POSITIVE_EXAMPLES.length} positive + ${NEGATIVE_EXAMPLES.length} negative examples\n`)

    console.log("Embedding positive (feedback) examples...")
    const posEmbeddings = await embedBatch(POSITIVE_EXAMPLES)
    const positiveCentroid = computeCentroid(posEmbeddings)

    console.log("\nEmbedding negative (noise) examples...")
    const negEmbeddings = await embedBatch(NEGATIVE_EXAMPLES)
    const negativeCentroid = computeCentroid(negEmbeddings)

    console.log("\nStoring centroids in system_config...")

    await prisma.$transaction([
      prisma.systemConfig.upsert({
        where: { key: "classifier.positive_centroid" },
        create: {
          key: "classifier.positive_centroid",
          value: { vector: positiveCentroid, count: posEmbeddings.length },
        },
        update: {
          value: { vector: positiveCentroid, count: posEmbeddings.length },
        },
      }),
      prisma.systemConfig.upsert({
        where: { key: "classifier.negative_centroid" },
        create: {
          key: "classifier.negative_centroid",
          value: { vector: negativeCentroid, count: negEmbeddings.length },
        },
        update: {
          value: { vector: negativeCentroid, count: negEmbeddings.length },
        },
      }),
    ])

    console.log("\n✅ Classifier seeded successfully.")
    console.log(`   Positive centroid: ${positiveCentroid.length} dimensions (${posEmbeddings.length} examples)`)
    console.log(`   Negative centroid: ${negativeCentroid.length} dimensions (${negEmbeddings.length} examples)`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
