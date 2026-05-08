import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@voxly/db"
import { createRedisConnection, createAiPipelineQueue, JOB_NAMES } from "@voxly/queue"

const DEV_CLERK_USER_ID = "seed_owner"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params

  const clerkUserId =
    process.env.SKIP_AUTH === "true"
      ? DEV_CLERK_USER_ID
      : (await auth()).userId

  if (!clerkUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { clerkUserId },
    select: { workspaceId: true },
  })
  if (!member) return NextResponse.json({ error: "Workspace not found" }, { status: 404 })

  const item = await prisma.ingestionQueue.findUnique({
    where: { id: itemId },
    include: { connector: { select: { workspaceId: true } } },
  })

  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 })
  if (item.connector.workspaceId !== member.workspaceId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (item.status !== "REJECTED") {
    return NextResponse.json({ error: "Item is not rejected" }, { status: 409 })
  }

  // Reset to PENDING with pmApproved flag so AI worker marks the resulting FeedbackItem
  const raw = item.rawPayload as Record<string, unknown>
  await prisma.ingestionQueue.update({
    where: { id: item.id },
    data: {
      status: "PENDING",
      processedAt: null,
      rejectReason: null,
      rawPayload: { ...raw, _pmApproved: true },
    },
  })

  const redis = createRedisConnection()
  const aiQueue = createAiPipelineQueue(redis)
  await aiQueue.add(JOB_NAMES.PROCESS_ITEM, { ingestionQueueId: item.id })
  await redis.quit()

  return NextResponse.json({ ok: true })
}
