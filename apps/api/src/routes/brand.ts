import type { FastifyPluginAsync } from "fastify"
import { inferBrandProfile } from "@voxly/ai"
import { MemberRole } from "@voxly/types"
import { requireRole } from "../plugins/roles"
import { writeAudit } from "../plugins/audit"

interface InferBody {
  website: string
}

interface SaveBrandBody {
  brandWebsite?: string
  brandName?: string
  brandKeywords?: string[]
}

const brand: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/brand",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      const workspace = await fastify.prisma.workspace.findUnique({
        where: { id: request.params.workspaceId },
        select: { brandWebsite: true, brandName: true, brandKeywords: true, brandInferredAt: true },
      })
      if (!workspace) return reply.code(404).send({ error: "Workspace not found" })
      return workspace
    }
  )

  fastify.post<{ Params: { workspaceId: string }; Body: InferBody }>(
    "/api/workspaces/:workspaceId/brand/infer",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      if (await requireRole(request, reply, MemberRole.ADMIN)) return

      const { website } = request.body
      if (!website) return reply.code(400).send({ error: "website is required" })

      try {
        const profile = await inferBrandProfile(website)
        return profile
      } catch (err) {
        fastify.log.error(err, "brand inference failed")
        return reply.code(502).send({ error: "Failed to infer brand profile" })
      }
    }
  )

  fastify.patch<{ Params: { workspaceId: string }; Body: SaveBrandBody }>(
    "/api/workspaces/:workspaceId/brand",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      if (await requireRole(request, reply, MemberRole.ADMIN)) return

      const { brandWebsite, brandName, brandKeywords } = request.body

      const updated = await fastify.prisma.workspace.update({
        where: { id: request.params.workspaceId },
        data: {
          ...(brandWebsite !== undefined && { brandWebsite }),
          ...(brandName !== undefined && { brandName }),
          ...(brandKeywords !== undefined && { brandKeywords }),
          brandInferredAt: new Date(),
        },
        select: { brandWebsite: true, brandName: true, brandKeywords: true, brandInferredAt: true },
      })

      await writeAudit(fastify.prisma, request, {
        entityType: "workspace",
        entityId: request.params.workspaceId,
        action: "WORKSPACE_UPDATED",
        metadata: { fields: ["brand"] },
      })

      return updated
    }
  )
}

export default brand
