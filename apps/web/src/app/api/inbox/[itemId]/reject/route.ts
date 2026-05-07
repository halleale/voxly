import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@voxly/db"

const DEV_CLERK_USER_ID = "seed_owner"

export async function POST(
  _request: Request,
  { params }: { params: { itemId: string } },
) {
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
    where: { id: params.itemId },
    include: { connector: { select: { workspaceId: true } } },
  })

  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 })
  if (item.connector.workspaceId !== member.workspaceId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (item.status !== "UNCERTAIN") {
    return NextResponse.json({ error: "Item is not in UNCERTAIN status" }, { status: 409 })
  }

  await prisma.ingestionQueue.update({
    where: { id: item.id },
    data: { status: "REJECTED", rejectReason: "manual:inbox_reject", processedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
