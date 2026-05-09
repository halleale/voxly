import fp from "fastify-plugin"
import type { FastifyPluginAsync, FastifyRequest } from "fastify"

declare module "fastify" {
  interface FastifyRequest {
    workspaceId: string
    clerkUserId: string
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "auth plugin: unverified JWT decode must not run in production. " +
      "Replace with @clerk/fastify clerkPlugin + getAuth() before deploying.",
    )
  }

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
      // Dev-only: decode JWT without signature verification.
      // In production this plugin must be replaced by @clerk/fastify + getAuth().
      const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString())
      request.clerkUserId = payload.sub ?? ""
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
