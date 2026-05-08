import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma, Prisma } from "@voxly/db"
import type { WorkflowGraph } from "@voxly/types"

const DEV_CLERK_USER_ID = "seed_owner"

async function resolveUser(): Promise<string | null> {
  if (process.env.SKIP_AUTH === "true") return DEV_CLERK_USER_ID
  const { userId } = await auth()
  return userId
}

async function getWorkflow(workflowId: string, clerkUserId: string, queryWsId?: string) {
  const member = await prisma.workspaceMember.findFirst({
    where: { clerkUserId },
    select: { workspaceId: true },
  })
  if (!member) return null
  if (queryWsId && member.workspaceId !== queryWsId) return null
  return prisma.workflow.findFirst({
    where: { id: workflowId, workspaceId: member.workspaceId },
  })
}

export async function GET(
  req: NextRequest,
  { params }: { params: { workflowId: string } },
) {
  const clerkUserId = await resolveUser()
  if (!clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const wf = await getWorkflow(params.workflowId, clerkUserId, req.nextUrl.searchParams.get("workspaceId") ?? undefined)
  if (!wf) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(wf)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { workflowId: string } },
) {
  const clerkUserId = await resolveUser()
  if (!clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const wf = await getWorkflow(params.workflowId, clerkUserId, req.nextUrl.searchParams.get("workspaceId") ?? undefined)
  if (!wf) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = (await req.json()) as { name?: string; graphJson?: WorkflowGraph; isActive?: boolean }
  const updated = await prisma.workflow.update({
    where: { id: wf.id },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.graphJson !== undefined && { graphJson: body.graphJson as unknown as Prisma.InputJsonValue }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { workflowId: string } },
) {
  const clerkUserId = await resolveUser()
  if (!clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const wf = await getWorkflow(params.workflowId, clerkUserId, req.nextUrl.searchParams.get("workspaceId") ?? undefined)
  if (!wf) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.workflow.delete({ where: { id: wf.id } })
  return new NextResponse(null, { status: 204 })
}
