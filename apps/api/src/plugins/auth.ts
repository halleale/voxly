import fp from "fastify-plugin"
import type { FastifyPluginAsync, FastifyRequest } from "fastify"

declare module "fastify" {
  interface FastifyRequest {
    workspaceId: string
    clerkUserId: string
  }
  interface FastifyContextConfig {
    skipAuth?: boolean
  }
}

// Routes that bypass JWT auth entirely (API-key or WorkOS-handled)
const SKIP_AUTH_PREFIXES = ["/health", "/auth/sso", "/api/v1/"]

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest("workspaceId", "")
  fastify.decorateRequest("clerkUserId", "")

  fastify.addHook("onRequest", async (request: FastifyRequest, reply) => {
    // Route-level opt-out
    if (request.routeOptions?.config?.skipAuth) return
    // Prefix-level opt-out for public/SSO routes
    if (SKIP_AUTH_PREFIXES.some((p) => request.url.startsWith(p))) return

    const token = request.headers.authorization?.replace("Bearer ", "")
    if (!token) {
      return reply.code(401).send({ error: "Missing authorization header", code: "UNAUTHORIZED" })
    }

    try {
      // Decode the JWT without verification for workspace extraction in dev.
      // In production this is replaced by @clerk/fastify clerkPlugin + getAuth().
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
