import type { FastifyPluginAsync } from "fastify"
import { connectorRegistry } from "@voxly/connectors"
import type { ConnectorConfig } from "@voxly/types"

const connectors: FastifyPluginAsync = async (fastify) => {
  // ── List connectors for a workspace ───────────────────────────────────────

  fastify.get<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/connectors",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const rows = await fastify.prisma.connector.findMany({
        where: { workspaceId: request.params.workspaceId },
        orderBy: { createdAt: "asc" },
      })

      return rows
    },
  )

  // ── Create connector (after OAuth, caller passes tokens) ──────────────────

  fastify.post<{
    Params: { workspaceId: string }
    Body: { type: string; name: string; config: ConnectorConfig }
  }>(
    "/api/workspaces/:workspaceId/connectors",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const { type, name, config } = request.body

      // Validate credentials before saving
      const adapter = connectorRegistry[type]
      if (!adapter) {
        return reply.code(400).send({ error: `Unknown connector type: ${type}` })
      }

      const validation = await adapter.validate(config)
      if (!validation.valid) {
        return reply.code(400).send({ error: validation.error ?? "Invalid connector config" })
      }

      const connector = await fastify.prisma.connector.create({
        data: {
          workspaceId: request.params.workspaceId,
          type:        type as never,
          name,
          configJson:  config as object,
          status:      "ACTIVE",
        },
      })

      // Register webhook if the adapter supports it
      if (adapter.setupWebhook) {
        await adapter.setupWebhook(connector.id, config).catch((err) => {
          fastify.log.warn({ err }, "setupWebhook failed — continuing without it")
        })
      }

      return reply.code(201).send(connector)
    },
  )

  // ── Update connector config ────────────────────────────────────────────────

  fastify.patch<{
    Params: { workspaceId: string; connectorId: string }
    Body: { enabled?: boolean; config?: ConnectorConfig; name?: string }
  }>(
    "/api/workspaces/:workspaceId/connectors/:connectorId",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const existing = await fastify.prisma.connector.findUnique({
        where: { id: request.params.connectorId },
      })

      if (!existing || existing.workspaceId !== request.params.workspaceId) {
        return reply.code(404).send({ error: "Connector not found" })
      }

      const updated = await fastify.prisma.connector.update({
        where: { id: request.params.connectorId },
        data: {
          ...(request.body.name    !== undefined && { name:       request.body.name }),
          ...(request.body.enabled !== undefined && { enabled:    request.body.enabled }),
          ...(request.body.config  !== undefined && { configJson: request.body.config as object }),
        },
      })

      return updated
    },
  )

  // ── Delete connector ───────────────────────────────────────────────────────

  fastify.delete<{ Params: { workspaceId: string; connectorId: string } }>(
    "/api/workspaces/:workspaceId/connectors/:connectorId",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const existing = await fastify.prisma.connector.findUnique({
        where: { id: request.params.connectorId },
      })

      if (!existing || existing.workspaceId !== request.params.workspaceId) {
        return reply.code(404).send({ error: "Connector not found" })
      }

      await fastify.prisma.connector.delete({
        where: { id: request.params.connectorId },
      })

      return reply.code(204).send()
    },
  )
}

export default connectors
