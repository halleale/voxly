import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { prisma } from "@voxly/db"
import { WorkflowList } from "./workflow-list"

export default async function WorkflowsPage() {
  const { orgId } = await auth()
  if (!orgId) redirect("/onboarding")

  const workspace = await prisma.workspace.findFirst({
    where: { slug: orgId },
    select: { id: true },
  })
  if (!workspace) redirect("/onboarding")

  const workflows = await prisma.workflow.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { runs: true } } },
  })

  type WfRow = typeof workflows[number]

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">Workflows</h1>
          <p className="text-sm text-muted-foreground">
            {workflows.filter((w: WfRow) => w.isActive).length} active · {workflows.length} total
          </p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <WorkflowList
          workflows={workflows.map((w: WfRow) => ({
            id: w.id,
            name: w.name,
            isActive: w.isActive,
            runCount: w.runCount,
            lastRunAt: w.lastRunAt?.toISOString() ?? null,
            createdAt: w.createdAt.toISOString(),
            _count: w._count,
          }))}
          workspaceId={workspace.id}
        />
      </div>
    </div>
  )
}
