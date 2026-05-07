import type { FastifyPluginAsync } from "fastify"
import { inferBrandProfile } from "@voxly/ai"

interface InferBody {
  website: string
}

interface SaveBrandBody {
  brandWebsite?: string
  brandName?: string
  brandKeywords?: string[]
}

const brand: FastifyPluginAsync = async (fastify) => {
  // GET /api/workspaces/:workspaceId/brand
  fastify.get<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/brand",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      const workspace = await fastify.prisma.workspace.findUnique({
        where: { id: request.params.workspaceId },
        select: {
          brandWebsite: true,
          brandName: true,
          brandKeywords: true,
          brandInferredAt: true,
        },
      })
      if (!workspace) return reply.code(404).send({ error: "Workspace not found" })
      return workspace
    }
  )

  // POST /api/workspaces/:workspaceId/brand/infer
  // Scrapes the website and returns inferred brand profile WITHOUT saving it.
  // The client shows the result for user confirmation before calling PATCH.
  fastify.post<{ Params: { workspaceId: string }; Body: InferBody }>(
    "/api/workspaces/:workspaceId/brand/infer",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
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

  // PATCH /api/workspaces/:workspaceId/brand
  // Saves the confirmed brand profile (after user review/edit).
  fastify.patch<{ Params: { workspaceId: string }; Body: SaveBrandBody }>(
    "/api/workspaces/:workspaceId/brand",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      const { brandWebsite, brandName, brandKeywords } = request.body

      const updated = await fastify.prisma.workspace.update({
        where: { id: request.params.workspaceId },
        data: {
          ...(brandWebsite !== undefined && { brandWebsite }),
          ...(brandName !== undefined && { brandName }),
          ...(brandKeywords !== undefined && { brandKeywords }),
          brandInferredAt: new Date(),
        },
        select: {
          brandWebsite: true,
          brandName: true,
          brandKeywords: true,
          brandInferredAt: true,
        },
      })
      return updated
    }
  )
}

export default brand
