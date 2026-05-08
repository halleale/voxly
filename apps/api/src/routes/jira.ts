import type { FastifyPluginAsync } from "fastify"
import {
  fetchJiraCloudId,
  fetchJiraProjects,
  createJiraIssue,
  addJiraComment,
  fetchJiraIssueStatus,
  buildJiraIssueDescription,
} from "@voxly/connectors"
import type { ConnectorConfig } from "@voxly/types"

const jira: FastifyPluginAsync = async (fastify) => {
  // ── Get accessible Jira projects ───────────────────────────────────────────
  fastify.get<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/jira/projects",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const connector = await fastify.prisma.connector.findFirst({
        where: { workspaceId: request.params.workspaceId, type: "JIRA", enabled: true },
      })
      if (!connector) return reply.code(404).send({ error: "Jira not connected" })

      const config = connector.configJson as ConnectorConfig & { settings?: { cloudId?: string } }
      if (!config.accessToken) return reply.code(400).send({ error: "Jira not authenticated" })

      const cloudId = config.settings?.cloudId ?? (await fetchJiraCloudId(config.accessToken))?.id
      if (!cloudId) return reply.code(400).send({ error: "Could not resolve Jira cloud ID" })

      const projects = await fetchJiraProjects(config.accessToken, cloudId)
      return { projects }
    },
  )

  // ── Create a Jira issue from a feedback item ────────────────────────────────
  fastify.post<{
    Params: { workspaceId: string; itemId: string }
    Body: { projectKey: string; issueType?: string }
  }>(
    "/api/workspaces/:workspaceId/feedback/:itemId/create-jira-ticket",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const { itemId } = request.params
      const { projectKey, issueType } = request.body

      const [item, jiraConnector] = await Promise.all([
        fastify.prisma.feedbackItem.findFirst({
          where: { id: itemId, workspaceId: request.workspaceId },
          include: { customer: true, theme: true },
        }),
        fastify.prisma.connector.findFirst({
          where: { workspaceId: request.workspaceId, type: "JIRA", enabled: true },
        }),
      ])

      if (!item) return reply.code(404).send({ error: "Feedback item not found" })
      if (!jiraConnector) return reply.code(400).send({ error: "Jira connector not configured" })

      const config = jiraConnector.configJson as ConnectorConfig & { settings?: { cloudId?: string } }
      if (!config.accessToken) return reply.code(400).send({ error: "Jira not authenticated" })

      const cloudId =
        config.settings?.cloudId ?? (await fetchJiraCloudId(config.accessToken))?.id
      if (!cloudId) return reply.code(400).send({ error: "Could not resolve Jira cloud ID" })

      const summary = (item.extractedSummary ?? item.verbatimText).slice(0, 255)
      const description = buildJiraIssueDescription({
        verbatimText:   item.verbatimText,
        authorName:     item.authorName,
        customerName:   item.customer?.name,
        customerTier:   item.customer?.tier ?? null,
        arrCents:       item.customer?.arrCents ?? null,
        sourceType:     item.sourceType,
        externalUrl:    item.externalUrl,
        feedbackItemId: item.id,
        appUrl:         process.env.WEB_URL ?? "http://localhost:3000",
      })

      const issue = await createJiraIssue({
        accessToken: config.accessToken,
        cloudId,
        projectKey,
        summary,
        description,
        issueType,
      })

      const linked = await fastify.prisma.linkedTicket.create({
        data: {
          workspaceId:    request.workspaceId,
          feedbackItemId: itemId,
          provider:       "JIRA",
          ticketId:       issue.id,
          ticketUrl:      issue.url,
          ticketTitle:    summary,
          ticketStatus:   "Open",
          syncedAt:       new Date(),
        },
      })

      if (item.status === "NEW") {
        await fastify.prisma.feedbackItem.update({
          where: { id: itemId },
          data: { status: "ASSIGNED" },
        })
      }

      return { ticket: linked, issue }
    },
  )

  // ── Add evidence comment to an existing Jira issue ─────────────────────────
  fastify.post<{
    Params: { workspaceId: string; itemId: string }
    Body: { linkedTicketId: string }
  }>(
    "/api/workspaces/:workspaceId/feedback/:itemId/add-jira-evidence",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const { itemId } = request.params
      const { linkedTicketId } = request.body

      const [item, linkedTicket, jiraConnector] = await Promise.all([
        fastify.prisma.feedbackItem.findFirst({
          where: { id: itemId, workspaceId: request.workspaceId },
          include: { customer: true },
        }),
        fastify.prisma.linkedTicket.findUnique({ where: { id: linkedTicketId } }),
        fastify.prisma.connector.findFirst({
          where: { workspaceId: request.workspaceId, type: "JIRA", enabled: true },
        }),
      ])

      if (!item) return reply.code(404).send({ error: "Feedback item not found" })
      if (!linkedTicket) return reply.code(404).send({ error: "Linked ticket not found" })
      if (!jiraConnector) return reply.code(400).send({ error: "Jira not configured" })

      const config = jiraConnector.configJson as ConnectorConfig & { settings?: { cloudId?: string } }
      if (!config.accessToken) return reply.code(400).send({ error: "Jira not authenticated" })

      const cloudId =
        config.settings?.cloudId ?? (await fetchJiraCloudId(config.accessToken))?.id
      if (!cloudId) return reply.code(400).send({ error: "Could not resolve Jira cloud ID" })

      const arr = item.customer?.arrCents
        ? `$${Math.round(item.customer.arrCents / 100).toLocaleString()} ARR`
        : null

      const body = [
        `Additional feedback from ${item.authorName ?? "a customer"}` +
          (item.customer ? ` at ${item.customer.name}${arr ? ` (${arr})` : ""}` : ""),
        ``,
        `"${item.verbatimText}"`,
        ``,
        item.externalUrl ? `Source: ${item.externalUrl}` : null,
      ]
        .filter((l): l is string => l !== null)
        .join("\n")

      await addJiraComment(config.accessToken, cloudId, linkedTicket.ticketId, body)

      return { ok: true }
    },
  )

  // ── Sync Jira ticket status (called on dashboard load / background job) ────
  fastify.post<{
    Params: { workspaceId: string }
    Body: { linkedTicketIds: string[] }
  }>(
    "/api/workspaces/:workspaceId/jira/sync-status",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const { linkedTicketIds } = request.body
      if (!Array.isArray(linkedTicketIds) || linkedTicketIds.length > 50) {
        return reply.code(400).send({ error: "Provide 1–50 linkedTicketIds" })
      }

      const jiraConnector = await fastify.prisma.connector.findFirst({
        where: { workspaceId: request.workspaceId, type: "JIRA", enabled: true },
      })
      if (!jiraConnector) return { updated: 0 }

      const config = jiraConnector.configJson as ConnectorConfig & { settings?: { cloudId?: string } }
      if (!config.accessToken) return { updated: 0 }

      const cloudId =
        config.settings?.cloudId ?? (await fetchJiraCloudId(config.accessToken))?.id
      if (!cloudId) return { updated: 0 }

      const tickets = await fastify.prisma.linkedTicket.findMany({
        where: {
          id: { in: linkedTicketIds },
          workspaceId: request.workspaceId,
          provider: "JIRA",
        },
      })

      let updated = 0
      for (const ticket of tickets) {
        const result = await fetchJiraIssueStatus(
          config.accessToken,
          cloudId,
          ticket.ticketId,
        )
        if (result && result.status !== ticket.ticketStatus) {
          await fastify.prisma.linkedTicket.update({
            where: { id: ticket.id },
            data: { ticketStatus: result.status, syncedAt: new Date() },
          })
          updated++
        }
      }

      return { updated }
    },
  )
}

export default jira
