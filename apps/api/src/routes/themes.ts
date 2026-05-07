import type { FastifyPluginAsync } from "fastify"

interface UpdateThemeBody {
  name?: string
  slug?: string
}

const themes: FastifyPluginAsync = async (fastify) => {
  // GET /api/workspaces/:workspaceId/themes
  fastify.get<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/themes",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      const items = await fastify.prisma.theme.findMany({
        where: { workspaceId: request.params.workspaceId, isProto: false },
        orderBy: [{ isSpiking: "desc" }, { itemCount: "desc" }],
      })
      return { data: items }
    }
  )

  // PATCH /api/workspaces/:workspaceId/themes/:themeId — rename
  fastify.patch<{
    Params: { workspaceId: string; themeId: string }
    Body: UpdateThemeBody
  }>(
    "/api/workspaces/:workspaceId/themes/:themeId",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      const { themeId } = request.params
      const theme = await fastify.prisma.theme.findUnique({
        where: { id: themeId },
        select: { workspaceId: true },
      })
      if (!theme || theme.workspaceId !== request.params.workspaceId) {
        return reply.code(404).send({ error: "Theme not found" })
      }

      const updated = await fastify.prisma.theme.update({
        where: { id: themeId },
        data: {
          name: request.body.name,
          slug: request.body.slug,
        },
      })
      return updated
    }
  )

  // POST /api/workspaces/:workspaceId/themes/:themeId/merge
  // Merge sourceThemeId into this theme
  fastify.post<{
    Params: { workspaceId: string; themeId: string }
    Body: { sourceThemeId: string }
  }>(
    "/api/workspaces/:workspaceId/themes/:themeId/merge",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      const { themeId } = request.params
      const { sourceThemeId } = request.body

      if (themeId === sourceThemeId) {
        return reply.code(400).send({ error: "Cannot merge a theme into itself" })
      }

      const [target, source] = await Promise.all([
        fastify.prisma.theme.findUnique({ where: { id: themeId }, select: { workspaceId: true, itemCount: true } }),
        fastify.prisma.theme.findUnique({ where: { id: sourceThemeId }, select: { workspaceId: true, itemCount: true } }),
      ])

      if (!target || target.workspaceId !== request.params.workspaceId) {
        return reply.code(404).send({ error: "Target theme not found" })
      }
      if (!source || source.workspaceId !== request.params.workspaceId) {
        return reply.code(404).send({ error: "Source theme not found" })
      }

      await fastify.prisma.feedbackItem.updateMany({
        where: { themeId: sourceThemeId },
        data: { themeId },
      })

      await fastify.prisma.theme.update({
        where: { id: themeId },
        data: { itemCount: target.itemCount + source.itemCount },
      })

      await fastify.prisma.theme.delete({ where: { id: sourceThemeId } })

      return { ok: true }
    }
  )

  // DELETE /api/workspaces/:workspaceId/themes/:themeId — archive (unassign items)
  fastify.delete<{ Params: { workspaceId: string; themeId: string } }>(
    "/api/workspaces/:workspaceId/themes/:themeId",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      // Unassign items from this theme first
      await fastify.prisma.feedbackItem.updateMany({
        where: { themeId: request.params.themeId, workspaceId: request.params.workspaceId },
        data: { themeId: null, themeConfidence: null },
      })

      await fastify.prisma.theme.delete({
        where: { id: request.params.themeId, workspaceId: request.params.workspaceId },
      })

      return reply.code(204).send()
    }
  )
}

export default themes
