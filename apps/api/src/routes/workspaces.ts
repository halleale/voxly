import type { FastifyPluginAsync } from "fastify"
import { MemberRole } from "@voxly/types"
import { requireRole } from "../plugins/roles"
import { writeAudit } from "../plugins/audit"

interface CreateWorkspaceBody {
  name: string
  slug: string
}

interface UpdateWorkspaceBody {
  name?: string
  slug?: string
  plan?: string
}

interface InviteMemberBody {
  email: string
  name?: string
  role?: MemberRole
  clerkUserId: string
}

interface UpdateMemberBody {
  role: MemberRole
}

const workspaces: FastifyPluginAsync = async (fastify) => {
  // GET /api/workspaces — list all workspaces the current user belongs to
  fastify.get("/api/workspaces", async (request) => {
    const memberships = await fastify.prisma.workspaceMember.findMany({
      where: { clerkUserId: request.clerkUserId },
      include: { workspace: { select: { id: true, name: true, slug: true, plan: true, createdAt: true } } },
      orderBy: { createdAt: "asc" },
    })
    return {
      data: memberships.map((m) => ({
        ...m.workspace,
        role: m.role,
        memberId: m.id,
      })),
    }
  })

  // POST /api/workspaces — create a new workspace (caller becomes OWNER)
  fastify.post<{ Body: CreateWorkspaceBody }>(
    "/api/workspaces",
    { config: { skipAuth: false } },
    async (request, reply) => {
      const { name, slug } = request.body
      if (!name || !slug) {
        return reply.code(400).send({ error: "name and slug are required" })
      }
      if (!/^[a-z0-9-]+$/.test(slug)) {
        return reply.code(400).send({ error: "slug must be lowercase alphanumeric with hyphens" })
      }

      const existing = await fastify.prisma.workspace.findUnique({ where: { slug } })
      if (existing) return reply.code(409).send({ error: "Slug already taken" })

      const workspace = await fastify.prisma.workspace.create({
        data: {
          name,
          slug,
          members: {
            create: {
              clerkUserId: request.clerkUserId,
              email: "",
              role: "OWNER",
            },
          },
        },
      })

      return reply.code(201).send(workspace)
    }
  )

  // PATCH /api/workspaces/:workspaceId — update workspace settings
  fastify.patch<{ Params: { workspaceId: string }; Body: UpdateWorkspaceBody }>(
    "/api/workspaces/:workspaceId",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      if (await requireRole(request, reply, MemberRole.ADMIN)) return

      const { name, slug, plan } = request.body
      if (slug && !/^[a-z0-9-]+$/.test(slug)) {
        return reply.code(400).send({ error: "slug must be lowercase alphanumeric with hyphens" })
      }

      const updated = await fastify.prisma.workspace.update({
        where: { id: request.params.workspaceId },
        data: {
          ...(name !== undefined && { name }),
          ...(slug !== undefined && { slug }),
          ...(plan !== undefined && { plan }),
        },
      })

      await writeAudit(fastify.prisma, request, {
        entityType: "workspace",
        entityId: request.params.workspaceId,
        action: "WORKSPACE_UPDATED",
        metadata: { fields: Object.keys(request.body) },
      })

      return updated
    }
  )

  // GET /api/workspaces/:workspaceId/members
  fastify.get<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/members",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      const members = await fastify.prisma.workspaceMember.findMany({
        where: { workspaceId: request.params.workspaceId },
        orderBy: { createdAt: "asc" },
      })
      return { data: members }
    }
  )

  // POST /api/workspaces/:workspaceId/members — invite / provision a member
  fastify.post<{ Params: { workspaceId: string }; Body: InviteMemberBody }>(
    "/api/workspaces/:workspaceId/members",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      if (await requireRole(request, reply, MemberRole.ADMIN)) return

      const { email, name, role = MemberRole.MEMBER, clerkUserId } = request.body
      if (!email || !clerkUserId) {
        return reply.code(400).send({ error: "email and clerkUserId are required" })
      }

      const existing = await fastify.prisma.workspaceMember.findUnique({
        where: { workspaceId_clerkUserId: { workspaceId: request.params.workspaceId, clerkUserId } },
      })
      if (existing) return reply.code(409).send({ error: "User is already a member" })

      const member = await fastify.prisma.workspaceMember.create({
        data: {
          workspaceId: request.params.workspaceId,
          clerkUserId,
          email,
          name,
          role,
        },
      })

      await writeAudit(fastify.prisma, request, {
        entityType: "workspace_member",
        entityId: member.id,
        action: "MEMBER_INVITED",
        metadata: { email, role },
      })

      return reply.code(201).send(member)
    }
  )

  // PATCH /api/workspaces/:workspaceId/members/:memberId — change role
  fastify.patch<{
    Params: { workspaceId: string; memberId: string }
    Body: UpdateMemberBody
  }>(
    "/api/workspaces/:workspaceId/members/:memberId",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      if (await requireRole(request, reply, MemberRole.ADMIN)) return

      const { memberId } = request.params
      const { role } = request.body

      const target = await fastify.prisma.workspaceMember.findUnique({
        where: { id: memberId },
        select: { workspaceId: true, role: true },
      })
      if (!target || target.workspaceId !== request.params.workspaceId) {
        return reply.code(404).send({ error: "Member not found" })
      }
      // Only OWNER can promote someone to OWNER or demote an OWNER
      if (role === MemberRole.OWNER || target.role === MemberRole.OWNER) {
        if (await requireRole(request, reply, MemberRole.OWNER)) return
      }

      const updated = await fastify.prisma.workspaceMember.update({
        where: { id: memberId },
        data: { role },
      })

      await writeAudit(fastify.prisma, request, {
        entityType: "workspace_member",
        entityId: memberId,
        action: "MEMBER_ROLE_CHANGED",
        metadata: { previousRole: target.role, newRole: role },
      })

      return updated
    }
  )

  // DELETE /api/workspaces/:workspaceId/members/:memberId
  fastify.delete<{ Params: { workspaceId: string; memberId: string } }>(
    "/api/workspaces/:workspaceId/members/:memberId",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      if (await requireRole(request, reply, MemberRole.ADMIN)) return

      const target = await fastify.prisma.workspaceMember.findUnique({
        where: { id: request.params.memberId },
        select: { workspaceId: true, role: true, clerkUserId: true },
      })
      if (!target || target.workspaceId !== request.params.workspaceId) {
        return reply.code(404).send({ error: "Member not found" })
      }
      // Cannot remove the last OWNER
      if (target.role === MemberRole.OWNER) {
        const ownerCount = await fastify.prisma.workspaceMember.count({
          where: { workspaceId: request.params.workspaceId, role: "OWNER" },
        })
        if (ownerCount <= 1) {
          return reply.code(409).send({ error: "Cannot remove the last owner" })
        }
        if (await requireRole(request, reply, MemberRole.OWNER)) return
      }

      await fastify.prisma.workspaceMember.delete({
        where: { id: request.params.memberId },
      })

      await writeAudit(fastify.prisma, request, {
        entityType: "workspace_member",
        entityId: request.params.memberId,
        action: "MEMBER_REMOVED",
        metadata: { removedUserId: target.clerkUserId },
      })

      return reply.code(204).send()
    }
  )

  // GET /api/workspaces/:workspaceId/audit-log
  fastify.get<{
    Params: { workspaceId: string }
    Querystring: { page?: number; pageSize?: number; entityType?: string }
  }>(
    "/api/workspaces/:workspaceId/audit-log",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const page = Math.max(1, Number(request.query.page ?? 1))
      const pageSize = Math.min(100, Math.max(1, Number(request.query.pageSize ?? 50)))
      const skip = (page - 1) * pageSize

      const where: Record<string, unknown> = { workspaceId: request.params.workspaceId }
      if (request.query.entityType) where["entityType"] = request.query.entityType

      const [data, total] = await Promise.all([
        fastify.prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: pageSize,
        }),
        fastify.prisma.auditLog.count({ where }),
      ])

      return { data, total, page, pageSize, hasMore: skip + data.length < total }
    }
  )
}

export default workspaces
