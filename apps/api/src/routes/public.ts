/**
 * Public ingestion API — POST /api/v1/feedback
 *
 * Authenticated with a Bearer API key (not a JWT). The key is hashed on
 * generation and the hash stored in workspaces.api_key_hash. On each
 * request we hash the submitted key and compare.
 */
import type { FastifyPluginAsync } from "fastify"
import { createHash, randomBytes } from "crypto"
import { requireRole } from "../plugins/auth"
import { audit } from "../lib/audit"
import {
  createRedisConnection,
  createIngestionQueue,
  JOB_NAMES,
} from "@voxly/queue"

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex")
}

let _ingestionQueue: ReturnType<typeof createIngestionQueue> | null = null
function getQueue() {
  if (!_ingestionQueue) _ingestionQueue = createIngestionQueue(createRedisConnection())
  return _ingestionQueue
}

const publicRoutes: FastifyPluginAsync = async (fastify) => {

  // ── Public feedback ingestion ─────────────────────────────────────────────
  // No Clerk auth — authenticated by API key in Authorization header.

  fastify.post<{
    Body: {
      text: string
      authorName?: string
      authorEmail?: string
      authorUrl?: string
      externalId?: string
      externalUrl?: string
      publishedAt?: string
      source?: string
    }
  }>(
    "/api/v1/feedback",
    {
      config: { skipAuth: true },
      schema: {
        body: {
          type: "object",
          required: ["text"],
          properties: {
            text:        { type: "string", minLength: 1, maxLength: 50000 },
            authorName:  { type: "string" },
            authorEmail: { type: "string" },
            authorUrl:   { type: "string" },
            externalId:  { type: "string" },
            externalUrl: { type: "string" },
            publishedAt: { type: "string" },
            source:      { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const authHeader = request.headers.authorization ?? ""
      const key = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""

      if (!key) {
        return reply.code(401).send({ error: "Missing API key", code: "UNAUTHORIZED" })
      }

      const keyHash = hashKey(key)

      const workspace = await fastify.prisma.workspace.findFirst({
        where: { apiKeyHash: keyHash },
        select: { id: true },
      })

      if (!workspace) {
        return reply.code(401).send({ error: "Invalid API key", code: "INVALID_KEY" })
      }

      // Find or create the API connector for this workspace
      let connector = await fastify.prisma.connector.findFirst({
        where: { workspaceId: workspace.id, type: "API" },
      })

      if (!connector) {
        connector = await fastify.prisma.connector.create({
          data: {
            workspaceId: workspace.id,
            type:        "API",
            name:        "Public API",
            status:      "ACTIVE",
            configJson:  {},
          },
        })
      }

      const externalId = request.body.externalId ?? `api-${Date.now()}-${Math.random().toString(36).slice(2)}`

      const rawPayload = {
        verbatimText: request.body.text,
        authorName:   request.body.authorName,
        authorEmail:  request.body.authorEmail,
        authorUrl:    request.body.authorUrl,
        externalId,
        externalUrl:  request.body.externalUrl,
        publishedAt:  request.body.publishedAt ?? new Date().toISOString(),
        rawPayload:   request.body,
      }

      try {
        const queueItem = await fastify.prisma.ingestionQueue.create({
          data: {
            connectorId: connector.id,
            externalId,
            rawPayload,
            sourceType:  "API",
            status:      "PENDING",
          },
        })
        await getQueue().add(JOB_NAMES.PROCESS_ITEM, { ingestionQueueId: queueItem.id })
        return reply.code(202).send({ accepted: true, id: queueItem.id })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes("Unique constraint")) {
          return reply.code(409).send({ error: "Duplicate externalId", code: "DUPLICATE" })
        }
        throw err
      }
    },
  )

  // ── API key management (requires OWNER/ADMIN) ─────────────────────────────

  fastify.post<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/api-key",
    { preHandler: requireRole("ADMIN") },
    async (request, reply) => {
      if (request.params.workspaceId !== request.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      // Generate a random key with a recognisable prefix
      const rawKey = `vxly_live_${randomBytes(24).toString("base64url")}`
      const keyHash = hashKey(rawKey)

      await fastify.prisma.workspace.update({
        where: { id: request.workspaceId },
        data:  { apiKeyHash: keyHash },
      })

      audit({
        prisma:       fastify.prisma,
        workspaceId:  request.workspaceId,
        userId:       request.clerkUserId,
        action:       "api_key.rotate",
        resourceType: "workspace",
        resourceId:   request.workspaceId,
      })

      // Return the raw key once — it cannot be retrieved again
      return { key: rawKey, note: "Store this key securely. It will not be shown again." }
    },
  )

  fastify.delete<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/api-key",
    { preHandler: requireRole("ADMIN") },
    async (request, reply) => {
      if (request.params.workspaceId !== request.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      await fastify.prisma.workspace.update({
        where: { id: request.workspaceId },
        data:  { apiKeyHash: null },
      })
      audit({
        prisma:       fastify.prisma,
        workspaceId:  request.workspaceId,
        userId:       request.clerkUserId,
        action:       "api_key.revoke",
        resourceType: "workspace",
        resourceId:   request.workspaceId,
      })
      return reply.code(204).send()
    },
  )
}

export default publicRoutes
