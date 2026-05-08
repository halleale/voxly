import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@voxly/db"
import { createRedisConnection, createWorkflowExecutionQueue } from "@voxly/queue"

const DEV_CLERK_USER_ID = "seed_owner"

async function resolveUser(): Promise<string | null> {
  if (process.env.SKIP_AUTH === "true") return DEV_CLERK_USER_ID
  const { userId } = await auth()
  return userId
}

export async function POST(
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

  const body = (await req.json()) as { feedbackItemId?: string }
  if (!body.feedbackItemId) return NextResponse.json({ error: "feedbackItemId required" }, { status: 400 })

  const redis = createRedisConnection()
  const wfQueue = createWorkflowExecutionQueue(redis)
  const job = await wfQueue.add("EXECUTE_WORKFLOW", {
    workflowId: wf.id,
    workspaceId: member.workspaceId,
    feedbackItemId: body.feedbackItemId,
    testRun: true,
  })
  await redis.quit()

  return NextResponse.json({ jobId: job.id })
}
