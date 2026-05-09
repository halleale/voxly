import type { FastifyPluginAsync } from "fastify"
import { createRepo } from "@voxly/db"
import type { PaginationParams } from "@voxly/types"

interface FeedbackQuery extends PaginationParams {
  status?: string
  themeId?: string
  severity?: string
  sourceType?: string
}

const feedback: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { workspaceId: string }; Querystring: FeedbackQuery }>(
    "/api/workspaces/:workspaceId/feedback",
    async (request, reply) => {
      const { workspaceId } = request.params

      // Enforce workspace isolation — requester can only access their own workspace
      if (workspaceId !== request.workspaceId) {
        return reply.code(403).send({ error: "Forbidden", code: "FORBIDDEN" })
      }

      const page = Math.max(1, Number(request.query.page ?? 1))
      const pageSize = Math.min(100, Math.max(1, Number(request.query.pageSize ?? 50)))
      const skip = (page - 1) * pageSize

      const VALID_STATUSES = new Set(["NEW", "ASSIGNED", "RESOLVED", "ARCHIVED"])
      const VALID_SEVERITIES = new Set(["HIGH", "MEDIUM", "LOW"])
      const VALID_SOURCE_TYPES = new Set([
        "SLACK", "INTERCOM", "ZENDESK", "G2", "TRUSTRADIUS", "GONG",
        "CANNY", "HN", "REDDIT", "HUBSPOT", "SALESFORCE", "LINEAR", "JIRA", "API",
      ])

      if (request.query.status && !VALID_STATUSES.has(request.query.status)) {
        return reply.code(400).send({ error: `Invalid status value: ${request.query.status}`, code: "VALIDATION" })
      }
      if (request.query.severity && !VALID_SEVERITIES.has(request.query.severity)) {
        return reply.code(400).send({ error: `Invalid severity value: ${request.query.severity}`, code: "VALIDATION" })
      }
      if (request.query.sourceType && !VALID_SOURCE_TYPES.has(request.query.sourceType)) {
        return reply.code(400).send({ error: `Invalid sourceType value: ${request.query.sourceType}`, code: "VALIDATION" })
      }

      const where: Record<string, unknown> = {}
      if (request.query.status) where["status"] = request.query.status
      if (request.query.themeId) where["themeId"] = request.query.themeId
      if (request.query.severity) where["severity"] = request.query.severity
      if (request.query.sourceType) where["sourceType"] = request.query.sourceType

      const repo = createRepo(fastify.prisma, workspaceId)

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

      return {
        data,
        total,
        page,
        pageSize,
        hasMore: skip + data.length < total,
      }
    }
  )
}

export default feedback
