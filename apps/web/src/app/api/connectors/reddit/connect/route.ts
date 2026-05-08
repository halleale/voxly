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

  const body = (await request.json()) as { keywords?: string[]; subreddits?: string[] }

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

  const subreddits = body.subreddits ?? []
  const nameLabel = subreddits.length > 0
    ? `Reddit r/${subreddits.slice(0, 2).join(", r/")} — ${body.keywords.slice(0, 2).join(", ")}`
    : `Reddit — ${body.keywords.slice(0, 3).join(", ")}`

  await prisma.connector.create({
    data: {
      workspaceId: member.workspaceId,
      type:        "REDDIT",
      name:        nameLabel,
      status:      "ACTIVE",
      configJson: {
        settings: { keywords: body.keywords, subreddits },
      },
    },
  })

  return NextResponse.json({ ok: true })
}
