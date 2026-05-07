import { prisma } from "@voxly/db"
import {
  createRedisConnection,
  createIngestionQueue,
  createAiPipelineQueue,
  Worker,
  QUEUE_NAMES,
  JOB_NAMES,
  type IngestItemPayload,
  type ProcessItemPayload,
} from "@voxly/queue"
import {
  connectorRegistry,
  stage1HardFilter,
  stage2SourceFilter,
} from "@voxly/connectors"
import type { ConnectorConfig, NormalizedFeedback } from "@voxly/types"

const redis = createRedisConnection()
const ingestionQueue = createIngestionQueue(redis)
const aiQueue = createAiPipelineQueue(redis)

// ─── Ingestion worker ─────────────────────────────────────────────────────────
// Receives raw webhook payloads, normalizes them, runs Stage 1/2 filters,
// persists to ingestion_queue, then enqueues PROCESS_ITEM for the AI pipeline.

const ingestionWorker = new Worker<IngestItemPayload>(
  QUEUE_NAMES.INGESTION,
  async (job) => {
    const { connectorId, workspaceId, externalId, rawPayload, sourceType } = job.data

    // Load connector for config (allowedChannels, etc.)
    const connector = await prisma.connector.findUnique({ where: { id: connectorId } })
    if (!connector || !connector.enabled) {
      job.log(`Connector ${connectorId} not found or disabled — skipping`)
      return
    }

    const adapter = connectorRegistry[sourceType]
    if (!adapter) {
      job.log(`No adapter registered for source type ${sourceType}`)
      return
    }

    const config = connector.configJson as ConnectorConfig
    const items: (NormalizedFeedback & { channelId?: string })[] =
      adapter.normalize(rawPayload, config) as (NormalizedFeedback & { channelId?: string })[]

    for (const item of items) {
      // Stage 1: hard filters
      const s1 = stage1HardFilter(item)
      if (!s1.pass) {
        job.log(`Stage 1 reject [${item.externalId}]: ${s1.reason}`)
        await prisma.ingestionQueue.upsert({
          where: { connectorId_externalId: { connectorId, externalId: item.externalId } },
          create: {
            connectorId,
            externalId: item.externalId,
            rawPayload: item.rawPayload as object,
            sourceType: item.sourceType,
            status: "REJECTED",
            rejectReason: s1.reason,
            processedAt: new Date(),
          },
          update: {
            status: "REJECTED",
            rejectReason: s1.reason,
            processedAt: new Date(),
          },
        })
        continue
      }

      // Stage 2: source-specific rules
      const s2 = stage2SourceFilter(item, config)
      if (!s2.pass) {
        job.log(`Stage 2 reject [${item.externalId}]: ${s2.reason}`)
        await prisma.ingestionQueue.upsert({
          where: { connectorId_externalId: { connectorId, externalId: item.externalId } },
          create: {
            connectorId,
            externalId: item.externalId,
            rawPayload: item.rawPayload as object,
            sourceType: item.sourceType,
            status: "REJECTED",
            rejectReason: s2.reason,
            processedAt: new Date(),
          },
          update: {
            status: "REJECTED",
            rejectReason: s2.reason,
            processedAt: new Date(),
          },
        })
        continue
      }

      // Passes Stage 1/2 — persist as PENDING for the AI pipeline
      let queueRecord
      try {
        queueRecord = await prisma.ingestionQueue.create({
          data: {
            connectorId,
            externalId: item.externalId,
            rawPayload: item.rawPayload as object,
            sourceType: item.sourceType,
            status: "PENDING",
          },
        })
      } catch (err: unknown) {
        // Unique constraint violation = duplicate; silently skip
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes("Unique constraint")) {
          job.log(`Duplicate item [${item.externalId}] — skipping`)
          continue
        }
        throw err
      }

      // Enqueue for AI pipeline (Chunk 4)
      await aiQueue.add(JOB_NAMES.PROCESS_ITEM, { ingestionQueueId: queueRecord.id })
      job.log(`Queued for AI pipeline: ${queueRecord.id}`)
    }

    // Update connector item count + last activity
    await prisma.connector.update({
      where: { id: connectorId },
      data: {
        status: "ACTIVE",
        errorMessage: null,
      },
    })
  },
  { connection: redis, concurrency: 10 },
)

// ─── AI pipeline worker (stub for Chunk 4) ────────────────────────────────────
// For now: promotes PENDING items to APPROVED and creates FeedbackItem stubs.

const aiWorker = new Worker<ProcessItemPayload>(
  QUEUE_NAMES.AI_PIPELINE,
  async (job) => {
    const { ingestionQueueId } = job.data

    const queueItem = await prisma.ingestionQueue.findUnique({
      where: { id: ingestionQueueId },
      include: { connector: true },
    })

    if (!queueItem || queueItem.status !== "PENDING") return

    // Stub: auto-approve everything until Chunk 4 adds the real classifier
    await prisma.ingestionQueue.update({
      where: { id: ingestionQueueId },
      data: { status: "APPROVED", processedAt: new Date() },
    })

    // Create feedback item from normalized data (skip if already exists)
    const raw = queueItem.rawPayload as Record<string, unknown>

    const existing = await prisma.feedbackItem.findFirst({
      where: { connectorId: queueItem.connectorId, externalId: queueItem.externalId },
      select: { id: true },
    })

    if (!existing) {
      await prisma.feedbackItem.create({
        data: {
          workspaceId: queueItem.connector.workspaceId,
          connectorId: queueItem.connectorId,
          verbatimText: (raw.verbatimText as string) ?? "",
          authorName:   raw.authorName   as string | undefined,
          authorEmail:  raw.authorEmail  as string | undefined,
          authorUrl:    raw.authorUrl    as string | undefined,
          sourceType:   queueItem.sourceType,
          externalId:   queueItem.externalId,
          externalUrl:  raw.externalUrl  as string | undefined,
          publishedAt:  raw.publishedAt ? new Date(raw.publishedAt as string) : new Date(),
          rawPayload:   queueItem.rawPayload ?? undefined,
          status:       "NEW",
        },
      })

      // Bump connector item count only for net-new items
      await prisma.connector.update({
        where: { id: queueItem.connectorId },
        data: { itemCount: { increment: 1 } },
      })
    }

    job.log(`Processed feedback item for ${queueItem.externalId}`)
  },
  { connection: redis, concurrency: 5 },
)

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown() {
  console.log("Shutting down workers...")
  await ingestionWorker.close()
  await aiWorker.close()
  await redis.quit()
  await prisma.$disconnect()
  process.exit(0)
}

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)

ingestionWorker.on("failed", (job, err) => {
  console.error(`Ingestion job ${job?.id} failed:`, err)
})

aiWorker.on("failed", (job, err) => {
  console.error(`AI pipeline job ${job?.id} failed:`, err)
})

console.log("Voxly processor worker started")
