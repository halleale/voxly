import type { Job, Queue } from "bullmq"
import type { PrismaClient } from "@voxly/db"
import type { PollSourceJob, IngestItemJob } from "@voxly/queue"
import { JOB_INGEST_ITEM } from "@voxly/queue"
import { REGISTRY } from "../connectors/registry"

export async function handlePollSource(
  job: Job<PollSourceJob>,
  prisma: PrismaClient,
  ingestionQueue: Queue
) {
  const { connectorId, workspaceId } = job.data

  const connector = await prisma.connector.findUnique({
    where: { id: connectorId },
    select: { id: true, type: true, configJson: true, lastPolledAt: true, workspaceId: true },
  })
  if (!connector || connector.workspaceId !== workspaceId) {
    throw new Error(`Connector ${connectorId} not found`)
  }

  const adapter = REGISTRY[connector.type]
  if (!adapter?.poll) return

  const since = connector.lastPolledAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000)
  const config = connector.configJson as import("@voxly/types").ConnectorConfig

  try {
    const items = await adapter.poll(config, since)

    for (const item of items) {
      const ingestJob: IngestItemJob = {
        connectorId,
        workspaceId,
        rawPayload: item,
        sourceType: connector.type,
      }
      await ingestionQueue.add(JOB_INGEST_ITEM, ingestJob)
    }

    await prisma.connector.update({
      where: { id: connectorId },
      data: { lastPolledAt: new Date(), status: "ACTIVE" },
    })
  } catch (err) {
    await prisma.connector.update({
      where: { id: connectorId },
      data: {
        status: "ERROR",
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    })
    throw err
  }
}
