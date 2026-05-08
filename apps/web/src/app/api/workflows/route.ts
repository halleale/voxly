import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma, Prisma } from "@voxly/db"
import type { WorkflowGraph } from "@voxly/types"

const DEV_CLERK_USER_ID = "seed_owner"

async function getWorkspaceId(clerkUserId: string, queryWorkspaceId?: string): Promise<string | null> {
  const member = await prisma.workspaceMember.findFirst({
    where: { clerkUserId },
    select: { workspaceId: true },
  })
  if (!member) return null
  if (queryWorkspaceId && member.workspaceId !== queryWorkspaceId) return null
  return member.workspaceId
}

async function resolveUser(): Promise<string | null> {
  if (process.env.SKIP_AUTH === "true") return DEV_CLERK_USER_ID
  const { userId } = await auth()
  return userId
}

export async function GET(req: NextRequest) {
  const clerkUserId = await resolveUser()
  if (!clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const queryWsId = req.nextUrl.searchParams.get("workspaceId") ?? undefined
  const workspaceId = await getWorkspaceId(clerkUserId, queryWsId)
  if (!workspaceId) return NextResponse.json({ error: "Workspace not found" }, { status: 404 })

  const workflows = await prisma.workflow.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { runs: true } } },
  })
  return NextResponse.json(workflows)
}

export async function POST(req: NextRequest) {
  const clerkUserId = await resolveUser()
  if (!clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const queryWsId = req.nextUrl.searchParams.get("workspaceId") ?? undefined
  const workspaceId = await getWorkspaceId(clerkUserId, queryWsId)
  if (!workspaceId) return NextResponse.json({ error: "Workspace not found" }, { status: 404 })

  const body = (await req.json()) as { name?: string; graphJson?: WorkflowGraph; isActive?: boolean }
  if (!body.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 })

  const workflow = await prisma.workflow.create({
    data: {
      workspaceId,
      name: body.name.trim(),
      graphJson: (body.graphJson ?? { nodes: [], edges: [] }) as unknown as Prisma.InputJsonValue,
      isActive: body.isActive ?? false,
    },
  })
  return NextResponse.json(workflow, { status: 201 })
}
