import { Queue, type ConnectionOptions } from "bullmq"

// ─── Connection ───────────────────────────────────────────────────────────────

export function getRedisConnection(): ConnectionOptions {
  if (process.env.REDIS_URL) {
    const url = new URL(process.env.REDIS_URL)
    return {
      host: url.hostname,
      port: Number(url.port) || 6379,
      password: url.password || undefined,
      tls: url.protocol === "rediss:" ? {} : undefined,
    }
  }
  return {
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD,
  }
}

// ─── Queue names ─────────────────────────────────────────────────────────────

export const QUEUE_INGESTION = "ingestion"
export const QUEUE_AI_PIPELINE = "ai-pipeline"
export const QUEUE_POLL = "poll"

// ─── Job names ───────────────────────────────────────────────────────────────

export const JOB_INGEST_ITEM = "INGEST_ITEM"
export const JOB_PROCESS_ITEM = "PROCESS_ITEM"
export const JOB_POLL_SOURCE = "POLL_SOURCE"
export const JOB_AI_PIPELINE = "AI_PIPELINE"
export const JOB_NIGHTLY_CLUSTER = "NIGHTLY_CLUSTER"
export const JOB_CRM_ENRICH = "CRM_ENRICH"

// ─── Job data types ───────────────────────────────────────────────────────────

export interface IngestItemJob {
  connectorId: string
  workspaceId: string
  rawPayload: unknown
  sourceType: string
}

export interface ProcessItemJob {
  ingestionQueueId: string
  connectorId: string
  workspaceId: string
}

export interface PollSourceJob {
  connectorId: string
  workspaceId: string
  sourceType: string
}

export interface AiPipelineJob {
  feedbackItemId: string
  workspaceId: string
}

export interface CrmEnrichJob {
  feedbackItemId: string
  workspaceId: string
  authorEmail?: string
  authorDomain?: string
}

export interface NightlyClusterJob {
  workspaceId: string
}

// ─── Queue factories ──────────────────────────────────────────────────────────

export function createIngestionQueue(connection: ConnectionOptions) {
  return new Queue<IngestItemJob | ProcessItemJob>(QUEUE_INGESTION, {
    connection,
    defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
  })
}

export function createAiPipelineQueue(connection: ConnectionOptions) {
  return new Queue<AiPipelineJob | CrmEnrichJob | NightlyClusterJob>(QUEUE_AI_PIPELINE, {
    connection,
    defaultJobOptions: { attempts: 2, backoff: { type: "exponential", delay: 5000 } },
  })
}

export function createPollQueue(connection: ConnectionOptions) {
  return new Queue<PollSourceJob>(QUEUE_POLL, {
    connection,
    defaultJobOptions: { attempts: 2, backoff: { type: "exponential", delay: 10000 } },
  })
}
