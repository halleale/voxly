import type { FastifyPluginAsync } from "fastify"
import { createRepo } from "@voxly/db"
import {
  getRedisConnection,
  createIngestionQueue,
  JOB_INGEST_ITEM,
  type IngestItemJob,
} from "@voxly/queue"

const ingestionQueue = createIngestionQueue(getRedisConnection())

const webhooks: FastifyPluginAsync = async (fastify) => {
  // POST /webhooks/:connectorId
  // Receives events from Slack Events API, Intercom, Zendesk, etc.
  fastify.post<{ Params: { connectorId: string } }>(
    "/webhooks/:connectorId",
    {
      config: { rawBody: true },
    },
    async (request, reply) => {
      const { connectorId } = request.params
      const body = request.body

      const connector = await fastify.prisma.connector.findUnique({
        where: { id: connectorId },
        select: { id: true, type: true, workspaceId: true, enabled: true, configJson: true },
      })

      if (!connector) return reply.code(404).send({ error: "Connector not found" })
      if (!connector.enabled) return reply.code(200).send({ ok: true, skipped: "disabled" })

      // Slack URL verification challenge (one-time during app setup)
      const b = body as Record<string, unknown>
      if (connector.type === "SLACK" && b.type === "url_verification") {
        return reply.send({ challenge: b.challenge })
      }

      // Verify Slack request signature if secret is configured
      const config = connector.configJson as { webhookSecret?: string }
      if (connector.type === "SLACK" && config.webhookSecret) {
        const ts = request.headers["x-slack-request-timestamp"] as string
        const sig = request.headers["x-slack-signature"] as string
        const isValid = await verifySlackSignature(
          config.webhookSecret,
          ts,
          JSON.stringify(body),
          sig
        )
        if (!isValid) return reply.code(401).send({ error: "Invalid signature" })
      }

      const job: IngestItemJob = {
        connectorId: connector.id,
        workspaceId: connector.workspaceId,
        rawPayload: body,
        sourceType: connector.type,
      }

      await ingestionQueue.add(JOB_INGEST_ITEM, job, {
        jobId: `ingest-${connectorId}-${Date.now()}`,
      })

      return reply.send({ ok: true })
    }
  )
}

async function verifySlackSignature(
  secret: string,
  timestamp: string,
  body: string,
  signature: string
): Promise<boolean> {
  if (!timestamp || !signature) return false

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (ageSeconds > 300) return false // replay attack guard

  const sigBase = `v0:${timestamp}:${body}`
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const sigBytes = await crypto.subtle.sign("HMAC", key, enc.encode(sigBase))
  const hex = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  const expected = `v0=${hex}`
  return expected === signature
}

export default webhooks
