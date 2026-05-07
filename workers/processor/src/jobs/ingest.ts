import type { Job } from "bullmq"
import type { PrismaClient } from "@voxly/db"
import type { IngestItemJob, ProcessItemJob } from "@voxly/queue"
import { JOB_PROCESS_ITEM } from "@voxly/queue"
import { runStage1 } from "../pipeline/stage1"
import { runStage2 } from "../pipeline/stage2"
import { REGISTRY } from "../connectors/registry"
import type { Queue } from "bullmq"

export async function handleIngestItem(
  job: Job<IngestItemJob>,
  prisma: PrismaClient,
  ingestionQueue: Queue
) {
  const { connectorId, workspaceId, rawPayload, sourceType } = job.data

  const connector = await prisma.connector.findUnique({
    where: { id: connectorId },
    select: { id: true, type: true, configJson: true, workspaceId: true },
  })
  if (!connector || connector.workspaceId !== workspaceId) {
    throw new Error(`Connector ${connectorId} not found`)
  }

  const adapter = REGISTRY[connector.type]
  if (!adapter) throw new Error(`No adapter for source type ${connector.type}`)

  const config = connector.configJson as import("@voxly/types").ConnectorConfig
  const items = adapter.normalize(rawPayload, config)

  for (const item of items) {
    // Stage 1 — hard filters
    const s1 = runStage1(item)
    if (!s1.pass) {
      await prisma.ingestionQueue.upsert({
        where: { connectorId_externalId: { connectorId, externalId: item.externalId } },
        create: {
          connectorId,
          externalId: item.externalId,
          rawPayload: item.rawPayload as object,
          sourceType: item.sourceType,
          status: "REJECTED",
          rejectReason: s1.rejectReason,
          processedAt: new Date(),
        },
        update: {},
      })
      continue
    }

    // Stage 2 — source-specific filters
    const s2 = runStage2(item, config)
    if (!s2.pass) {
      await prisma.ingestionQueue.upsert({
        where: { connectorId_externalId: { connectorId, externalId: item.externalId } },
        create: {
          connectorId,
          externalId: item.externalId,
          rawPayload: item.rawPayload as object,
          sourceType: item.sourceType,
          status: "REJECTED",
          rejectReason: s2.rejectReason,
          processedAt: new Date(),
        },
        update: {},
      })
      continue
    }

    // Dedup: if we already have this externalId for this connector, skip
    const existing = await prisma.ingestionQueue.findUnique({
      where: { connectorId_externalId: { connectorId, externalId: item.externalId } },
      select: { id: true, status: true },
    })
    if (existing) continue

    const queued = await prisma.ingestionQueue.create({
      data: {
        connectorId,
        externalId: item.externalId,
        rawPayload: item.rawPayload as object,
        sourceType: item.sourceType,
        status: "PENDING",
      },
    })

    // Enqueue for stage 3/4 + AI pipeline
    const processJob: ProcessItemJob = {
      ingestionQueueId: queued.id,
      connectorId,
      workspaceId,
    }
    await ingestionQueue.add(JOB_PROCESS_ITEM, processJob, { priority: 2 })
  }
}
