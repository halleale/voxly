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

  const body = (await request.json()) as { keywords?: string[] }

  if (!body.keywords?.length) {
    return NextResponse.json({ error: "At least one keyword is required" }, { status: 400 })
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
      type:        "HN",
      name:        `HN — ${body.keywords.slice(0, 3).join(", ")}`,
      status:      "ACTIVE",
      configJson: {
        settings: { keywords: body.keywords },
      },
    },
  })

  return NextResponse.json({ ok: true })
}
