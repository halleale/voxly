import fp from "fastify-plugin"
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify"

export type MemberRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER"

const ROLE_RANK: Record<MemberRole, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN:  2,
  OWNER:  3,
}

declare module "fastify" {
  interface FastifyRequest {
    workspaceId: string
    clerkUserId: string
    memberRole: MemberRole | null
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest("workspaceId", "")
  fastify.decorateRequest("clerkUserId", "")
  fastify.decorateRequest("memberRole", null)

  fastify.addHook("onRequest", async (request: FastifyRequest, reply) => {
    // Skip auth on health check and public ingestion API (which uses its own key auth)
    if (request.url === "/health") return
    if (request.url.startsWith("/api/v1/")) return

    const token = request.headers.authorization?.replace("Bearer ", "")
    if (!token) {
      return reply.code(401).send({ error: "Missing authorization header", code: "UNAUTHORIZED" })
    }

    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString())
      request.clerkUserId = payload.sub ?? ""
      request.workspaceId =
        (request.headers["x-workspace-id"] as string | undefined) ??
        payload.org_id ??
        ""

      if (!request.workspaceId) {
        return reply.code(400).send({ error: "Missing workspace context", code: "NO_WORKSPACE" })
      }

      // Load member role for RBAC enforcement
      const member = await fastify.prisma.workspaceMember.findUnique({
        where: {
          workspaceId_clerkUserId: {
            workspaceId: request.workspaceId,
            clerkUserId: request.clerkUserId,
          },
        },
        select: { role: true },
      })
      request.memberRole = (member?.role ?? null) as MemberRole | null
    } catch {
      return reply.code(401).send({ error: "Invalid token", code: "INVALID_TOKEN" })
    }
  })
}

/** Prehandler hook that enforces a minimum role for a route. */
export function requireRole(minRole: MemberRole) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const role = request.memberRole
    if (!role) return reply.code(403).send({ error: "Not a workspace member", code: "FORBIDDEN" })
    if ((ROLE_RANK[role] ?? -1) < ROLE_RANK[minRole]) {
      return reply.code(403).send({
        error: `Requires ${minRole} or higher (you are ${role})`,
        code: "INSUFFICIENT_ROLE",
      })
    }
  }
}

export default fp(authPlugin, { name: "auth" })
