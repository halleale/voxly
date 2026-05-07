import { Worker } from "bullmq"
import { prisma } from "@voxly/db"
import {
  getRedisConnection,
  createIngestionQueue,
  createAiPipelineQueue,
  createPollQueue,
  QUEUE_INGESTION,
  QUEUE_AI_PIPELINE,
  QUEUE_POLL,
  JOB_INGEST_ITEM,
  JOB_PROCESS_ITEM,
  JOB_POLL_SOURCE,
  JOB_AI_PIPELINE,
  JOB_CRM_ENRICH,
  JOB_NIGHTLY_CLUSTER,
  type IngestItemJob,
  type ProcessItemJob,
  type PollSourceJob,
  type AiPipelineJob,
  type CrmEnrichJob,
  type NightlyClusterJob,
} from "@voxly/queue"
import { handleIngestItem } from "./jobs/ingest"
import { handleProcessItem } from "./jobs/process"
import { handlePollSource } from "./jobs/poll"
import { handleAiPipeline } from "./jobs/ai-pipeline"
import { handleNightlyCluster } from "./jobs/nightly-cluster"
import { handleCrmEnrich } from "./jobs/crm-enrich"

const connection = getRedisConnection()
const ingestionQueue = createIngestionQueue(connection)
const aiQueue = createAiPipelineQueue(connection)
const pollQueue = createPollQueue(connection)

// ─── Ingestion worker ─────────────────────────────────────────────────────────

const ingestionWorker = new Worker(
  QUEUE_INGESTION,
  async (job) => {
    if (job.name === JOB_INGEST_ITEM) {
      await handleIngestItem(job as Parameters<typeof handleIngestItem>[0], prisma, ingestionQueue)
    } else if (job.name === JOB_PROCESS_ITEM) {
      await handleProcessItem(job as Parameters<typeof handleProcessItem>[0], prisma, aiQueue)
    }
  },
  { connection, concurrency: 10 }
)

// ─── Poll worker ─────────────────────────────────────────────────────────────

const pollWorker = new Worker(
  QUEUE_POLL,
  async (job) => {
    if (job.name === JOB_POLL_SOURCE) {
      await handlePollSource(job as Parameters<typeof handlePollSource>[0], prisma, ingestionQueue)
    }
  },
  { connection, concurrency: 5 }
)

// ─── AI pipeline worker ──────────────────────────────────────────────────────

const aiWorker = new Worker(
  QUEUE_AI_PIPELINE,
  async (job) => {
    if (job.name === JOB_AI_PIPELINE) {
      await handleAiPipeline(job as Parameters<typeof handleAiPipeline>[0], prisma, aiQueue)
    } else if (job.name === JOB_CRM_ENRICH) {
      await handleCrmEnrich(job as Parameters<typeof handleCrmEnrich>[0], prisma)
    } else if (job.name === JOB_NIGHTLY_CLUSTER) {
      await handleNightlyCluster(job as Parameters<typeof handleNightlyCluster>[0], prisma)
    }
  },
  { connection, concurrency: 5 }
)

// ─── Error handling ───────────────────────────────────────────────────────────

for (const worker of [ingestionWorker, pollWorker, aiWorker]) {
  worker.on("failed", (job, err) => {
    console.error(`[${job?.queueName}] job ${job?.id} failed:`, err.message)
  })
}

console.log("Voxly processor worker started")

// ─── Poll scheduler — run every 15 minutes per active polling connector ──────

async function schedulePollJobs() {
  const connectors = await prisma.connector.findMany({
    where: { enabled: true, status: "ACTIVE" },
    select: { id: true, type: true, workspaceId: true },
  })

  for (const connector of connectors) {
    const needsPoll = ["G2", "TRUSTRADIUS", "HN", "REDDIT"].includes(connector.type)
    if (!needsPoll) continue
    await pollQueue.add(
      JOB_POLL_SOURCE,
      { connectorId: connector.id, workspaceId: connector.workspaceId, sourceType: connector.type },
      { jobId: `poll-${connector.id}-${Date.now()}` }
    )
  }
}

// Schedule initial poll and repeat every 15 minutes
schedulePollJobs().catch(console.error)
setInterval(() => schedulePollJobs().catch(console.error), 15 * 60 * 1000)

// Schedule nightly clustering at 2am for all workspaces
async function scheduleNightlyCluster() {
  const workspaces = await prisma.workspace.findMany({ select: { id: true } })
  for (const ws of workspaces) {
    await aiQueue.add(
      JOB_NIGHTLY_CLUSTER,
      { workspaceId: ws.id },
      { jobId: `nightly-${ws.id}-${new Date().toDateString()}` }
    )
  }
}

function msUntil2am(): number {
  const now = new Date()
  const next2am = new Date(now)
  next2am.setHours(2, 0, 0, 0)
  if (next2am <= now) next2am.setDate(next2am.getDate() + 1)
  return next2am.getTime() - now.getTime()
}

setTimeout(function scheduleFirst() {
  scheduleNightlyCluster().catch(console.error)
  setInterval(() => scheduleNightlyCluster().catch(console.error), 24 * 60 * 60 * 1000)
}, msUntil2am())

// Graceful shutdown
process.on("SIGTERM", async () => {
  await Promise.all([ingestionWorker.close(), pollWorker.close(), aiWorker.close()])
  await prisma.$disconnect()
  process.exit(0)
})
