import type { FastifyPluginAsync } from "fastify"
import { createRepo } from "@voxly/db"
import { MemberRole } from "@voxly/types"
import type { PaginationParams } from "@voxly/types"
import { requireRole } from "../plugins/roles"
import { writeAudit } from "../plugins/audit"

interface FeedbackQuery extends PaginationParams {
  status?: string
  themeId?: string
  severity?: string
  sourceType?: string
}

interface PatchFeedbackBody {
  status?: string
  assigneeId?: string | null
  themeId?: string | null
}

const feedback: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { workspaceId: string }; Querystring: FeedbackQuery }>(
    "/api/workspaces/:workspaceId/feedback",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden", code: "FORBIDDEN" })
      }

      const page = Math.max(1, Number(request.query.page ?? 1))
      const pageSize = Math.min(100, Math.max(1, Number(request.query.pageSize ?? 50)))
      const skip = (page - 1) * pageSize

      const where: Record<string, unknown> = {}
      if (request.query.status) where["status"] = request.query.status
      if (request.query.themeId) where["themeId"] = request.query.themeId
      if (request.query.severity) where["severity"] = request.query.severity
      if (request.query.sourceType) where["sourceType"] = request.query.sourceType

      const repo = createRepo(fastify.prisma, request.params.workspaceId)

      const [data, total] = await Promise.all([
        repo.feedbackItem.findMany({
          where,
          include: {
            customer: true,
            theme: true,
            assignee: true,
            linkedTickets: true,
          },
          orderBy: { ingestedAt: "desc" },
          skip,
          take: pageSize,
        } as Parameters<typeof repo.feedbackItem.findMany>[0]),
        repo.feedbackItem.count({ where }),
      ])

      return { data, total, page, pageSize, hasMore: skip + data.length < total }
    }
  )

  // PATCH /api/workspaces/:workspaceId/feedback/:itemId — status, assignment, theme
  fastify.patch<{
    Params: { workspaceId: string; itemId: string }
    Body: PatchFeedbackBody
  }>(
    "/api/workspaces/:workspaceId/feedback/:itemId",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden", code: "FORBIDDEN" })
      }
      if (await requireRole(request, reply, MemberRole.MEMBER)) return

      const { itemId } = request.params
      const item = await fastify.prisma.feedbackItem.findUnique({
        where: { id: itemId },
        select: { workspaceId: true, status: true, assigneeId: true },
      })
      if (!item || item.workspaceId !== request.params.workspaceId) {
        return reply.code(404).send({ error: "Not found" })
      }

      const data: Record<string, unknown> = {}
      if (request.body.status !== undefined) data["status"] = request.body.status
      if (request.body.assigneeId !== undefined) data["assigneeId"] = request.body.assigneeId
      if (request.body.themeId !== undefined) data["themeId"] = request.body.themeId

      const updated = await fastify.prisma.feedbackItem.update({
        where: { id: itemId },
        data,
      })

      const action = request.body.assigneeId !== undefined
        ? "FEEDBACK_ASSIGNED" as const
        : request.body.status === "ARCHIVED"
          ? "FEEDBACK_ARCHIVED" as const
          : "FEEDBACK_STATUS_CHANGED" as const

      await writeAudit(fastify.prisma, request, {
        entityType: "feedback_item",
        entityId: itemId,
        action,
        metadata: { previous: { status: item.status, assigneeId: item.assigneeId }, next: data },
      })

      return updated
    }
  )
}

export default feedback
