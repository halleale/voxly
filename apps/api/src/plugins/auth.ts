import fp from "fastify-plugin"
import type { FastifyPluginAsync, FastifyRequest } from "fastify"

declare module "fastify" {
  interface FastifyRequest {
    workspaceId: string
    clerkUserId: string
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest("workspaceId", "")
  fastify.decorateRequest("clerkUserId", "")

  fastify.addHook("onRequest", async (request: FastifyRequest, reply) => {
    // Skip auth on health check
    if (request.url === "/health") return

    const token = request.headers.authorization?.replace("Bearer ", "")
    if (!token) {
      return reply.code(401).send({ error: "Missing authorization header", code: "UNAUTHORIZED" })
    }

    try {
      // Decode the JWT without verification for workspace extraction in dev.
      // In production this is replaced by @clerk/fastify clerkPlugin + getAuth().
      const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString())
      request.clerkUserId = payload.sub ?? ""
      // Workspace ID passed as a custom claim or header; Clerk org_id maps to workspace
      request.workspaceId =
        (request.headers["x-workspace-id"] as string | undefined) ??
        payload.org_id ??
        ""

      if (!request.workspaceId) {
        return reply.code(400).send({ error: "Missing workspace context", code: "NO_WORKSPACE" })
      }
    } catch {
      return reply.code(401).send({ error: "Invalid token", code: "INVALID_TOKEN" })
    }
  })
}

export default fp(authPlugin, { name: "auth" })
