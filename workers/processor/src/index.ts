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
import {
  embed,
  runEmbeddingClassifier,
  classifyFeedback,
  scoreSentiment,
  inferSeverity,
  generateSummary,
  type SummaryContext,
} from "@voxly/ai"
import type { ConnectorConfig, NormalizedFeedback } from "@voxly/types"

const redis = createRedisConnection()
const ingestionQueue = createIngestionQueue(redis)
const aiQueue = createAiPipelineQueue(redis)

// ─── Classifier centroid cache ────────────────────────────────────────────────
// Loaded from system_config on startup; refreshed hourly.
// Absence = classifier not seeded yet → fall back to Stage 4 for all items.

let positiveCentroid: number[] | null = null
let centroidLoadedAt = 0
const CENTROID_TTL_MS = 60 * 60 * 1000

async function getPositiveCentroid(): Promise<number[] | null> {
  if (positiveCentroid && Date.now() - centroidLoadedAt < CENTROID_TTL_MS) {
    return positiveCentroid
  }
  const row = await prisma.systemConfig.findUnique({
    where: { key: "classifier.positive_centroid" },
  })
  if (!row) return null
  const data = row.value as { vector: number[] }
  positiveCentroid = data.vector
  centroidLoadedAt = Date.now()
  return positiveCentroid
}

// ─── Ingestion worker ─────────────────────────────────────────────────────────

const ingestionWorker = new Worker<IngestItemPayload>(
  QUEUE_NAMES.INGESTION,
  async (job) => {
    const { connectorId, workspaceId, externalId, rawPayload, sourceType } = job.data

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
          update: { status: "REJECTED", rejectReason: s1.reason, processedAt: new Date() },
        })
        continue
      }

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
          update: { status: "REJECTED", rejectReason: s2.reason, processedAt: new Date() },
        })
        continue
      }

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
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes("Unique constraint")) {
          job.log(`Duplicate item [${item.externalId}] — skipping`)
          continue
        }
        throw err
      }

      await aiQueue.add(JOB_NAMES.PROCESS_ITEM, { ingestionQueueId: queueRecord.id })
      job.log(`Queued for AI pipeline: ${queueRecord.id}`)
    }

    await prisma.connector.update({
      where: { id: connectorId },
      data: { status: "ACTIVE", errorMessage: null },
    })
  },
  { connection: redis, concurrency: 10 },
)

// ─── AI pipeline worker ───────────────────────────────────────────────────────

const aiWorker = new Worker<ProcessItemPayload>(
  QUEUE_NAMES.AI_PIPELINE,
  async (job) => {
    const { ingestionQueueId } = job.data

    const queueItem = await prisma.ingestionQueue.findUnique({
      where: { id: ingestionQueueId },
      include: { connector: true },
    })

    if (!queueItem || queueItem.status !== "PENDING") return

    const raw = queueItem.rawPayload as Record<string, unknown>
    const verbatimText = (raw.verbatimText as string | undefined) ?? ""

    if (!verbatimText.trim()) {
      await prisma.ingestionQueue.update({
        where: { id: ingestionQueueId },
        data: { status: "REJECTED", rejectReason: "empty_text", processedAt: new Date() },
      })
      return
    }

    // ── Stage 3: embedding classifier ──────────────────────────────────────
    let stage3Result: "approved" | "uncertain" | "rejected" = "uncertain"
    let relevanceScore: number | undefined

    const centroid = await getPositiveCentroid()

    if (centroid) {
      job.log("Stage 3: running embedding classifier")
      const embedding = await embed(verbatimText)
      const { result, score } = runEmbeddingClassifier(embedding, centroid)
      stage3Result = result
      relevanceScore = score
      job.log(`Stage 3: ${result} (score=${score.toFixed(4)})`)

      if (result === "rejected") {
        await prisma.ingestionQueue.update({
          where: { id: ingestionQueueId },
          data: { status: "REJECTED", rejectReason: `stage3:${score.toFixed(4)}`, processedAt: new Date() },
        })
        return
      }

      if (result === "approved") {
        // Skip Stage 4 — proceed directly to AI enrichment
        await runAiPipeline(job, queueItem, raw, verbatimText, relevanceScore, embedding)
        return
      }

      // result === "uncertain" → fall through to Stage 4
    } else {
      job.log("Stage 3: no centroid available, skipping to Stage 4")
    }

    // ── Stage 4: LLM classifier ─────────────────────────────────────────────
    job.log("Stage 4: LLM classification")
    const llmResult = await classifyFeedback(verbatimText)
    job.log(`Stage 4: ${llmResult}`)

    if (llmResult === "not_feedback") {
      await prisma.ingestionQueue.update({
        where: { id: ingestionQueueId },
        data: { status: "REJECTED", rejectReason: "stage4:not_feedback", processedAt: new Date() },
      })
      return
    }

    if (llmResult === "uncertain") {
      await prisma.ingestionQueue.update({
        where: { id: ingestionQueueId },
        data: { status: "UNCERTAIN", processedAt: new Date() },
      })
      job.log("Item routed to inbox for manual review")
      return
    }

    // llmResult === "feedback" → approved
    const embedding = centroid ? await embed(verbatimText) : undefined
    await runAiPipeline(job, queueItem, raw, verbatimText, relevanceScore, embedding)
  },
  { connection: redis, concurrency: 5 },
)

