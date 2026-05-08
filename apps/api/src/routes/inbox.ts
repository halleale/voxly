import type { FastifyPluginAsync } from "fastify"
import { MemberRole } from "@voxly/types"
import { requireRole } from "../plugins/roles"
import { writeAudit } from "../plugins/audit"

const inbox: FastifyPluginAsync = async (fastify) => {
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

  fastify.post<{ Params: { workspaceId: string; itemId: string } }>(
    "/api/workspaces/:workspaceId/inbox/:itemId/approve",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      if (await requireRole(request, reply, MemberRole.MEMBER)) return

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
      }).catch(() => null)

      await writeAudit(fastify.prisma, request, {
        entityType: "ingestion_queue",
        entityId: itemId,
        action: "INBOX_APPROVED",
        metadata: { connectorId: item.connectorId, externalId: item.externalId },
      })

      return { ok: true }
    }
  )

  fastify.post<{ Params: { workspaceId: string; itemId: string } }>(
    "/api/workspaces/:workspaceId/inbox/:itemId/reject",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      if (await requireRole(request, reply, MemberRole.MEMBER)) return

      await fastify.prisma.ingestionQueue.update({
        where: { id: request.params.itemId },
        data: { status: "REJECTED", processedAt: new Date() },
      })

      await writeAudit(fastify.prisma, request, {
        entityType: "ingestion_queue",
        entityId: request.params.itemId,
        action: "INBOX_REJECTED",
      })

      return { ok: true }
    }
  )
}

export default inbox
