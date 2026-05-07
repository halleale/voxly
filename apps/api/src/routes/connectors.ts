import type { FastifyPluginAsync } from "fastify"
import { createRepo } from "@voxly/db"

const AVAILABLE_CONNECTOR_TYPES = [
  { type: "SLACK", name: "Slack", description: "Customer messages from Slack channels", auth: "oauth" },
  { type: "INTERCOM", name: "Intercom", description: "Support conversations and tickets", auth: "oauth" },
  { type: "ZENDESK", name: "Zendesk", description: "Support tickets and CSAT scores", auth: "oauth" },
  { type: "G2", name: "G2", description: "Product reviews from G2", auth: "oauth" },
  { type: "GONG", name: "Gong", description: "Customer feedback extracted from call transcripts", auth: "oauth" },
  { type: "CANNY", name: "Canny", description: "Feature requests and votes", auth: "api_key" },
  { type: "HN", name: "Hacker News", description: "Mentions on Hacker News (public, no auth)", auth: "none" },
  { type: "REDDIT", name: "Reddit", description: "Mentions across subreddits", auth: "oauth" },
]

interface CreateConnectorBody {
  type: string
  name: string
  accessToken?: string
  settings?: Record<string, unknown>
}

interface UpdateConnectorBody {
  name?: string
  enabled?: boolean
  settings?: Record<string, unknown>
}

const connectors: FastifyPluginAsync = async (fastify) => {
  // GET /api/workspaces/:workspaceId/connectors
  fastify.get<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/connectors",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      const items = await fastify.prisma.connector.findMany({
        where: { workspaceId: request.params.workspaceId },
        orderBy: { createdAt: "asc" },
        include: { _count: { select: { feedbackItems: true } } },
      })
      return { data: items, available: AVAILABLE_CONNECTOR_TYPES }
    }
  )

  // POST /api/workspaces/:workspaceId/connectors
  fastify.post<{ Params: { workspaceId: string }; Body: CreateConnectorBody }>(
    "/api/workspaces/:workspaceId/connectors",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      const { type, name, accessToken, settings } = request.body
      if (!type || !name) {
        return reply.code(400).send({ error: "type and name are required" })
      }

      const connector = await fastify.prisma.connector.create({
        data: {
          workspaceId: request.params.workspaceId,
          type: type as import("@prisma/client").SourceType,
          name,
          configJson: { accessToken, settings: settings ?? {} },
          status: accessToken ? "ACTIVE" : "PENDING_AUTH",
        },
      })

      return reply.code(201).send(connector)
    }
  )

  // PATCH /api/workspaces/:workspaceId/connectors/:connectorId
  fastify.patch<{
    Params: { workspaceId: string; connectorId: string }
    Body: UpdateConnectorBody
  }>(
    "/api/workspaces/:workspaceId/connectors/:connectorId",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      const { connectorId } = request.params
      const existing = await fastify.prisma.connector.findUnique({
        where: { id: connectorId },
        select: { workspaceId: true, configJson: true },
      })
      if (!existing || existing.workspaceId !== request.params.workspaceId) {
        return reply.code(404).send({ error: "Connector not found" })
      }

      const updates: Record<string, unknown> = {}
      if (request.body.name !== undefined) updates.name = request.body.name
      if (request.body.enabled !== undefined) updates.enabled = request.body.enabled
      if (request.body.settings !== undefined) {
        const existing_config = existing.configJson as Record<string, unknown>
        updates.configJson = { ...existing_config, settings: request.body.settings }
      }

      const updated = await fastify.prisma.connector.update({
        where: { id: connectorId },
        data: updates,
      })

      return updated
    }
  )

  // DELETE /api/workspaces/:workspaceId/connectors/:connectorId
  fastify.delete<{ Params: { workspaceId: string; connectorId: string } }>(
    "/api/workspaces/:workspaceId/connectors/:connectorId",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      await fastify.prisma.connector.delete({
        where: {
          id: request.params.connectorId,
          workspaceId: request.params.workspaceId,
        },
      })
      return reply.code(204).send()
    }
  )

  // GET /api/connector-types — public list, no auth required
  fastify.get("/api/connector-types", async () => ({ data: AVAILABLE_CONNECTOR_TYPES }))
}

export default connectors
