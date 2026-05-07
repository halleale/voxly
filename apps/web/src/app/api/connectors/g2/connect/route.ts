import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@voxly/db"

const SKIP_AUTH = process.env.SKIP_AUTH === "true"
const DEV_CLERK_USER_ID = "seed_owner"

export async function POST(request: NextRequest) {
  const clerkUserId = SKIP_AUTH
    ? DEV_CLERK_USER_ID
    : (await auth()).userId

  if (!clerkUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await request.json()) as { apiToken?: string; productId?: string }

  if (!body.apiToken || !body.productId) {
    return NextResponse.json({ error: "Missing API token or product ID" }, { status: 400 })
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { clerkUserId },
    select: { workspaceId: true },
  })
  if (!member) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 })
  }

  await prisma.connector.create({
    data: {
      workspaceId: member.workspaceId,
      type:        "G2",
      name:        "G2 Reviews",
      status:      "ACTIVE",
      configJson: {
        accessToken: body.apiToken,
        settings: { productId: body.productId },
      },
    },
  })

  return NextResponse.json({ ok: true })
}
