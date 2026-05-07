import type { FastifyPluginAsync } from "fastify"
import {
  createRedisConnection,
  createIngestionQueue,
  createGongTranscriptQueue,
  JOB_NAMES,
} from "@voxly/queue"
import {
  verifySlackSignature,
  verifyIntercomSignature,
  verifyZendeskSignature,
  verifyCannySignature,
  verifyGongSignature,
} from "@voxly/connectors"
import type { ConnectorConfig } from "@voxly/types"

// Lazily initialize queues on first use
let _ingestionQueue: ReturnType<typeof createIngestionQueue> | null = null
let _gongQueue: ReturnType<typeof createGongTranscriptQueue> | null = null

function getIngestionQueue() {
  if (!_ingestionQueue) {
    _ingestionQueue = createIngestionQueue(createRedisConnection())
  }
  return _ingestionQueue
}

function getGongQueue() {
  if (!_gongQueue) {
    _gongQueue = createGongTranscriptQueue(createRedisConnection())
  }
  return _gongQueue
}

const webhooks: FastifyPluginAsync = async (fastify) => {
  // Override the JSON content-type parser in this plugin scope so we can
  // capture the raw body for HMAC signature verification.
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req, body, done) => {
      try {
        done(null, body)
      } catch (err) {
        done(err as Error)
      }
    },
  )

  fastify.post<{ Params: { connectorId: string } }>(
    "/webhooks/:connectorId",
    async (request, reply) => {
      const rawBody = request.body as Buffer
      const { connectorId } = request.params

      // Load connector — workspace isolation via direct lookup (no auth needed
      // for incoming webhooks, but we must verify the provider signature)
      const connector = await fastify.prisma.connector.findUnique({
        where: { id: connectorId },
      })

      if (!connector || !connector.enabled) {
        return reply.code(404).send({ error: "Connector not found" })
      }

      const config = connector.configJson as ConnectorConfig

      // ── Signature verification ──────────────────────────────────────────────

      const headers = request.headers

      if (connector.type === "SLACK") {
        const timestamp = headers["x-slack-request-timestamp"] as string | undefined
        const signature = headers["x-slack-signature"] as string | undefined
        const signingSecret = config.webhookSecret

        if (!timestamp || !signature || !signingSecret) {
          return reply.code(401).send({ error: "Missing Slack signature headers" })
        }

        const valid = verifySlackSignature(signingSecret, rawBody, timestamp, signature)
        if (!valid) {
          return reply.code(401).send({ error: "Invalid Slack signature" })
        }

        // Slack URL verification challenge (sent once when you register the endpoint)
        const parsed = JSON.parse(rawBody.toString("utf8")) as { type: string; challenge?: string }
        if (parsed.type === "url_verification") {
          return reply.send({ challenge: parsed.challenge })
        }
      } else if (connector.type === "INTERCOM") {
        const signature = headers["x-hub-signature"] as string | undefined
        const clientSecret = config.webhookSecret

        if (!signature || !clientSecret) {
          return reply.code(401).send({ error: "Missing Intercom signature" })
        }

        const valid = verifyIntercomSignature(clientSecret, rawBody, signature)
        if (!valid) {
          return reply.code(401).send({ error: "Invalid Intercom signature" })
        }
      } else if (connector.type === "ZENDESK") {
        const timestamp = headers["x-zendesk-webhook-signature-timestamp"] as string | undefined
        const signature = headers["x-zendesk-webhook-signature"] as string | undefined
        const signingSecret = config.webhookSecret

        if (!timestamp || !signature || !signingSecret) {
          return reply.code(401).send({ error: "Missing Zendesk signature headers" })
        }

        const valid = verifyZendeskSignature(signingSecret, rawBody, timestamp, signature)
        if (!valid) {
          return reply.code(401).send({ error: "Invalid Zendesk signature" })
        }
      } else if (connector.type === "CANNY") {
        const signature = headers["x-canny-signature"] as string | undefined
        const apiKey = config.accessToken

        if (!signature || !apiKey) {
          return reply.code(401).send({ error: "Missing Canny signature" })
        }

        const valid = verifyCannySignature(apiKey, rawBody, signature)
        if (!valid) {
          return reply.code(401).send({ error: "Invalid Canny signature" })
        }
      } else if (connector.type === "GONG") {
        const signature = headers["x-gong-signature"] as string | undefined
        const signingKey = config.webhookSecret

        if (!signature || !signingKey) {
          return reply.code(401).send({ error: "Missing Gong signature" })
        }

        const valid = verifyGongSignature(signingKey, rawBody, signature)
        if (!valid) {
          return reply.code(401).send({ error: "Invalid Gong signature" })
        }
      }

      // ── Parse body and enqueue ──────────────────────────────────────────────

      let payload: unknown
      try {
        payload = JSON.parse(rawBody.toString("utf8"))
      } catch {
        return reply.code(400).send({ error: "Invalid JSON body" })
      }

      // Generate a stable external ID from the payload if possible.
      // Connectors will produce the real externalId during normalize(), but
      // we need something unique for the job deduplication key here.
      const jobId = `${connectorId}:${Date.now()}:${Math.random().toString(36).slice(2)}`

      const jobData = {
        connectorId,
        workspaceId: connector.workspaceId,
        externalId:  jobId,
        rawPayload:  payload,
        sourceType:  connector.type,
      }

      // Gong webhooks carry a callId — route to the dedicated Gong transcript
      // queue so the worker can fetch the full transcript via the Transcript API.
      if (connector.type === "GONG") {
        await getGongQueue().add(JOB_NAMES.INGEST_ITEM, jobData, { jobId })
      } else {
        await getIngestionQueue().add(JOB_NAMES.INGEST_ITEM, jobData, { jobId })
      }

      return reply.code(200).send({ ok: true })
    },
  )
}

export default webhooks
