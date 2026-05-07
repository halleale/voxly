import type { FastifyPluginAsync } from "fastify"

const inbox: FastifyPluginAsync = async (fastify) => {
  // GET /api/workspaces/:workspaceId/inbox
  // Returns uncertain items waiting for PM review
  fastify.get<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/inbox",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      const items = await fastify.prisma.ingestionQueue.findMany({
        where: { connector: { workspaceId: request.params.workspaceId }, status: "UNCERTAIN" },
        include: { connector: { select: { name: true, type: true } } },
        orderBy: { receivedAt: "desc" },
        take: 100,
      })
      return { data: items, total: items.length }
    }
  )

  // GET /api/workspaces/:workspaceId/inbox/count
  fastify.get<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/inbox/count",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      const count = await fastify.prisma.ingestionQueue.count({
        where: { connector: { workspaceId: request.params.workspaceId }, status: "UNCERTAIN" },
      })
      return { count }
    }
  )

  // POST /api/workspaces/:workspaceId/inbox/:itemId/approve
  fastify.post<{ Params: { workspaceId: string; itemId: string } }>(
    "/api/workspaces/:workspaceId/inbox/:itemId/approve",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      const { itemId } = request.params
      const item = await fastify.prisma.ingestionQueue.findUnique({
        where: { id: itemId },
        include: { connector: { select: { workspaceId: true } } },
      })
      if (!item || item.connector.workspaceId !== request.params.workspaceId) {
        return reply.code(404).send({ error: "Not found" })
      }
      await fastify.prisma.ingestionQueue.update({
        where: { id: itemId },
        data: { status: "APPROVED", processedAt: new Date() },
      })

      // Create feedback item from approved uncertain item
      const raw = item.rawPayload as Record<string, unknown>
      await fastify.prisma.feedbackItem.create({
        data: {
          workspaceId: request.params.workspaceId,
          connectorId: item.connectorId,
          verbatimText: (raw.verbatimText as string) ?? "",
          authorName: raw.authorName as string | undefined,
          authorEmail: raw.authorEmail as string | undefined,
          sourceType: item.sourceType,
          externalId: item.externalId,
          rawPayload: item.rawPayload as object,
          status: "NEW",
        },
      }).catch(() => null) // ignore if already exists

      return { ok: true }
    }
  )

  // POST /api/workspaces/:workspaceId/inbox/:itemId/reject
  fastify.post<{ Params: { workspaceId: string; itemId: string } }>(
    "/api/workspaces/:workspaceId/inbox/:itemId/reject",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      await fastify.prisma.ingestionQueue.update({
        where: { id: request.params.itemId },
        data: { status: "REJECTED", processedAt: new Date() },
      })
      return { ok: true }
    }
  )
}

export default inbox
