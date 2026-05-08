import type { FastifyPluginAsync } from "fastify"
import {
  createRedisConnection,
  createAiPipelineQueue,
  JOB_NAMES,
} from "@voxly/queue"

let _aiQueue: ReturnType<typeof createAiPipelineQueue> | null = null
function getAiQueue() {
  if (!_aiQueue) _aiQueue = createAiPipelineQueue(createRedisConnection())
  return _aiQueue
}

const inbox: FastifyPluginAsync = async (fastify) => {
  // ── List uncertain items for a workspace ──────────────────────────────────

  fastify.get<{
    Params: { workspaceId: string }
    Querystring: { page?: string; pageSize?: string }
  }>(
    "/api/workspaces/:workspaceId/inbox",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const page = Math.max(1, Number(request.query.page ?? 1))
      const pageSize = Math.min(100, Math.max(1, Number(request.query.pageSize ?? 50)))
      const skip = (page - 1) * pageSize

      const [items, total] = await Promise.all([
        fastify.prisma.ingestionQueue.findMany({
          where: {
            status: "UNCERTAIN",
            connector: { workspaceId: request.params.workspaceId },
          },
          include: { connector: { select: { type: true, name: true } } },
          orderBy: { receivedAt: "desc" },
          skip,
          take: pageSize,
        }),
        fastify.prisma.ingestionQueue.count({
          where: {
            status: "UNCERTAIN",
            connector: { workspaceId: request.params.workspaceId },
          },
        }),
      ])

      return {
        data: items.map((item) => {
          const raw = item.rawPayload as Record<string, unknown>
          return {
            id:          item.id,
            externalId:  item.externalId,
            sourceType:  item.sourceType,
            connectorName: item.connector.name,
            verbatimText: (raw.verbatimText as string | undefined) ?? "",
            authorName:  raw.authorName as string | undefined,
            externalUrl: raw.externalUrl as string | undefined,
            publishedAt: raw.publishedAt as string | undefined,
            receivedAt:  item.receivedAt,
          }
        }),
        total,
        page,
        pageSize,
        hasMore: skip + items.length < total,
      }
    },
  )

  // ── Borderline rejected items (classifier improvement) ───────────────────
  // Items rejected by Stage 3 with a score close to the threshold (0.55–0.65).
  // PMs can review and approve these to improve the classifier centroid.

  fastify.get<{
    Params: { workspaceId: string }
    Querystring: { limit?: string }
  }>(
    "/api/workspaces/:workspaceId/inbox/borderline",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const limit = Math.min(100, Math.max(1, Number(request.query.limit ?? 50)))

      // Items rejected by stage3 with score 0.55–0.65 (close to the 0.65 threshold)
      const items = await fastify.prisma.ingestionQueue.findMany({
        where: {
          status: "REJECTED",
          stage3Score: { gte: 0.55, lte: 0.65 },
          connector: { workspaceId: request.params.workspaceId },
        },
        include: { connector: { select: { type: true, name: true } } },
        orderBy: { stage3Score: "desc" },
        take: limit,
      })

      return {
        data: items.map((item) => {
          const raw = item.rawPayload as Record<string, unknown>
          return {
            id:           item.id,
            externalId:   item.externalId,
            sourceType:   item.sourceType,
            connectorName: item.connector.name,
            verbatimText: (raw.verbatimText as string | undefined) ?? "",
            authorName:   raw.authorName as string | undefined,
            externalUrl:  raw.externalUrl as string | undefined,
            publishedAt:  raw.publishedAt as string | undefined,
            receivedAt:   item.receivedAt,
            stage3Score:  item.stage3Score,
          }
        }),
      }
    },
  )

  // ── Approve a borderline-rejected item ────────────────────────────────────

  fastify.post<{ Params: { workspaceId: string; itemId: string } }>(
    "/api/workspaces/:workspaceId/inbox/:itemId/approve-borderline",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const item = await fastify.prisma.ingestionQueue.findUnique({
        where: { id: request.params.itemId },
        include: { connector: { select: { workspaceId: true } } },
      })

      if (!item) return reply.code(404).send({ error: "Item not found" })
      if (item.connector.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      if (item.status !== "REJECTED") {
        return reply.code(409).send({ error: "Item is not rejected" })
      }

      // Reset to PENDING for full AI pipeline processing; mark pmApproved on the resulting FeedbackItem
      await fastify.prisma.ingestionQueue.update({
        where: { id: item.id },
        data: { status: "PENDING", processedAt: null, rejectReason: null },
      })

      // Stash the pmApproved flag in rawPayload so the AI worker can set it on FeedbackItem creation
      const raw = item.rawPayload as Record<string, unknown>
      await fastify.prisma.ingestionQueue.update({
        where: { id: item.id },
        data: { rawPayload: { ...raw, _pmApproved: true } },
      })

      await getAiQueue().add(JOB_NAMES.PROCESS_ITEM, { ingestionQueueId: item.id })

      return { ok: true }
    },
  )

  // ── Approve an uncertain item ─────────────────────────────────────────────
  // Moves it to APPROVED and enqueues it for the AI pipeline (sentiment,
  // severity, summary, FeedbackItem creation).

  fastify.post<{ Params: { workspaceId: string; itemId: string } }>(
    "/api/workspaces/:workspaceId/inbox/:itemId/approve",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const item = await fastify.prisma.ingestionQueue.findUnique({
        where: { id: request.params.itemId },
        include: { connector: { select: { workspaceId: true } } },
      })

      if (!item) return reply.code(404).send({ error: "Item not found" })
      if (item.connector.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      if (item.status !== "UNCERTAIN") {
        return reply.code(409).send({ error: "Item is not in UNCERTAIN status" })
      }

      // Move back to PENDING so the AI pipeline worker processes it normally
      await fastify.prisma.ingestionQueue.update({
        where: { id: item.id },
        data: { status: "PENDING", processedAt: null },
      })

      await getAiQueue().add(JOB_NAMES.PROCESS_ITEM, { ingestionQueueId: item.id })

      return { ok: true }
    },
  )

  // ── Reject an uncertain item ──────────────────────────────────────────────

  fastify.post<{ Params: { workspaceId: string; itemId: string } }>(
    "/api/workspaces/:workspaceId/inbox/:itemId/reject",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const item = await fastify.prisma.ingestionQueue.findUnique({
        where: { id: request.params.itemId },
        include: { connector: { select: { workspaceId: true } } },
      })

      if (!item) return reply.code(404).send({ error: "Item not found" })
      if (item.connector.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      if (item.status !== "UNCERTAIN") {
        return reply.code(409).send({ error: "Item is not in UNCERTAIN status" })
      }

      await fastify.prisma.ingestionQueue.update({
        where: { id: item.id },
        data: { status: "REJECTED", rejectReason: "manual:inbox_reject", processedAt: new Date() },
      })

      return { ok: true }
    },
  )
}

export default inbox
