import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@voxly/db"

const SKIP_AUTH = process.env.SKIP_AUTH === "true"
const DEV_CLERK_USER_ID = "seed_owner"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const clerkUserId = SKIP_AUTH ? DEV_CLERK_USER_ID : (await auth()).userId
  if (!clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { workspaceId } = await context.params

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_clerkUserId: { workspaceId, clerkUserId } },
    select: { role: true },
  })
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const days = Math.min(90, Math.max(7, parseInt(request.nextUrl.searchParams.get("days") ?? "30", 10)))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const stale = new Date(Date.now() - 25 * 60 * 60 * 1000)

  const [connectors, feedbackByStatus, feedbackBySource, workflowStats, recentRuns] =
    await Promise.all([
      prisma.connector.findMany({
        where: { workspaceId },
        select: { id: true, type: true, name: true, status: true, lastPolledAt: true, itemCount: true, errorMessage: true },
        orderBy: { itemCount: "desc" },
      }),
      prisma.feedbackItem.groupBy({ by: ["status"], where: { workspaceId }, _count: true }),
      prisma.feedbackItem.groupBy({
        by: ["sourceType"],
        where: { workspaceId, ingestedAt: { gte: since } },
        _count: true,
        orderBy: { _count: { sourceType: "desc" } },
      }),
      prisma.workflow.findMany({
        where: { workspaceId },
        select: { id: true, name: true, isActive: true, runCount: true, lastRunAt: true },
      }),
      prisma.workflowRun.findMany({
        where: { workflow: { workspaceId }, startedAt: { gte: since } },
        select: { id: true, workflowId: true, status: true, startedAt: true, completedAt: true },
        orderBy: { startedAt: "desc" },
        take: 50,
      }),
    ])

  const connectorHealth = connectors.map((c) => {
    let health: "healthy" | "error" | "stale" | "paused"
    if (c.status === "PAUSED") health = "paused"
    else if (c.status === "ERROR") health = "error"
    else if (c.lastPolledAt && c.lastPolledAt < stale) health = "stale"
    else health = "healthy"
    return { ...c, health, lastPolledAt: c.lastPolledAt?.toISOString() ?? null }
  })

  const statusMap = Object.fromEntries(feedbackByStatus.map((r) => [r.status, r._count]))
  const total = Object.values(statusMap).reduce((s, n) => s + n, 0)
  const actioned = (statusMap.RESOLVED ?? 0) + (statusMap.ARCHIVED ?? 0)
  const actionedRate = total > 0 ? Math.round((actioned / total) * 100) : 0

  const runTotal = recentRuns.length
  const runSuccess = recentRuns.filter((r) => r.status === "COMPLETED").length
  const successRate = runTotal > 0 ? Math.round((runSuccess / runTotal) * 100) : null

  return NextResponse.json({
    connectors: connectorHealth,
    feedback: {
      total, actioned, actionedRate,
      byStatus: statusMap,
      bySource: Object.fromEntries(feedbackBySource.map((r) => [r.sourceType, r._count])),
      periodDays: days,
      periodTotal: feedbackBySource.reduce((s, r) => s + r._count, 0),
    },
    workflows: {
      active: workflowStats.filter((w) => w.isActive).length,
      total: workflowStats.length,
      successRate,
      recentRuns: recentRuns.map((r) => ({
        ...r,
        startedAt: r.startedAt.toISOString(),
        completedAt: r.completedAt?.toISOString() ?? null,
      })),
    },
  })
}
