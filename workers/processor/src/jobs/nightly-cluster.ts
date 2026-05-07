import type { Job } from "bullmq"
import type { PrismaClient } from "@voxly/db"
import type { NightlyClusterJob } from "@voxly/queue"
import { getOpenAI } from "@voxly/ai"

// Simplified nightly clustering:
// 1. Merge all proto-themes that are close to each other (cosine > 0.85)
// 2. Name any proto-themes that have >= 3 items using GPT-4o
// 3. Recalculate centroids for all real themes
// 4. Check for spikes vs. prior 7-day baseline
//
// Full HDBSCAN runs as a Python subprocess in Phase 3 when volume warrants it.

function parsePgVector(s: string): number[] {
  return s
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map(Number)
}

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb))
}

async function nameThemeWithGPT(items: string[]): Promise<{ name: string; slug: string }> {
  const client = getOpenAI()
  const sample = items.slice(0, 5).join("\n---\n")
  const res = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You name customer feedback theme clusters for a product intelligence tool.
Given a sample of feedback items, output a JSON object with:
- name: a concise 2-4 word theme name (e.g. "Mobile App Sync", "PDF Export Crashes")
- slug: kebab-case version (e.g. "mobile-app-sync")
Respond only with valid JSON.`,
      },
      { role: "user", content: `Feedback sample:\n${sample}` },
    ],
    max_tokens: 60,
    temperature: 0.3,
    response_format: { type: "json_object" },
  })
  try {
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}")
    return {
      name: parsed.name ?? "Unknown Theme",
      slug: parsed.slug ?? `theme-${Date.now()}`,
    }
  } catch {
    return { name: "Unknown Theme", slug: `theme-${Date.now()}` }
  }
}

export async function handleNightlyCluster(
  job: Job<NightlyClusterJob>,
  prisma: PrismaClient
) {
  const { workspaceId } = job.data

  // ── 1. Recalculate centroids for all real themes ──────────────────────────
  const realThemes = await prisma.theme.findMany({
    where: { workspaceId, isProto: false },
    select: { id: true },
  })

  for (const theme of realThemes) {
    const itemEmbeddings = await prisma.$queryRaw<Array<{ embedding: string | null }>>`
      SELECT embedding::text
      FROM feedback_items
      WHERE workspace_id = ${workspaceId}
        AND theme_id = ${theme.id}
        AND embedding IS NOT NULL
      LIMIT 500
    `
    const embeddings = itemEmbeddings
      .map((r) => (r.embedding ? parsePgVector(r.embedding) : null))
      .filter((e): e is number[] => e !== null)

    if (embeddings.length === 0) continue

    const dims = embeddings[0].length
    const centroid = new Array(dims).fill(0)
    for (const emb of embeddings) {
      for (let j = 0; j < dims; j++) centroid[j] += emb[j]
    }
    for (let j = 0; j < dims; j++) centroid[j] /= embeddings.length

    const vector = `[${centroid.join(",")}]`
    await prisma.$executeRaw`
      UPDATE themes SET centroid = ${vector}::vector WHERE id = ${theme.id}
    `
  }

  // ── 2. Promote proto-themes with >= 3 items ───────────────────────────────
  const protoThemes = await prisma.theme.findMany({
    where: { workspaceId, isProto: true, itemCount: { gte: 3 } },
    select: { id: true, itemCount: true },
  })

  for (const proto of protoThemes) {
    const items = await prisma.feedbackItem.findMany({
      where: { workspaceId, themeId: proto.id },
      select: { verbatimText: true },
      take: 5,
    })
    const { name, slug } = await nameThemeWithGPT(items.map((i) => i.verbatimText))

    // Ensure slug is unique
    const existing = await prisma.theme.findFirst({
      where: { workspaceId, slug },
      select: { id: true },
    })
    const finalSlug = existing ? `${slug}-${proto.id.slice(-4)}` : slug

    await prisma.theme.update({
      where: { id: proto.id },
      data: { name, slug: finalSlug, isProto: false },
    })
  }

  // ── 3. Merge proto-themes that are very similar ───────────────────────────
  const allProtos = await prisma.$queryRaw<Array<{ id: string; centroid: string | null }>>`
    SELECT id, centroid::text FROM themes
    WHERE workspace_id = ${workspaceId} AND is_proto = true AND centroid IS NOT NULL
  `
  const merged = new Set<string>()

  for (let i = 0; i < allProtos.length; i++) {
    if (merged.has(allProtos[i].id)) continue
    if (!allProtos[i].centroid) continue
    const centA = parsePgVector(allProtos[i].centroid!)

    for (let j = i + 1; j < allProtos.length; j++) {
      if (merged.has(allProtos[j].id)) continue
      if (!allProtos[j].centroid) continue
      const centB = parsePgVector(allProtos[j].centroid!)

      if (cosineSim(centA, centB) > 0.85) {
        // Merge j into i
        await prisma.feedbackItem.updateMany({
          where: { themeId: allProtos[j].id },
          data: { themeId: allProtos[i].id },
        })
        await prisma.theme.update({
          where: { id: allProtos[i].id },
          data: {
            itemCount: {
              increment: await prisma.feedbackItem.count({ where: { themeId: allProtos[j].id } }),
            },
          },
        })
        await prisma.theme.delete({ where: { id: allProtos[j].id } })
        merged.add(allProtos[j].id)
      }
    }
  }

  // ── 4. Spike detection ────────────────────────────────────────────────────
  const now = new Date()
  const last7 = new Date(now.getTime() - 7 * 86_400_000)
  const prior7start = new Date(now.getTime() - 14 * 86_400_000)

  const allThemeIds = await prisma.theme.findMany({
    where: { workspaceId, isProto: false },
    select: { id: true },
  })

  for (const { id } of allThemeIds) {
    const [recentCount, priorCount] = await Promise.all([
      prisma.feedbackItem.count({ where: { themeId: id, ingestedAt: { gte: last7 } } }),
      prisma.feedbackItem.count({ where: { themeId: id, ingestedAt: { gte: prior7start, lt: last7 } } }),
    ])
    const isSpiking = priorCount > 0 ? recentCount >= priorCount * 2 : recentCount >= 3
    await prisma.theme.update({ where: { id }, data: { isSpiking } })
  }
}
