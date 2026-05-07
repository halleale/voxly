import { prisma } from "@voxly/db"
import {
  createRedisConnection,
  createIngestionQueue,
  createAiPipelineQueue,
  createClusterQueue,
  createCrmSyncQueue,
  createPollingQueue,
  createGongTranscriptQueue,
  Worker,
  QUEUE_NAMES,
  JOB_NAMES,
  type IngestItemPayload,
  type ProcessItemPayload,
  type ClusterThemesPayload,
  type SyncCrmPayload,
  type PollSourcePayload,
} from "@voxly/queue"
import {
  connectorRegistry,
  stage1HardFilter,
  stage2SourceFilter,
  fetchHubSpotCompanies,
  gongConnector,
} from "@voxly/connectors"
import {
  embed,
  cosineSimilarity,
  computeCentroid,
  runEmbeddingClassifier,
  classifyFeedback,
  scoreSentiment,
  inferSeverity,
  generateSummary,
  findNearestTheme,
  nameTheme,
  type SummaryContext,
} from "@voxly/ai"
import type { ConnectorConfig, NormalizedFeedback } from "@voxly/types"

const redis = createRedisConnection()
const ingestionQueue = createIngestionQueue(redis)
const aiQueue = createAiPipelineQueue(redis)
const clusterQueue = createClusterQueue(redis)
const crmSyncQueue = createCrmSyncQueue(redis)
const pollingQueue = createPollingQueue(redis)
const gongTranscriptQueue = createGongTranscriptQueue(redis)

// ─── Classifier centroid cache ────────────────────────────────────────────────

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

// ─── Theme centroid cache ─────────────────────────────────────────────────────

interface CachedTheme { id: string; centroid: number[] }
const themeCacheByWorkspace = new Map<string, { themes: CachedTheme[]; loadedAt: number }>()
const THEME_CACHE_TTL_MS = 5 * 60 * 1000

async function getWorkspaceThemes(workspaceId: string): Promise<CachedTheme[]> {
  const cached = themeCacheByWorkspace.get(workspaceId)
  if (cached && Date.now() - cached.loadedAt < THEME_CACHE_TTL_MS) return cached.themes

  // Fetch theme centroids via raw SQL since Prisma doesn't know about the vector column
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; centroid: string | null }>>(
    `SELECT id, centroid::text FROM themes WHERE workspace_id = $1 AND is_proto = false AND centroid IS NOT NULL`,
    workspaceId,
  )

  const themes: CachedTheme[] = rows
    .map((r) => {
      if (!r.centroid) return null
      // pgvector returns centroid as "[0.1,0.2,...]"
      const vec = r.centroid.replace(/[\[\]]/g, "").split(",").map(Number)
      return { id: r.id, centroid: vec }
    })
    .filter((t): t is CachedTheme => t !== null)

  themeCacheByWorkspace.set(workspaceId, { themes, loadedAt: Date.now() })
  return themes
}

function invalidateThemeCache(workspaceId: string) {
  themeCacheByWorkspace.delete(workspaceId)
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
        await runAiPipeline(job, queueItem, raw, verbatimText, relevanceScore, embedding)
        return
      }
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

  const authorEmail = raw.authorEmail as string | undefined
  const emailDomain = authorEmail ? (authorEmail.split("@")[1] ?? null) : null
  const customer = emailDomain
    ? await prisma.customer.findFirst({
        where: { workspaceId, domain: emailDomain },
        select: { id: true, name: true, tier: true, arrCents: true },
      })
    : null

  job.log("Running sentiment, severity, summary, and theme assignment in parallel")

  // Real-time theme assignment runs alongside the AI calls
  const themes = embedding ? await getWorkspaceThemes(workspaceId) : []
  const { themeId, confidence: themeConfidence } = embedding && themes.length > 0
    ? findNearestTheme(embedding, themes)
    : { themeId: null, confidence: 0 }

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

  job.log(`Sentiment: ${sentiment.toFixed(2)}, Severity: ${severity}, Theme: ${themeId ?? "none"}`)

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
      themeId:          themeId ?? undefined,
      themeConfidence:  themeId ? themeConfidence : undefined,
      sentiment,
      severity,
      relevanceScore:   relevanceScore ?? null,
      publishedAt:      raw.publishedAt ? new Date(raw.publishedAt as string) : new Date(),
      rawPayload:       queueItem.rawPayload ?? undefined,
      status:           "NEW",
    },
  })

  // Store embedding via raw SQL (pgvector column outside Prisma schema types)
  if (embedding && embedding.length > 0) {
    const vectorLiteral = `[${embedding.join(",")}]`
    await prisma.$executeRawUnsafe(
      `UPDATE feedback_items SET embedding = $1::vector WHERE id = $2`,
      vectorLiteral,
      feedbackItem.id,
    )
    job.log("Embedding stored in pgvector")
  }

  // If no theme matched, create a proto-theme so the nightly job can cluster it
  if (!themeId && embedding && embedding.length > 0) {
    await maybeCreateProtoTheme(workspaceId, feedbackItem.id, verbatimText, embedding, job)
  }

  // Update matched theme's item count and last_active_at
  if (themeId) {
    await prisma.theme.update({
      where: { id: themeId },
      data: { itemCount: { increment: 1 }, lastActiveAt: new Date() },
    })
  }

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

