import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@voxly/db"

const SKIP_AUTH = process.env.SKIP_AUTH === "true"
const DEV_CLERK_USER_ID = "seed_owner"

export async function PATCH(
  request: Request,
  context: { params: Promise<{ workspaceId: string; memberId: string }> },
) {
  const clerkUserId = SKIP_AUTH ? DEV_CLERK_USER_ID : (await auth()).userId
  if (!clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { workspaceId, memberId } = await context.params

  const requester = await prisma.workspaceMember.findUnique({
    where: { workspaceId_clerkUserId: { workspaceId, clerkUserId } },
    select: { role: true },
  })
  if (!requester || requester.role !== "OWNER") {
    return NextResponse.json({ error: "Only owners can change member roles" }, { status: 403 })
  }

  const { role } = (await request.json()) as { role: string }
  if (!["ADMIN", "MEMBER", "VIEWER"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 })
  }

  const updated = await prisma.workspaceMember.update({
    where: { id: memberId },
    data: { role: role as "ADMIN" | "MEMBER" | "VIEWER" },
  })

  return NextResponse.json(updated)
}
