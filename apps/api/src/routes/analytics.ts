import type { FastifyPluginAsync } from "fastify"

/**
 * Usage analytics — intended for Voxly's own customer success team.
 *
 * Returns:
 *   - connectorHealth: status + item counts per connector
 *   - feedbackActioned: ratio of non-NEW items over total
 *   - workflowStats: run counts, success/fail breakdown, last-run timestamps
 *   - inboxStats: pending uncertain items count
 *   - memberActivity: rough audit-log counts per actor (last 30 days)
 */
const analytics: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/analytics",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const wid = request.params.workspaceId
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

      const [
        connectors,
        feedbackTotal,
        feedbackActioned,
        workflows,
        workflowRunBreakdown,
        inboxPending,
        recentAuditByActor,
        feedbackBySource,
        feedbackByDay,
      ] = await Promise.all([
        // Connector health
        fastify.prisma.connector.findMany({
          where: { workspaceId: wid },
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            enabled: true,
            itemCount: true,
            lastPolledAt: true,
            errorMessage: true,
          },
        }),

        // Total feedback items
        fastify.prisma.feedbackItem.count({ where: { workspaceId: wid } }),

        // Actioned (non-NEW) feedback items
        fastify.prisma.feedbackItem.count({
          where: { workspaceId: wid, status: { not: "NEW" } },
        }),

        // Workflow summaries
        fastify.prisma.workflow.findMany({
          where: { workspaceId: wid },
          select: {
            id: true,
            name: true,
            isActive: true,
            runCount: true,
            lastRunAt: true,
          },
        }),

        // Workflow run success/fail breakdown (last 30 days)
        fastify.prisma.workflowRun.groupBy({
          by: ["status"],
          where: {
            workflow: { workspaceId: wid },
            startedAt: { gte: thirtyDaysAgo },
          },
          _count: { _all: true },
        }),

        // Inbox: uncertain items awaiting review
        fastify.prisma.ingestionQueue.count({
          where: { connector: { workspaceId: wid }, status: "UNCERTAIN" },
        }),

        // Recent audit events grouped by actor (last 30 days)
        fastify.prisma.auditLog.groupBy({
          by: ["actorId"],
          where: { workspaceId: wid, createdAt: { gte: thirtyDaysAgo } },
          _count: { _all: true },
          orderBy: { _count: { actorId: "desc" } },
          take: 10,
        }),

        // Feedback volume by source type
        fastify.prisma.feedbackItem.groupBy({
          by: ["sourceType"],
          where: { workspaceId: wid },
            _count: { _all: true },
          orderBy: { _count: { sourceType: "desc" } },
        }),

        // Feedback ingested per day over the last 30 days (raw SQL for date trunc)
        fastify.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
          SELECT DATE_TRUNC('day', ingested_at) AS day, COUNT(*)::bigint AS count
          FROM feedback_items
          WHERE workspace_id = ${wid}
            AND ingested_at >= ${thirtyDaysAgo}
          GROUP BY 1
          ORDER BY 1 ASC
        `,
      ])

      const actionedRate = feedbackTotal === 0
        ? 0
        : Math.round((feedbackActioned / feedbackTotal) * 1000) / 10 // one decimal %

      return {
        connectorHealth: connectors.map((c) => ({
          ...c,
          healthy: c.status === "ACTIVE" && c.enabled,
        })),
        feedbackSummary: {
          total: feedbackTotal,
          actioned: feedbackActioned,
          actionedRate,
          inboxPending,
        },
        feedbackBySource: feedbackBySource.map((r) => ({
          sourceType: r.sourceType,
          count: r._count._all,
        })),
        feedbackByDay: feedbackByDay.map((r) => ({
          day: r.day.toISOString().slice(0, 10),
          count: Number(r.count),
        })),
        workflowStats: {
          workflows: workflows.map((w) => ({
            ...w,
            recentRuns: workflowRunBreakdown
              .filter(() => true) // breakdown is workspace-wide; per-workflow breakdown below
              .reduce((acc, r) => acc + r._count._all, 0),
          })),
          runBreakdown: workflowRunBreakdown.map((r) => ({
            status: r.status,
            count: r._count._all,
          })),
        },
        memberActivity: recentAuditByActor.map((r) => ({
          actorId: r.actorId,
          actionCount: r._count._all,
        })),
      }
    }
  )
}

export default analytics