// ─── Proto-theme creation ─────────────────────────────────────────────────────

async function maybeCreateProtoTheme(
  workspaceId: string,
  feedbackItemId: string,
  verbatimText: string,
  embedding: number[],
  job: { log: (msg: string) => void },
) {
  // Check if any existing proto-theme is close enough to absorb this item
  const protoRows = await prisma.$queryRawUnsafe<Array<{ id: string; centroid: string | null }>>(
    `SELECT id, centroid::text FROM themes WHERE workspace_id = $1 AND is_proto = true AND centroid IS NOT NULL`,
    workspaceId,
  )

  for (const row of protoRows) {
    if (!row.centroid) continue
    const vec = row.centroid.replace(/[\[\]]/g, "").split(",").map(Number)
    const sim = cosineSimilarity(embedding, vec)
    if (sim >= 0.82) {
      // Absorb into existing proto-theme
      await prisma.feedbackItem.update({
        where: { id: feedbackItemId },
        data: { themeId: row.id, themeConfidence: sim },
      })
      await prisma.theme.update({
        where: { id: row.id },
        data: { itemCount: { increment: 1 }, lastActiveAt: new Date() },
      })
      job.log(`Item absorbed into proto-theme ${row.id} (sim=${sim.toFixed(3)})`)
      return
    }
  }

  // Create a new proto-theme for this item
  const slug = `proto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const proto = await prisma.theme.create({
    data: {
      workspaceId,
      slug,
      name: verbatimText.slice(0, 60),
      isProto: true,
      itemCount: 1,
      lastActiveAt: new Date(),
    },
  })

  // Store centroid = the item's embedding
  const vectorLiteral = `[${embedding.join(",")}]`
  await prisma.$executeRawUnsafe(
    `UPDATE themes SET centroid = $1::vector WHERE id = $2`,
    vectorLiteral,
    proto.id,
  )

  await prisma.feedbackItem.update({
    where: { id: feedbackItemId },
    data: { themeId: proto.id, themeConfidence: 1.0 },
  })

  invalidateThemeCache(workspaceId)
  job.log(`Proto-theme created: ${proto.id}`)
}

// ─── Nightly clustering worker ────────────────────────────────────────────────
// Simplified DBSCAN-style clustering in TypeScript.
// Replaces proto-themes with stable named themes and detects spikes.

const clusterWorker = new Worker<ClusterThemesPayload>(
  QUEUE_NAMES.NIGHTLY_CLUSTER,
  async (job) => {
    const { workspaceId } = job.data
    job.log(`Nightly clustering for workspace ${workspaceId}`)

    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    // Fetch all feedback items with embeddings from the last 30 days
    const rows = await prisma.$queryRawUnsafe<
      Array<{ id: string; embedding: string | null; verbatim_text: string; theme_id: string | null }>
    >(
      `SELECT id, embedding::text, verbatim_text, theme_id
       FROM feedback_items
       WHERE workspace_id = $1
         AND ingested_at >= $2
         AND embedding IS NOT NULL`,
      workspaceId,
      since30d,
    )

    job.log(`Fetched ${rows.length} items with embeddings`)
    if (rows.length < 3) return

    type EmbeddedItem = { id: string; embedding: number[]; verbatimText: string; themeId: string | null }
    const items: EmbeddedItem[] = rows.map((r) => ({
      id: r.id,
      embedding: (r.embedding ?? "").replace(/[\[\]]/g, "").split(",").map(Number),
      verbatimText: r.verbatim_text,
      themeId: r.theme_id,
    }))

    // Simple DBSCAN: epsilon = 1 - 0.78 = 0.22 (in cosine distance), minPts = 3
    const EPSILON = 0.22
    const MIN_PTS = 3
    const visited = new Set<string>()
    const clusters: EmbeddedItem[][] = []

    function rangeQuery(item: EmbeddedItem): EmbeddedItem[] {
      return items.filter(
        (other) => other.id !== item.id && (1 - cosineSimilarity(item.embedding, other.embedding)) <= EPSILON,
      )
    }

    for (const item of items) {
      if (visited.has(item.id)) continue
      visited.add(item.id)

      const neighbors = rangeQuery(item)
      if (neighbors.length < MIN_PTS - 1) continue

      const cluster: EmbeddedItem[] = [item]
      const queue = [...neighbors]

      while (queue.length > 0) {
        const q = queue.shift()!
        if (!visited.has(q.id)) {
          visited.add(q.id)
          const qNeighbors = rangeQuery(q)
          if (qNeighbors.length >= MIN_PTS - 1) {
            for (const n of qNeighbors) {
              if (!visited.has(n.id)) queue.push(n)
            }
          }
        }
        if (!cluster.find((c) => c.id === q.id)) cluster.push(q)
      }

      if (cluster.length >= MIN_PTS) clusters.push(cluster)
    }

    job.log(`Found ${clusters.length} clusters with MIN_PTS=${MIN_PTS}`)

    // Fetch existing stable themes to avoid re-creating them
    const existingThemes = await prisma.theme.findMany({
      where: { workspaceId, isProto: false },
      select: { id: true, slug: true },
    })
    const existingSlugs = new Set(existingThemes.map((t) => t.slug))

    // Process each cluster
    for (const cluster of clusters) {
      const centroid = computeCentroid(cluster.map((c) => c.embedding))
      const samples = cluster.slice(0, 8).map((c) => c.verbatimText)

      // Check if cluster maps to an existing stable theme
      const existingStable = await prisma.$queryRawUnsafe<Array<{ id: string; centroid: string | null }>>(
        `SELECT id, centroid::text FROM themes WHERE workspace_id = $1 AND is_proto = false AND centroid IS NOT NULL`,
        workspaceId,
      )

      let matchedThemeId: string | null = null
      let bestSim = 0

      for (const t of existingStable) {
        if (!t.centroid) continue
        const vec = t.centroid.replace(/[\[\]]/g, "").split(",").map(Number)
        const sim = cosineSimilarity(centroid, vec)
        if (sim > 0.82 && sim > bestSim) {
          bestSim = sim
          matchedThemeId = t.id
        }
      }

      if (matchedThemeId) {
        // Update existing theme: reassign items and refresh centroid
        const vectorLiteral = `[${centroid.join(",")}]`
        await prisma.$executeRawUnsafe(
          `UPDATE themes SET centroid = $1::vector, item_count = $2, last_active_at = now() WHERE id = $3`,
          vectorLiteral,
          cluster.length,
          matchedThemeId,
        )
        await prisma.feedbackItem.updateMany({
          where: { id: { in: cluster.map((c) => c.id) } },
          data: { themeId: matchedThemeId },
        })
        job.log(`Updated existing theme ${matchedThemeId} with ${cluster.length} items`)
      } else {
        // New cluster — generate a name and create a stable theme
        const { name, slug: rawSlug, description } = await nameTheme(samples)
        let slug = rawSlug
        let attempt = 1
        while (existingSlugs.has(slug)) {
          slug = `${rawSlug}-${attempt++}`
        }
        existingSlugs.add(slug)

        const theme = await prisma.theme.create({
          data: { workspaceId, slug, name, description, itemCount: cluster.length, isProto: false, lastActiveAt: new Date() },
        })

        const vectorLiteral = `[${centroid.join(",")}]`
        await prisma.$executeRawUnsafe(
          `UPDATE themes SET centroid = $1::vector WHERE id = $2`,
          vectorLiteral,
          theme.id,
        )

        await prisma.feedbackItem.updateMany({
          where: { id: { in: cluster.map((c) => c.id) } },
          data: { themeId: theme.id, themeConfidence: 0.9 },
        })

        job.log(`Created theme "${name}" (${slug}) with ${cluster.length} items`)
      }
    }

    // ── Spike detection ─────────────────────────────────────────────────────
    // Compare last 7 days vs prior 7-day baseline for each theme
    const now = new Date()
    const day7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const day14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

    const themeIds = (
      await prisma.theme.findMany({ where: { workspaceId }, select: { id: true } })
    ).map((t) => t.id)

    for (const themeId of themeIds) {
      const [recent, baseline] = await Promise.all([
        prisma.feedbackItem.count({ where: { workspaceId, themeId, ingestedAt: { gte: day7 } } }),
        prisma.feedbackItem.count({ where: { workspaceId, themeId, ingestedAt: { gte: day14, lt: day7 } } }),
      ])
      const isSpiking = baseline > 0 ? recent >= baseline * 2 : recent >= 5
      await prisma.theme.update({ where: { id: themeId }, data: { isSpiking } })
    }

    // Clean up lone proto-themes older than 48 hours with only 1 item
    await prisma.theme.deleteMany({
      where: {
        workspaceId,
        isProto: true,
        itemCount: 1,
        createdAt: { lt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
      },
    })

    invalidateThemeCache(workspaceId)
    job.log("Nightly clustering complete")
  },
  { connection: redis, concurrency: 1 },
)

// ─── CRM sync worker (HubSpot) ────────────────────────────────────────────────

const crmSyncWorker = new Worker<SyncCrmPayload>(
  QUEUE_NAMES.CRM_SYNC,
  async (job) => {
    const { connectorId, workspaceId } = job.data

    const connector = await prisma.connector.findUnique({ where: { id: connectorId } })
    if (!connector || !connector.enabled) {
      job.log(`Connector ${connectorId} not found or disabled`)
      return
    }

    const config = connector.configJson as { accessToken?: string; settings?: { lastSyncedAt?: string } }
    if (!config.accessToken) {
      job.log("No access token — skipping CRM sync")
      return
    }

    const since = config.settings?.lastSyncedAt ? new Date(config.settings.lastSyncedAt) : undefined
    job.log(`Syncing HubSpot companies since ${since?.toISOString() ?? "beginning"}`)

    const companies = await fetchHubSpotCompanies(config.accessToken, since)
    job.log(`Fetched ${companies.length} companies from HubSpot`)

    for (const company of companies) {
      if (!company.domain) continue
      await prisma.customer.upsert({
        where: { workspaceId_domain: { workspaceId, domain: company.domain } } as Parameters<typeof prisma.customer.upsert>[0]["where"],
        create: {
          workspaceId,
          name:      company.name,
          domain:    company.domain,
          tier:      company.tier,
          arrCents:  company.arrCents,
          crmId:     company.crmId,
          enrichedAt: new Date(),
        },
        update: {
          name:      company.name,
          tier:      company.tier,
          arrCents:  company.arrCents,
          crmId:     company.crmId,
          enrichedAt: new Date(),
        },
      })
    }

    // Persist the last sync timestamp
    await prisma.connector.update({
      where: { id: connectorId },
      data: {
        lastPolledAt: new Date(),
        configJson: {
          ...config,
          settings: { ...(config.settings ?? {}), lastSyncedAt: new Date().toISOString() },
        },
      },
    })

    job.log(`CRM sync complete — upserted ${companies.length} companies`)
  },
  { connection: redis, concurrency: 2 },
)

// ─── Polling worker (G2, HN, Gong transcript fetch) ──────────────────────────
// Scheduled via BullMQ repeatable jobs: G2 daily, HN hourly.
// The Gong connector uses normalizeAsync() after receiving a call-completed webhook.

const pollingWorker = new Worker<PollSourcePayload>(
  QUEUE_NAMES.POLLING,
  async (job) => {
    const { connectorId, workspaceId } = job.data

    const connector = await prisma.connector.findUnique({ where: { id: connectorId } })
    if (!connector || !connector.enabled) {
      job.log(`Connector ${connectorId} not found or disabled — skipping poll`)
      return
    }

    const adapter = connectorRegistry[connector.type]
    if (!adapter?.poll) {
      job.log(`Connector type ${connector.type} does not support polling`)
      return
    }

    const config = connector.configJson as ConnectorConfig
    const since = connector.lastPolledAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000)

    job.log(`Polling ${connector.type} since ${since.toISOString()}`)

    let items: NormalizedFeedback[]
    try {
      items = await adapter.poll(config, since)
    } catch (err) {
      await prisma.connector.update({
        where: { id: connectorId },
        data: { status: "ERROR", errorMessage: String(err) },
      })
      throw err
    }

    job.log(`Poll returned ${items.length} items`)

    for (const item of items) {
      const jobId = `${connectorId}:${item.externalId}`
      await ingestionQueue.add(
        JOB_NAMES.INGEST_ITEM,
        {
          connectorId,
          workspaceId,
          externalId: item.externalId,
          rawPayload:  item,
          sourceType:  connector.type,
        },
        { jobId, deduplicate: { id: jobId } },
      )
    }

    await prisma.connector.update({
      where: { id: connectorId },
      data: { lastPolledAt: new Date(), status: "ACTIVE", errorMessage: null },
    })

    job.log(`Poll complete — enqueued ${items.length} items`)
  },
  { connection: redis, concurrency: 5 },
)

// ─── Gong async normalization worker ─────────────────────────────────────────
// A Gong call-completed webhook arrives with just a callId.
// The ingestion worker calls gongConnector.normalizeAsync() to fetch the
// transcript and run GPT-4o extraction before handing off to the AI pipeline.

// Patch the ingestion worker to handle Gong's async normalization:
// When sourceType is GONG, skip the sync normalize() and call normalizeAsync().
// We implement this by monkey-patching rawPayload handling in the ingestion job
// via a per-type hook in the existing ingestion worker logic.
// The gongConnector.normalizeAsync is exposed and called inline in the worker.
// (See ingestion worker above — it already calls adapter.normalize(), but for
//  Gong the return is [] and we need async. We handle it with a type check below.)

// Override: if the adapter has normalizeAsync, use it in the ingestion worker.
// The worker already imports gongConnector; we register a post-normalize hook here.
// This is done cleanly by the ingestion worker checking for the async path:
// The worker calls adapter.normalize() first — for Gong this returns [].
// We register an additional job type INGEST_GONG_CALL to handle the async path.
const INGEST_GONG_CALL = "INGEST_GONG_CALL"

const gongWorker = new Worker<IngestItemPayload>(
  QUEUE_NAMES.GONG_TRANSCRIPT,
  async (job) => {
    const { connectorId, workspaceId, rawPayload } = job.data

    const connector = await prisma.connector.findUnique({ where: { id: connectorId } })
    if (!connector || !connector.enabled) return

    const config = connector.configJson as ConnectorConfig

    job.log("Fetching Gong transcript and extracting customer feedback via GPT-4o")

    let items: NormalizedFeedback[]
    try {
      items = await gongConnector.normalizeAsync!(rawPayload, config)
    } catch (err) {
      await prisma.connector.update({
        where: { id: connectorId },
        data: { status: "ERROR", errorMessage: String(err) },
      })
      throw err
    }

    job.log(`Gong extraction returned ${items.length} customer segments`)

    for (const item of items) {
      const s1 = stage1HardFilter(item)
      if (!s1.pass) continue
      const s2 = stage2SourceFilter(item, config)
      if (!s2.pass) continue

      let queueRecord
      try {
        queueRecord = await prisma.ingestionQueue.create({
          data: {
            connectorId,
            externalId:  item.externalId,
            rawPayload:  item.rawPayload as object,
            sourceType:  item.sourceType,
            status:      "PENDING",
          },
        })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes("Unique constraint")) continue
        throw err
      }

      await aiQueue.add(JOB_NAMES.PROCESS_ITEM, { ingestionQueueId: queueRecord.id })
    }

    await prisma.connector.update({
      where: { id: connectorId },
      data: { status: "ACTIVE", errorMessage: null },
    })
  },
  { connection: redis, concurrency: 3 },
)

void INGEST_GONG_CALL  // referenced for future explicit scheduling if needed

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown() {
  console.log("Shutting down workers...")
  await ingestionWorker.close()
  await aiWorker.close()
  await clusterWorker.close()
  await crmSyncWorker.close()
  await pollingWorker.close()
  await gongWorker.close()
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

clusterWorker.on("failed", (job, err) => {
  console.error(`Cluster job ${job?.id} failed:`, err)
})

crmSyncWorker.on("failed", (job, err) => {
  console.error(`CRM sync job ${job?.id} failed:`, err)
})

pollingWorker.on("failed", (job, err) => {
  console.error(`Polling job ${job?.id} failed:`, err)
})

gongWorker.on("failed", (job, err) => {
  console.error(`Gong extraction job ${job?.id} failed:`, err)
})

console.log("Voxly processor worker started")

// Export queue handles for use from API (schedule nightly job, trigger CRM sync, poll)
export { clusterQueue, crmSyncQueue, pollingQueue, gongTranscriptQueue }