// ─── AI enrichment + FeedbackItem creation ────────────────────────────────────

async function runAiPipeline(
  job: { log: (msg: string) => void },
  queueItem: Awaited<ReturnType<typeof prisma.ingestionQueue.findUnique>> & {
    connector: { workspaceId: string }
  },
  raw: Record<string, unknown>,
  verbatimText: string,
  relevanceScore: number | undefined,
  embedding: number[] | undefined,
) {
  if (!queueItem) return

  const workspaceId = queueItem.connector.workspaceId

  // Check for duplicate FeedbackItem before doing AI work
  const existing = await prisma.feedbackItem.findFirst({
    where: { connectorId: queueItem.connectorId, externalId: queueItem.externalId },
    select: { id: true },
  })
  if (existing) {
    await prisma.ingestionQueue.update({
      where: { id: queueItem.id },
      data: { status: "APPROVED", processedAt: new Date() },
    })
    return
  }

  // Enrich with customer data if available
  const authorEmail = raw.authorEmail as string | undefined
  const emailDomain = authorEmail ? (authorEmail.split("@")[1] ?? null) : null
  const customer = emailDomain
    ? await prisma.customer.findFirst({
        where: { workspaceId, domain: emailDomain },
        select: { id: true, name: true, tier: true, arrCents: true },
      })
    : null

  job.log("Running sentiment, severity, and summary generation in parallel")

  const [sentiment, severity, extractedSummary] = await Promise.all([
    scoreSentiment(verbatimText),
    inferSeverity(verbatimText, customer?.tier ?? undefined),
    generateSummary(verbatimText, {
      authorName:   raw.authorName as string | undefined,
      customerName: customer?.name,
      customerTier: customer?.tier ?? undefined,
      arrCents:     customer?.arrCents ?? undefined,
      sourceType:   queueItem.sourceType,
    } satisfies SummaryContext),
  ])

  job.log(`Sentiment: ${sentiment.toFixed(2)}, Severity: ${severity}`)

  const feedbackItem = await prisma.feedbackItem.create({
    data: {
      workspaceId,
      connectorId:      queueItem.connectorId,
      verbatimText,
      extractedSummary,
      authorName:       raw.authorName   as string | undefined,
      authorEmail:      raw.authorEmail  as string | undefined,
      authorUrl:        raw.authorUrl    as string | undefined,
      sourceType:       queueItem.sourceType,
      externalId:       queueItem.externalId,
      externalUrl:      raw.externalUrl  as string | undefined,
      customerId:       customer?.id,
      sentiment,
      severity,
      relevanceScore:   relevanceScore ?? null,
      publishedAt:      raw.publishedAt ? new Date(raw.publishedAt as string) : new Date(),
      rawPayload:       queueItem.rawPayload ?? undefined,
      status:           "NEW",
    },
  })

  // Store embedding via raw SQL (pgvector column is outside Prisma schema types)
  if (embedding && embedding.length > 0) {
    const vectorLiteral = `[${embedding.join(",")}]`
    await prisma.$executeRawUnsafe(
      `UPDATE feedback_items SET embedding = $1::vector WHERE id = $2`,
      vectorLiteral,
      feedbackItem.id,
    )
    job.log("Embedding stored in pgvector")
  }

  // Mark approved and bump connector count
  await Promise.all([
    prisma.ingestionQueue.update({
      where: { id: queueItem.id },
      data: { status: "APPROVED", processedAt: new Date() },
    }),
    prisma.connector.update({
      where: { id: queueItem.connectorId },
      data: { itemCount: { increment: 1 } },
    }),
  ])

  job.log(`FeedbackItem created: ${feedbackItem.id}`)
}

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
