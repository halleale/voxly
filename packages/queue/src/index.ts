import { Queue, Worker, type ConnectionOptions } from "bullmq"
import IORedis from "ioredis"

// ─── Queue names ──────────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  INGESTION:       "ingestion",
  AI_PIPELINE:     "ai-pipeline",
  POLLING:         "polling",
  NIGHTLY_CLUSTER: "nightly-cluster",
  CRM_SYNC:        "crm-sync",
  GONG_TRANSCRIPT: "gong-transcript",
} as const

// ─── Job names ────────────────────────────────────────────────────────────────

export const JOB_NAMES = {
  INGEST_ITEM:     "INGEST_ITEM",
  PROCESS_ITEM:    "PROCESS_ITEM",
  POLL_SOURCE:     "POLL_SOURCE",
  CLUSTER_THEMES:  "CLUSTER_THEMES",
  SYNC_CRM:        "SYNC_CRM",
} as const

// ─── Job payload types ────────────────────────────────────────────────────────

export interface IngestItemPayload {
  connectorId:  string
  workspaceId:  string
  externalId:   string
  rawPayload:   unknown
  sourceType:   string
}

export interface ProcessItemPayload {
  ingestionQueueId: string
}

export interface PollSourcePayload {
  connectorId: string
  workspaceId: string
}

export interface ClusterThemesPayload {
  workspaceId: string
}

export interface SyncCrmPayload {
  connectorId: string
  workspaceId: string
}

// ─── Redis connection ─────────────────────────────────────────────────────────

export function createRedisConnection(): IORedis {
  return new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  })
}

// ─── Queue factory ────────────────────────────────────────────────────────────

export function createIngestionQueue(connection: ConnectionOptions) {
  return new Queue<IngestItemPayload>(QUEUE_NAMES.INGESTION, { connection })
}

export function createAiPipelineQueue(connection: ConnectionOptions) {
  return new Queue<ProcessItemPayload>(QUEUE_NAMES.AI_PIPELINE, { connection })
}

export function createPollingQueue(connection: ConnectionOptions) {
  return new Queue<PollSourcePayload>(QUEUE_NAMES.POLLING, { connection })
}

export function createClusterQueue(connection: ConnectionOptions) {
  return new Queue<ClusterThemesPayload>(QUEUE_NAMES.NIGHTLY_CLUSTER, { connection })
}

export function createCrmSyncQueue(connection: ConnectionOptions) {
  return new Queue<SyncCrmPayload>(QUEUE_NAMES.CRM_SYNC, { connection })
}

export function createGongTranscriptQueue(connection: ConnectionOptions) {
  return new Queue<IngestItemPayload>(QUEUE_NAMES.GONG_TRANSCRIPT, { connection })
}

export { Worker, Queue }
export type { ConnectionOptions }
