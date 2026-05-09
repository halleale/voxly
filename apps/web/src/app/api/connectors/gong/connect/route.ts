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

  const body = (await request.json()) as { accessToken?: string; webhookSecret?: string }

  if (!body.accessToken || !body.webhookSecret) {
    return NextResponse.json({ error: "Missing access token or webhook secret" }, { status: 400 })
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { clerkUserId },
    select: { workspaceId: true },
  })
  if (!member) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 })
  }

  const gongId = `${member.workspaceId}:GONG`
  const connector = await prisma.connector.upsert({
    where: { id: gongId },
    create: {
      id:          gongId,
      workspaceId: member.workspaceId,
      type:        "GONG",
      name:        "Gong",
      status:      "ACTIVE",
      configJson: {
        accessToken:   body.accessToken,
        webhookSecret: body.webhookSecret,
      },
    },
    update: {
      status:     "ACTIVE",
      configJson: {
        accessToken:   body.accessToken,
        webhookSecret: body.webhookSecret,
      },
    },
  })

  return NextResponse.json({ ok: true, connectorId: connector.id })
}
