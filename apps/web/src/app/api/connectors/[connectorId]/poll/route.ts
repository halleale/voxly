import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@voxly/db"
import { createRedisConnection, createPollingQueue, JOB_NAMES } from "@voxly/queue"

const SKIP_AUTH = process.env.SKIP_AUTH === "true"
const DEV_CLERK_USER_ID = "seed_owner"

let _pollingQueue: ReturnType<typeof createPollingQueue> | null = null
function getPollingQueue() {
  if (!_pollingQueue) _pollingQueue = createPollingQueue(createRedisConnection())
  return _pollingQueue
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ connectorId: string }> },
) {
  const clerkUserId = SKIP_AUTH
    ? DEV_CLERK_USER_ID
    : (await auth()).userId

  if (!clerkUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { connectorId } = await context.params

  const member = await prisma.workspaceMember.findFirst({
    where: { clerkUserId },
    select: { workspaceId: true },
  })
  if (!member) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 })
  }

  const connector = await prisma.connector.findUnique({ where: { id: connectorId } })
  if (!connector || connector.workspaceId !== member.workspaceId) {
    return NextResponse.json({ error: "Connector not found" }, { status: 404 })
  }

  await getPollingQueue().add(
    JOB_NAMES.POLL_SOURCE,
    { connectorId, workspaceId: member.workspaceId },
    { jobId: `manual-poll:${connectorId}:${Date.now()}` },
  )

  return NextResponse.json({ ok: true })
}
