import type { PrismaClient } from "@voxly/db"

export interface AuditParams {
  prisma: PrismaClient
  workspaceId: string
  userId: string
  action: string
  resourceType: string
  resourceId: string
  meta?: Record<string, unknown>
}

/** Fire-and-forget audit log write. Never throws — failures are non-fatal. */
export function audit(params: AuditParams): void {
  params.prisma.auditLog
    .create({
      data: {
        workspaceId:  params.workspaceId,
        userId:       params.userId,
        action:       params.action,
        resourceType: params.resourceType,
        resourceId:   params.resourceId,
        meta:         params.meta ?? null,
      },
    })
    .catch(() => {/* intentionally silent */})
}
