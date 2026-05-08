import type { FastifyPluginAsync } from "fastify"

const analytics: FastifyPluginAsync = async (fastify) => {

  // ── Workspace usage analytics ─────────────────────────────────────────────
  fastify.get<{ Params: { workspaceId: string }; Querystring: { days?: string } }>(
    "/api/workspaces/:workspaceId/analytics",
    async (request, reply) => {
      if (request.params.workspaceId !== request.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const days = Math.min(90, Math.max(7, parseInt(request.query.days ?? "30", 10)))
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      const stale = new Date(Date.now() - 25 * 60 * 60 * 1000) // >25h = stale

      const wid = request.workspaceId

      const [connectors, feedbackByStatus, feedbackBySource, workflowStats, recentRuns] =
        await Promise.all([
          // Connector health
          fastify.prisma.connector.findMany({
            where: { workspaceId: wid },
            select: {
              id: true, type: true, name: true, status: true,
              lastPolledAt: true, itemCount: true, errorMessage: true,
            },
            orderBy: { itemCount: "desc" },
          }),

          // Feedback by status
          fastify.prisma.feedbackItem.groupBy({
            by: ["status"],
            where: { workspaceId: wid },
            _count: true,
          }),

          // Feedback by source this period
          fastify.prisma.feedbackItem.groupBy({
            by: ["sourceType"],
            where: { workspaceId: wid, ingestedAt: { gte: since } },
            _count: true,
            orderBy: { _count: { sourceType: "desc" } },
          }),

          // Workflow stats
          fastify.prisma.workflow.findMany({
            where: { workspaceId: wid },
            select: { id: true, name: true, isActive: true, runCount: true, lastRunAt: true },
          }),

          // Recent workflow runs
          fastify.prisma.workflowRun.findMany({
            where: {
              workflow: { workspaceId: wid },
              startedAt: { gte: since },
            },
            select: { id: true, workflowId: true, status: true, startedAt: true, completedAt: true },
            orderBy: { startedAt: "desc" },
            take: 50,
          }),
        ])

      // Compute connector health
      const connectorHealth = connectors.map((c) => {
        let health: "healthy" | "error" | "stale" | "paused"
        if (c.status === "PAUSED") health = "paused"
        else if (c.status === "ERROR") health = "error"
        else if (c.lastPolledAt && c.lastPolledAt < stale) health = "stale"
        else health = "healthy"
        return { ...c, health, lastPolledAt: c.lastPolledAt?.toISOString() ?? null }
      })

      // Feedback actioned rate
      const statusMap = Object.fromEntries(feedbackByStatus.map((r) => [r.status, r._count]))
      const total = Object.values(statusMap).reduce((s, n) => s + n, 0)
      const actioned = (statusMap.RESOLVED ?? 0) + (statusMap.ARCHIVED ?? 0)
      const actionedRate = total > 0 ? Math.round((actioned / total) * 100) : 0

      // Workflow success rate (last N days)
      const runTotal = recentRuns.length
      const runSuccess = recentRuns.filter((r) => r.status === "COMPLETED").length
      const successRate = runTotal > 0 ? Math.round((runSuccess / runTotal) * 100) : null

      return {
        connectors: connectorHealth,
        feedback: {
          total,
          actioned,
          actionedRate,
          byStatus: statusMap,
          bySource: Object.fromEntries(feedbackBySource.map((r) => [r.sourceType, r._count])),
          periodDays: days,
          periodTotal: feedbackBySource.reduce((s, r) => s + r._count, 0),
        },
        workflows: {
          active:      workflowStats.filter((w) => w.isActive).length,
          total:       workflowStats.length,
          successRate,
          recentRuns:  recentRuns.map((r) => ({
            ...r,
            startedAt:   r.startedAt.toISOString(),
            completedAt: r.completedAt?.toISOString() ?? null,
          })),
        },
      }
    },
  )

  // ── Audit log ─────────────────────────────────────────────────────────────
  fastify.get<{
    Params: { workspaceId: string }
    Querystring: { limit?: string; before?: string }
  }>(
    "/api/workspaces/:workspaceId/audit-logs",
    async (request, reply) => {
      if (request.params.workspaceId !== request.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      const limit = Math.min(200, Math.max(1, parseInt(request.query.limit ?? "50", 10)))
      const before = request.query.before ? new Date(request.query.before) : undefined

      const logs = await fastify.prisma.auditLog.findMany({
        where: {
          workspaceId: request.workspaceId,
          ...(before && { createdAt: { lt: before } }),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      })

      return { data: logs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })) }
    },
  )

  // ── Workspace settings ────────────────────────────────────────────────────
  fastify.get<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/settings",
    async (request, reply) => {
      if (request.params.workspaceId !== request.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      const workspace = await fastify.prisma.workspace.findUnique({
        where: { id: request.workspaceId },
        select: {
          id: true, name: true, slug: true, plan: true,
          apiKeyHash: true,
          workosConnectionId: true,
          createdAt: true,
          members: {
            select: {
              id: true, clerkUserId: true, email: true, name: true, role: true, createdAt: true,
            },
            orderBy: { role: "asc" },
          },
        },
      })
      if (!workspace) return reply.code(404).send({ error: "Workspace not found" })
      return {
        ...workspace,
        apiKeyHash: undefined,
        hasApiKey: !!workspace.apiKeyHash,
        createdAt: workspace.createdAt?.toISOString(),
        members: workspace.members.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
      }
    },
  )

  // ── Update member role (OWNER only) ──────────────────────────────────────
  fastify.patch<{
    Params: { workspaceId: string; memberId: string }
    Body: { role: "ADMIN" | "MEMBER" | "VIEWER" }
  }>(
    "/api/workspaces/:workspaceId/members/:memberId/role",
    async (request, reply) => {
      if (request.params.workspaceId !== request.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      if (request.memberRole !== "OWNER") {
        return reply.code(403).send({ error: "Only owners can change member roles" })
      }
      const { memberId } = request.params
      const { role } = request.body

      const updated = await fastify.prisma.workspaceMember.update({
        where: { id: memberId },
        data: { role },
      })
      return updated
    },
  )
}

export default analytics
