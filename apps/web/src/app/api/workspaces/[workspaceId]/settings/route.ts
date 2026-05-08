import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@voxly/db"

const SKIP_AUTH = process.env.SKIP_AUTH === "true"
const DEV_CLERK_USER_ID = "seed_owner"

export async function GET(
  _request: Request,
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

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true, name: true, slug: true, plan: true,
      apiKeyHash: true,
      workosConnectionId: true,
      createdAt: true,
      members: {
        select: { id: true, clerkUserId: true, email: true, name: true, role: true, createdAt: true },
        orderBy: { role: "asc" },
      },
    },
  })

  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({
    ...workspace,
    apiKeyHash: undefined,
    hasApiKey: !!workspace.apiKeyHash,
    createdAt: workspace.createdAt?.toISOString(),
    members: workspace.members.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
  })
}
