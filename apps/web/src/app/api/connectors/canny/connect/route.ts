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

  const body = (await request.json()) as { apiKey?: string }

  if (!body.apiKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 400 })
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { clerkUserId },
    select: { workspaceId: true },
  })
  if (!member) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 })
  }

  const connector = await prisma.connector.create({
    data: {
      workspaceId: member.workspaceId,
      type:        "CANNY",
      name:        "Canny",
      status:      "ACTIVE",
      configJson: {
        // Canny uses the same API key for both API access and webhook signature verification
        accessToken: body.apiKey,
      },
    },
  })

  return NextResponse.json({ ok: true, connectorId: connector.id })
}
