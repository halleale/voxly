import type { PrismaClient } from "@voxly/db"
import { cosineSimilarity } from "@voxly/ai"
import { getOpenAI } from "@voxly/ai"

const ASSIGNMENT_THRESHOLD = 0.78

interface ThemeWithCentroid {
  id: string
  slug: string
  name: string
  centroid: number[] | null
}

// Fetch centroid vectors for all themes in a workspace via raw SQL
async function getThemesWithCentroids(
  prisma: PrismaClient,
  workspaceId: string
): Promise<ThemeWithCentroid[]> {
  const rows = await prisma.$queryRaw<
    Array<{ id: string; slug: string; name: string; centroid: string | null }>
  >`
    SELECT id, slug, name, centroid::text
    FROM themes
    WHERE workspace_id = ${workspaceId}
      AND is_proto = false
  `
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    centroid: r.centroid ? parsePgVector(r.centroid) : null,
  }))
}

// pgvector returns vectors as "[0.1,0.2,...]"
function parsePgVector(s: string): number[] {
  return s
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map(Number)
}

export async function assignTheme(
  prisma: PrismaClient,
  feedbackItemId: string,
  workspaceId: string
): Promise<void> {
  // Get the embedding for this item
  const embRow = await prisma.$queryRaw<Array<{ embedding: string | null }>>`
    SELECT embedding::text FROM feedback_items WHERE id = ${feedbackItemId}
  `
  const embStr = embRow[0]?.embedding
  if (!embStr) return

  const embedding = parsePgVector(embStr)
  const themes = await getThemesWithCentroids(prisma, workspaceId)

  let bestThemeId: string | null = null
  let bestScore = -1

  for (const theme of themes) {
    if (!theme.centroid) continue
    const score = cosineSimilarity(embedding, theme.centroid)
    if (score > bestScore) {
      bestScore = score
      bestThemeId = theme.id
    }
  }

  if (bestThemeId && bestScore >= ASSIGNMENT_THRESHOLD) {
    await prisma.feedbackItem.update({
      where: { id: feedbackItemId },
      data: { themeId: bestThemeId, themeConfidence: bestScore },
    })
    await prisma.theme.update({
      where: { id: bestThemeId },
      data: { itemCount: { increment: 1 }, lastActiveAt: new Date() },
    })
  } else {
    // Create proto-theme — awaits nightly HDBSCAN to be merged/named
    const protoSlug = `proto-${feedbackItemId.slice(-8)}`
    const proto = await prisma.theme.create({
      data: {
        workspaceId,
        slug: protoSlug,
        name: `Proto: ${protoSlug}`,
        isProto: true,
        itemCount: 1,
        lastActiveAt: new Date(),
      },
    })
    await prisma.feedbackItem.update({
      where: { id: feedbackItemId },
      data: { themeId: proto.id, themeConfidence: bestScore > 0 ? bestScore : null },
    })
    // Write proto centroid = item embedding
    const vector = `[${embedding.join(",")}]`
    await prisma.$executeRaw`
      UPDATE themes SET centroid = ${vector}::vector WHERE id = ${proto.id}
    `
  }
}
