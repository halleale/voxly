import type { FastifyPluginAsync } from "fastify"
import { createRepo } from "@voxly/db"
import {
  createLinearIssue,
  addLinearComment,
  buildLinearIssueBody,
  fetchLinearTeams,
} from "@voxly/connectors"
import type { ConnectorConfig } from "@voxly/types"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function assertWorkspace(request: { params: { workspaceId: string }; workspaceId: string }, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
  if (request.params.workspaceId !== request.workspaceId) {
    reply.code(403).send({ error: "Forbidden" })
    return false
  }
  return true
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const actions: FastifyPluginAsync = async (fastify) => {

  // ── Assign ──────────────────────────────────────────────────────────────────
  fastify.post<{
    Params: { workspaceId: string; itemId: string }
    Body: { assigneeId: string | null }
  }>(
    "/api/workspaces/:workspaceId/feedback/:itemId/assign",
    async (request, reply) => {
      if (!assertWorkspace(request, reply)) return
      const { itemId } = request.params
      const { assigneeId } = request.body

      const item = await fastify.prisma.feedbackItem.findFirst({
        where: { id: itemId, workspaceId: request.workspaceId },
      })
      if (!item) return reply.code(404).send({ error: "Not found" })

      const updated = await fastify.prisma.feedbackItem.update({
        where: { id: itemId },
        data: {
          assigneeId: assigneeId ?? null,
          status: assigneeId ? "ASSIGNED" : item.status,
        },
      })
      return updated
    },
  )

  // ── Status transition ───────────────────────────────────────────────────────
  fastify.post<{
    Params: { workspaceId: string; itemId: string }
    Body: { status: "NEW" | "ASSIGNED" | "RESOLVED" | "ARCHIVED" }
  }>(
    "/api/workspaces/:workspaceId/feedback/:itemId/status",
    async (request, reply) => {
      if (!assertWorkspace(request, reply)) return
      const { itemId } = request.params
      const { status } = request.body

      const item = await fastify.prisma.feedbackItem.findFirst({
        where: { id: itemId, workspaceId: request.workspaceId },
      })
      if (!item) return reply.code(404).send({ error: "Not found" })

      const updated = await fastify.prisma.feedbackItem.update({
        where: { id: itemId },
        data: { status },
      })
      return updated
    },
  )

  // ── Create Linear ticket ────────────────────────────────────────────────────
  fastify.post<{
    Params: { workspaceId: string; itemId: string }
    Body: { provider: "LINEAR"; teamId?: string }
  }>(
    "/api/workspaces/:workspaceId/feedback/:itemId/create-ticket",
    async (request, reply) => {
      if (!assertWorkspace(request, reply)) return
      const { itemId } = request.params
      const { provider, teamId } = request.body

      if (provider !== "LINEAR") {
        return reply.code(400).send({ error: "Only Linear is supported at this time" })
      }

      const [item, linearConnector] = await Promise.all([
        fastify.prisma.feedbackItem.findFirst({
          where: { id: itemId, workspaceId: request.workspaceId },
          include: { customer: true, theme: true },
        }),
        fastify.prisma.connector.findFirst({
          where: { workspaceId: request.workspaceId, type: "LINEAR", enabled: true },
        }),
      ])

      if (!item) return reply.code(404).send({ error: "Feedback item not found" })
      if (!linearConnector) return reply.code(400).send({ error: "Linear connector not configured" })

      const config = linearConnector.configJson as ConnectorConfig
      if (!config.accessToken) return reply.code(400).send({ error: "Linear not authenticated" })

      // Pick team: use provided teamId or fall back to first available
      let resolvedTeamId = teamId
      if (!resolvedTeamId) {
        const teams = await fetchLinearTeams(config.accessToken)
        resolvedTeamId = teams[0]?.id
        if (!resolvedTeamId) return reply.code(400).send({ error: "No Linear teams found" })
      }

      const title = item.extractedSummary?.slice(0, 120) ?? item.verbatimText.slice(0, 120)
      const description = buildLinearIssueBody({
        verbatimText: item.verbatimText,
        authorName:   item.authorName,
        customerName: item.customer?.name,
        customerTier: item.customer?.tier ?? null,
        arrCents:     item.customer?.arrCents ?? null,
        sourceType:   item.sourceType,
        externalUrl:  item.externalUrl,
        feedbackItemId: item.id,
        appUrl: process.env.WEB_URL ?? "http://localhost:3000",
      })

      const issue = await createLinearIssue({
        accessToken: config.accessToken,
        teamId: resolvedTeamId,
        title,
        description,
      })

      // Persist the linked ticket
      const linked = await fastify.prisma.linkedTicket.create({
        data: {
          workspaceId:    request.workspaceId,
          feedbackItemId: itemId,
          provider:       "LINEAR",
          ticketId:       issue.id,
          ticketUrl:      issue.url,
          ticketTitle:    issue.title,
          ticketStatus:   issue.state.name,
          syncedAt:       new Date(),
        },
      })

      // Transition item to ASSIGNED if it was NEW
      if (item.status === "NEW") {
        await fastify.prisma.feedbackItem.update({
          where: { id: itemId },
          data: { status: "ASSIGNED" },
        })
      }

      return { ticket: linked, issue }
    },
  )

  // ── Add evidence to existing ticket ────────────────────────────────────────
  fastify.post<{
    Params: { workspaceId: string; itemId: string }
    Body: { linkedTicketId: string }
  }>(
    "/api/workspaces/:workspaceId/feedback/:itemId/add-evidence",
    async (request, reply) => {
      if (!assertWorkspace(request, reply)) return
      const { itemId } = request.params
      const { linkedTicketId } = request.body

      const [item, linkedTicket, linearConnector] = await Promise.all([
        fastify.prisma.feedbackItem.findFirst({
          where: { id: itemId, workspaceId: request.workspaceId },
          include: { customer: true },
        }),
        fastify.prisma.linkedTicket.findFirst({ where: { id: linkedTicketId, workspaceId: request.workspaceId } }),
        fastify.prisma.connector.findFirst({
          where: { workspaceId: request.workspaceId, type: "LINEAR", enabled: true },
        }),
      ])

      if (!item) return reply.code(404).send({ error: "Feedback item not found" })
      if (!linkedTicket) return reply.code(404).send({ error: "Linked ticket not found" })
      if (!linearConnector) return reply.code(400).send({ error: "Linear connector not configured" })

      const config = linearConnector.configJson as ConnectorConfig
      if (!config.accessToken) return reply.code(400).send({ error: "Linear not authenticated" })

      const arr = item.customer?.arrCents
        ? `$${Math.round(item.customer.arrCents / 100).toLocaleString()} ARR`
        : null

      const commentBody = [
        `**Additional feedback** from ${item.authorName ?? "a customer"}` +
          (item.customer ? ` at ${item.customer.name}${arr ? ` (${arr})` : ""}` : ""),
        ``,
        `> ${item.verbatimText.replace(/\n/g, "\n> ")}`,
        ``,
        item.externalUrl ? `[Source](${item.externalUrl})` : null,
      ]
        .filter((l): l is string => l !== null)
        .join("\n")

      await addLinearComment(config.accessToken, linkedTicket.ticketId, commentBody)

      return { ok: true }
    },
  )

  // ── Bulk actions ───────────────────────────────────────────────────────────
  fastify.post<{
    Params: { workspaceId: string }
    Body: {
      ids: string[]
      action: "archive" | "resolve" | "assign"
      assigneeId?: string | null
    }
  }>(
    "/api/workspaces/:workspaceId/feedback/bulk",
    async (request, reply) => {
      if (!assertWorkspace(request, reply)) return
      const { ids, action, assigneeId } = request.body

      if (!Array.isArray(ids) || ids.length === 0) {
        return reply.code(400).send({ error: "ids must be a non-empty array" })
      }
      if (ids.length > 200) {
        return reply.code(400).send({ error: "Cannot bulk-action more than 200 items at once" })
      }

      const where = { id: { in: ids }, workspaceId: request.workspaceId }

      let updated = 0

      if (action === "archive") {
        const r = await fastify.prisma.feedbackItem.updateMany({ where, data: { status: "ARCHIVED" } })
        updated = r.count
      } else if (action === "resolve") {
        const r = await fastify.prisma.feedbackItem.updateMany({ where, data: { status: "RESOLVED" } })
        updated = r.count
      } else if (action === "assign") {
        const data: Record<string, unknown> = {
          assigneeId: assigneeId ?? null,
          ...(assigneeId ? { status: "ASSIGNED" } : {}),
        }
        const r = await fastify.prisma.feedbackItem.updateMany({ where, data })
        updated = r.count
      } else {
        return reply.code(400).send({ error: "Unknown action" })
      }

      return { updated }
    },
  )

  // ── Get Linear teams (for ticket creation modal picker) ────────────────────
  fastify.get<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/linear/teams",
    async (request, reply) => {
      if (!assertWorkspace(request, reply)) return

      const connector = await fastify.prisma.connector.findFirst({
        where: { workspaceId: request.workspaceId, type: "LINEAR", enabled: true },
      })
      if (!connector) return reply.code(404).send({ error: "Linear not connected" })

      const config = connector.configJson as ConnectorConfig
      if (!config.accessToken) return reply.code(400).send({ error: "Linear not authenticated" })

      const teams = await fetchLinearTeams(config.accessToken)
      return { teams }
    },
  )
}

export default actions
