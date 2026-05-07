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
