import type { FastifyPluginAsync } from "fastify"
import { createHash } from "crypto"

interface IngestBody {
  externalId: string
  verbatimText: string
  authorName?: string
  authorEmail?: string
  authorUrl?: string
  externalUrl?: string
  publishedAt?: string
  sourceType?: string
  rawPayload?: Record<string, unknown>
}

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex")
}

const ingestion: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/feedback — public ingestion endpoint
  // Auth: X-API-Key header (hashed and matched against workspace.api_key_hash)
  // This route is intentionally outside the auth plugin scope.
  fastify.post<{ Body: IngestBody | IngestBody[] }>(
    "/api/v1/feedback",
    {
      config: { skipAuth: true },
    },
    async (request, reply) => {
      const apiKey = request.headers["x-api-key"] as string | undefined
      if (!apiKey) {
        return reply.code(401).send({ error: "Missing X-API-Key header", code: "UNAUTHORIZED" })
      }

      const hash = hashApiKey(apiKey)
      const workspace = await fastify.prisma.workspace.findFirst({
        where: { apiKeyHash: hash },
        select: { id: true },
      })
      if (!workspace) {
        return reply.code(401).send({ error: "Invalid API key", code: "UNAUTHORIZED" })
      }

      const items = Array.isArray(request.body) ? request.body : [request.body]
      if (items.length === 0) {
        return reply.code(400).send({ error: "At least one feedback item is required" })
      }
      if (items.length > 100) {
        return reply.code(400).send({ error: "Max 100 items per request" })
      }

      // Ensure the API connector exists for this workspace
      let connector = await fastify.prisma.connector.findFirst({
        where: { workspaceId: workspace.id, type: "API" },
        select: { id: true },
      })
      if (!connector) {
        connector = await fastify.prisma.connector.create({
          data: {
            workspaceId: workspace.id,
            type: "API",
            name: "Public API",
            status: "ACTIVE",
            configJson: {},
          },
        })
      }

      const created = await Promise.all(
        items.map((item) =>
          fastify.prisma.feedbackItem.create({
            data: {
              workspaceId: workspace.id,
              connectorId: connector!.id,
              verbatimText: item.verbatimText,
              authorName: item.authorName,
              authorEmail: item.authorEmail,
              authorUrl: item.authorUrl,
              externalId: item.externalId,
              externalUrl: item.externalUrl,
              sourceType: (item.sourceType as import("@prisma/client").SourceType | undefined) ?? "API",
              publishedAt: item.publishedAt ? new Date(item.publishedAt) : new Date(),
              rawPayload: item.rawPayload ?? {},
              status: "NEW",
            },
          }).catch(() => null) // silently skip duplicates (unique constraint on externalId+connectorId)
        )
      )

      const accepted = created.filter(Boolean).length

      return reply.code(202).send({ accepted, total: items.length })
    }
  )

  // POST /api/workspaces/:workspaceId/api-key — generate or rotate API key
  // Returns the plaintext key once; only the hash is stored.
  fastify.post<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/api-key",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const { randomBytes } = await import("crypto")
      const plaintext = `vxly_${randomBytes(32).toString("hex")}`
      const hash = hashApiKey(plaintext)

      await fastify.prisma.workspace.update({
        where: { id: request.params.workspaceId },
        data: { apiKeyHash: hash },
      })

      // Log the rotation (not the key itself)
      await fastify.prisma.auditLog.create({
        data: {
          workspaceId: request.params.workspaceId,
          actorId: request.clerkUserId,
          action: "API_KEY_ROTATED",
          entityType: "workspace",
          entityId: request.params.workspaceId,
          metadata: {},
        },
      }).catch(() => null)

      return { key: plaintext }
    }
  )
}

export default ingestion
