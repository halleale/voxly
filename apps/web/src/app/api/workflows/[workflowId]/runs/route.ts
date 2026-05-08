import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@voxly/db"

const DEV_CLERK_USER_ID = "seed_owner"

async function resolveUser(): Promise<string | null> {
  if (process.env.SKIP_AUTH === "true") return DEV_CLERK_USER_ID
  const { userId } = await auth()
  return userId
}

export async function GET(
  req: NextRequest,
  { params }: { params: { workflowId: string } },
) {
  const clerkUserId = await resolveUser()
  if (!clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const member = await prisma.workspaceMember.findFirst({
    where: { clerkUserId },
    select: { workspaceId: true },
  })
  if (!member) return NextResponse.json({ error: "Workspace not found" }, { status: 404 })

  const wf = await prisma.workflow.findFirst({
    where: { id: params.workflowId, workspaceId: member.workspaceId },
  })
  if (!wf) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const runs = await prisma.workflowRun.findMany({
    where: { workflowId: wf.id },
    orderBy: { startedAt: "desc" },
    take: 50,
  })
  return NextResponse.json(runs)
}
