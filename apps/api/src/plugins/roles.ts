import fp from "fastify-plugin"
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify"
import { MemberRole } from "@voxly/types"

declare module "fastify" {
  interface FastifyRequest {
    memberRole: MemberRole | null
  }
}

// Numeric rank so we can do >= comparisons
const ROLE_RANK: Record<MemberRole, number> = {
  [MemberRole.VIEWER]: 0,
  [MemberRole.MEMBER]: 1,
  [MemberRole.ADMIN]: 2,
  [MemberRole.OWNER]: 3,
}

export function roleRank(role: MemberRole): number {
  return ROLE_RANK[role] ?? 0
}

const rolesPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest("memberRole", null)

  // Populate request.memberRole after auth resolves the workspace + user
  fastify.addHook("onRequest", async (request: FastifyRequest) => {
    if (!request.workspaceId || !request.clerkUserId) return
    const member = await fastify.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_clerkUserId: {
          workspaceId: request.workspaceId,
          clerkUserId: request.clerkUserId,
        },
      },
      select: { role: true },
    })
    request.memberRole = (member?.role as MemberRole | undefined) ?? null
  })
}

export default fp(rolesPlugin, { name: "roles", dependencies: ["auth", "db"] })

// ─── Guard helper ─────────────────────────────────────────────────────────────

/**
 * Call at the top of a handler to assert the actor has at least `minRole`.
 * Returns a 403 reply and returns true if the check fails — caller must return.
 *
 * Usage:
 *   if (await requireRole(request, reply, MemberRole.MEMBER)) return
 */
export async function requireRole(
  request: FastifyRequest,
  reply: FastifyReply,
  minRole: MemberRole
): Promise<boolean> {
  const role = request.memberRole
  if (!role || roleRank(role) < roleRank(minRole)) {
    await reply.code(403).send({ error: "Insufficient permissions", code: "FORBIDDEN" })
    return true
  }
  return false
}
