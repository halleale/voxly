import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@voxly/db"
import { createHash, randomBytes } from "crypto"

const SKIP_AUTH = process.env.SKIP_AUTH === "true"
const DEV_CLERK_USER_ID = "seed_owner"

function hashKey(key: string) {
  return createHash("sha256").update(key).digest("hex")
}

async function resolveAndAuthorize(workspaceId: string) {
  const clerkUserId = SKIP_AUTH ? DEV_CLERK_USER_ID : (await auth()).userId
  if (!clerkUserId) return null

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_clerkUserId: { workspaceId, clerkUserId } },
    select: { role: true },
  })
  if (!member || !["OWNER", "ADMIN"].includes(member.role)) return null
  return member
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await context.params
  const member = await resolveAndAuthorize(workspaceId)
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const rawKey = `vxly_live_${randomBytes(24).toString("base64url")}`
  await prisma.workspace.update({ where: { id: workspaceId }, data: { apiKeyHash: hashKey(rawKey) } })

  return NextResponse.json({ key: rawKey, note: "Store this key securely. It will not be shown again." })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await context.params
  const member = await resolveAndAuthorize(workspaceId)
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  await prisma.workspace.update({ where: { id: workspaceId }, data: { apiKeyHash: null } })

  return new NextResponse(null, { status: 204 })
}
