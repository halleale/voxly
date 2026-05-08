import type { FastifyRequest } from "fastify"
import type { PrismaClient } from "@prisma/client"
import type { AuditAction } from "@prisma/client"

export interface AuditEntry {
  entityType: string
  entityId?: string
  action: AuditAction
  metadata?: Record<string, unknown>
}

export async function writeAudit(
  prisma: PrismaClient,
  request: FastifyRequest,
  entry: AuditEntry
): Promise<void> {
  if (!request.workspaceId || !request.clerkUserId) return
  await prisma.auditLog.create({
    data: {
      workspaceId: request.workspaceId,
      actorId: request.clerkUserId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata ?? {},
    },
  }).catch(() => {
    // Audit writes must never crash the main request
  })
}
