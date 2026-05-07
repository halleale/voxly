import type { Job, Queue } from "bullmq"
import type { PrismaClient } from "@voxly/db"
import type { ProcessItemJob, AiPipelineJob } from "@voxly/queue"
import { JOB_AI_PIPELINE } from "@voxly/queue"
import { runStage3 } from "../pipeline/stage3"
import { runStage4 } from "../pipeline/stage4"

export async function handleProcessItem(
  job: Job<ProcessItemJob>,
  prisma: PrismaClient,
  aiQueue: Queue
) {
  const { ingestionQueueId, workspaceId } = job.data

  const queued = await prisma.ingestionQueue.findUnique({
    where: { id: ingestionQueueId },
    include: { connector: true },
  })
  if (!queued || queued.status !== "PENDING") return

  const raw = queued.rawPayload as Record<string, unknown>
  const text = (raw.verbatimText as string) ?? ""

  // ── Stage 3: embedding classifier ────────────────────────────────────────
  const s3 = await runStage3(text)

  if (s3.decision === "REJECT") {
    await prisma.ingestionQueue.update({
      where: { id: ingestionQueueId },
      data: {
        status: "REJECTED",
        rejectReason: `stage3:score=${s3.score.toFixed(3)}`,
        processedAt: new Date(),
      },
    })
    return
  }

  // ── Stage 4: LLM classifier for uncertain items ───────────────────────────
  let finalDecision: "APPROVED" | "REJECTED" | "UNCERTAIN" = "APPROVED"
  if (s3.decision === "UNCERTAIN") {
    finalDecision = await runStage4(text)
  }

  await prisma.ingestionQueue.update({
    where: { id: ingestionQueueId },
    data: {
      status: finalDecision,
      processedAt: new Date(),
    },
  })

  if (finalDecision === "REJECTED") return
  if (finalDecision === "UNCERTAIN") {
    // Surface in Inbox — create feedback item with status NEW but flag it for review
    // We create the item so it appears in Inbox; the inbox UI shows UNCERTAIN items
  }

  // ── Create feedback_item ──────────────────────────────────────────────────
  const existingItem = await prisma.feedbackItem.findFirst({
    where: { connectorId: queued.connectorId, externalId: queued.externalId },
    select: { id: true },
  })
  if (existingItem) return

  const feedbackItem = await prisma.feedbackItem.create({
    data: {
      workspaceId,
      connectorId: queued.connectorId,
      verbatimText: text,
      authorName: raw.authorName as string | undefined,
      authorEmail: raw.authorEmail as string | undefined,
      authorUrl: raw.authorUrl as string | undefined,
      sourceType: queued.sourceType,
      externalId: queued.externalId,
      externalUrl: raw.externalUrl as string | undefined,
      publishedAt: raw.publishedAt ? new Date(raw.publishedAt as string) : undefined,
      rawPayload: queued.rawPayload as object,
      relevanceScore: s3.score,
      status: "NEW",
    },
  })

  // Store the embedding via raw SQL (pgvector column not in Prisma model)
  const vector = `[${s3.embedding.join(",")}]`
  await prisma.$executeRaw`
    UPDATE feedback_items
    SET embedding = ${vector}::vector
    WHERE id = ${feedbackItem.id}
  `

  await prisma.connector.update({
    where: { id: queued.connectorId },
    data: { itemCount: { increment: 1 } },
  })

  const aiJob: AiPipelineJob = { feedbackItemId: feedbackItem.id, workspaceId }
  await aiQueue.add(JOB_AI_PIPELINE, aiJob)
}
