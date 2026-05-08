import type { FastifyPluginAsync } from "fastify"
import { createRepo } from "@voxly/db"

const themes: FastifyPluginAsync = async (fastify) => {
  // ── List themes ────────────────────────────────────────────────────────────
  fastify.get<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/themes",
    async (request, reply) => {
      if (request.params.workspaceId !== request.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      const repo = createRepo(fastify.prisma, request.workspaceId)
      const data = await repo.theme.findMany({
        orderBy: { itemCount: "desc" },
      })
      return { data }
    },
  )

  // ── Get single theme ───────────────────────────────────────────────────────
  fastify.get<{ Params: { workspaceId: string; themeId: string } }>(
    "/api/workspaces/:workspaceId/themes/:themeId",
    async (request, reply) => {
      if (request.params.workspaceId !== request.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      const theme = await fastify.prisma.theme.findFirst({
        where: { id: request.params.themeId, workspaceId: request.workspaceId },
      })
      if (!theme) return reply.code(404).send({ error: "Theme not found" })
      return theme
    },
  )

  // ── Update theme (rename, archive/unarchive) ───────────────────────────────
  fastify.patch<{
    Params: { workspaceId: string; themeId: string }
    Body: { name?: string; slug?: string; description?: string; archived?: boolean }
  }>(
    "/api/workspaces/:workspaceId/themes/:themeId",
    async (request, reply) => {
      if (request.params.workspaceId !== request.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const existing = await fastify.prisma.theme.findFirst({
        where: { id: request.params.themeId, workspaceId: request.workspaceId },
      })
      if (!existing) return reply.code(404).send({ error: "Theme not found" })

      const { name, slug, description } = request.body

      // Validate slug uniqueness if changing it
      if (slug && slug !== existing.slug) {
        const conflict = await fastify.prisma.theme.findFirst({
          where: { workspaceId: request.workspaceId, slug, NOT: { id: request.params.themeId } },
        })
        if (conflict) return reply.code(409).send({ error: "Slug already in use" })
      }

      const updated = await fastify.prisma.theme.update({
        where: { id: request.params.themeId },
        data: {
          ...(name !== undefined && { name }),
          ...(slug !== undefined && { slug }),
          ...(description !== undefined && { description }),
        },
      })

      return updated
    },
  )

  // ── Merge theme into another ───────────────────────────────────────────────
  fastify.post<{
    Params: { workspaceId: string; themeId: string }
    Body: { targetThemeId: string }
  }>(
    "/api/workspaces/:workspaceId/themes/:themeId/merge",
    async (request, reply) => {
      if (request.params.workspaceId !== request.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const { themeId } = request.params
      const { targetThemeId } = request.body

      if (themeId === targetThemeId) {
        return reply.code(400).send({ error: "Cannot merge theme into itself" })
      }

      const [source, target] = await Promise.all([
        fastify.prisma.theme.findFirst({ where: { id: themeId, workspaceId: request.workspaceId } }),
        fastify.prisma.theme.findFirst({ where: { id: targetThemeId, workspaceId: request.workspaceId } }),
      ])

      if (!source) return reply.code(404).send({ error: "Source theme not found" })
      if (!target) return reply.code(404).send({ error: "Target theme not found" })

      // Reassign all items from source to target
      await fastify.prisma.feedbackItem.updateMany({
        where: { themeId, workspaceId: request.workspaceId },
        data: { themeId: targetThemeId },
      })

      // Update target item count
      await fastify.prisma.theme.update({
        where: { id: targetThemeId },
        data: {
          itemCount: { increment: source.itemCount },
          lastActiveAt: new Date(),
        },
      })

      // Delete the source theme
      await fastify.prisma.theme.delete({ where: { id: themeId } })

      return { merged: true, targetThemeId, itemsMoved: source.itemCount }
    },
  )

  // ── Delete (archive) theme ─────────────────────────────────────────────────
  fastify.delete<{ Params: { workspaceId: string; themeId: string } }>(
    "/api/workspaces/:workspaceId/themes/:themeId",
    async (request, reply) => {
      if (request.params.workspaceId !== request.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const existing = await fastify.prisma.theme.findFirst({
        where: { id: request.params.themeId, workspaceId: request.workspaceId },
      })
      if (!existing) return reply.code(404).send({ error: "Theme not found" })

      // Unlink feedback items before deletion
      await fastify.prisma.feedbackItem.updateMany({
        where: { themeId: request.params.themeId, workspaceId: request.workspaceId },
        data: { themeId: null, themeConfidence: null },
      })

      await fastify.prisma.theme.delete({ where: { id: request.params.themeId } })
      return reply.code(204).send()
    },
  )

  // ── Time-series: item volume per theme over N days ────────────────────────
  fastify.get<{
    Params: { workspaceId: string; themeId: string }
    Querystring: { days?: string }
  }>(
    "/api/workspaces/:workspaceId/themes/:themeId/timeseries",
    async (request, reply) => {
      if (request.params.workspaceId !== request.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      const days = Math.min(90, Math.max(7, parseInt(request.query.days ?? "30", 10)))
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

      const rows = await fastify.prisma.$queryRawUnsafe<Array<{ date: string; count: bigint }>>(
        `SELECT DATE_TRUNC('day', ingested_at AT TIME ZONE 'UTC')::date::text AS date,
                COUNT(*) AS count
         FROM feedback_items
         WHERE workspace_id = $1 AND theme_id = $2 AND ingested_at >= $3
         GROUP BY 1
         ORDER BY 1`,
        request.workspaceId,
        request.params.themeId,
        since,
      )

      return { data: rows.map((r) => ({ date: r.date, count: Number(r.count) })) }
    },
  )

  // ── ARR impact: top themes by total customer ARR from feedback ────────────
  fastify.get<{
    Params: { workspaceId: string }
    Querystring: { days?: string; limit?: string }
  }>(
    "/api/workspaces/:workspaceId/themes/arr-impact",
    async (request, reply) => {
      if (request.params.workspaceId !== request.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      const days = Math.min(90, Math.max(7, parseInt(request.query.days ?? "30", 10)))
      const limit = Math.min(20, Math.max(1, parseInt(request.query.limit ?? "10", 10)))
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

      const rows = await fastify.prisma.$queryRawUnsafe<Array<{
        id: string; name: string; slug: string; item_count: bigint; total_arr: bigint
      }>>(
        `SELECT t.id, t.name, t.slug,
                COUNT(DISTINCT fi.id) AS item_count,
                COALESCE(SUM(DISTINCT c.arr_cents), 0) AS total_arr
         FROM themes t
         JOIN feedback_items fi ON fi.theme_id = t.id AND fi.workspace_id = $1
         JOIN customers c ON c.id = fi.customer_id
         WHERE t.workspace_id = $1 AND t.is_proto = false
           AND fi.ingested_at >= $2 AND c.arr_cents IS NOT NULL
         GROUP BY t.id, t.name, t.slug
         ORDER BY total_arr DESC
         LIMIT $3`,
        request.workspaceId,
        since,
        limit,
      )

      return {
        data: rows.map((r) => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
          itemCount: Number(r.item_count),
          totalArrCents: Number(r.total_arr),
        })),
      }
    },
  )

  // ── Resolve theme (mark resolved, transition all items to RESOLVED) ────────
  fastify.post<{ Params: { workspaceId: string; themeId: string } }>(
    "/api/workspaces/:workspaceId/themes/:themeId/resolve",
    async (request, reply) => {
      if (request.params.workspaceId !== request.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const existing = await fastify.prisma.theme.findFirst({
        where: { id: request.params.themeId, workspaceId: request.workspaceId },
      })
      if (!existing) return reply.code(404).send({ error: "Theme not found" })

      const now = new Date()
      const [theme, { count }] = await Promise.all([
        fastify.prisma.theme.update({
          where: { id: request.params.themeId },
          data: { resolvedAt: now, isSpiking: false },
        }),
        fastify.prisma.feedbackItem.updateMany({
          where: { themeId: request.params.themeId, workspaceId: request.workspaceId, status: { notIn: ["ARCHIVED"] } },
          data: { status: "RESOLVED" },
        }),
      ])

      return { resolved: true, theme, itemsResolved: count }
    },
  )

  // ── Link theme outcome (associate with shipped ticket) ────────────────────
  fastify.post<{
    Params: { workspaceId: string; themeId: string }
    Body: { provider: "LINEAR" | "JIRA"; ticketId: string; ticketUrl: string; ticketTitle?: string }
  }>(
    "/api/workspaces/:workspaceId/themes/:themeId/outcome",
    async (request, reply) => {
      if (request.params.workspaceId !== request.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const existing = await fastify.prisma.theme.findFirst({
        where: { id: request.params.themeId, workspaceId: request.workspaceId },
      })
      if (!existing) return reply.code(404).send({ error: "Theme not found" })

      const outcome = await fastify.prisma.themeOutcome.create({
        data: {
          workspaceId: request.workspaceId,
          themeId: request.params.themeId,
          provider: request.body.provider,
          ticketId: request.body.ticketId,
          ticketUrl: request.body.ticketUrl,
          ticketTitle: request.body.ticketTitle ?? null,
        },
      })

      return outcome
    },
  )

  // ── Get theme outcomes ─────────────────────────────────────────────────────
  fastify.get<{ Params: { workspaceId: string; themeId: string } }>(
    "/api/workspaces/:workspaceId/themes/:themeId/outcomes",
    async (request, reply) => {
      if (request.params.workspaceId !== request.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const outcomes = await fastify.prisma.themeOutcome.findMany({
        where: { themeId: request.params.themeId, workspaceId: request.workspaceId },
        orderBy: { createdAt: "desc" },
      })

      return { data: outcomes }
    },
  )

  // ── Trigger nightly clustering (admin / scheduled) ─────────────────────────
  fastify.post<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/themes/cluster",
    async (request, reply) => {
      if (request.params.workspaceId !== request.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      // Enqueue a cluster job — imported lazily to avoid circular dep
      const { createRedisConnection, createClusterQueue, JOB_NAMES } = await import("@voxly/queue")
      const redis = createRedisConnection()
      const queue = createClusterQueue(redis)
      await queue.add(JOB_NAMES.CLUSTER_THEMES, { workspaceId: request.workspaceId })
      await redis.quit()
      return { queued: true }
    },
  )
}

export default themes
