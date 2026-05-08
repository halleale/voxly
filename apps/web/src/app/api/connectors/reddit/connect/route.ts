import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@voxly/db"
import { redditConnector } from "@voxly/connectors"

const SKIP_AUTH = process.env.SKIP_AUTH === "true"
const DEV_CLERK_USER_ID = "seed_owner"

export async function POST(request: NextRequest) {
  const clerkUserId = SKIP_AUTH
    ? DEV_CLERK_USER_ID
    : (await auth()).userId

  if (!clerkUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await request.json()) as { subreddits?: string[]; keywords?: string[] }

  if (!body.subreddits?.length) {
    return NextResponse.json({ error: "At least one subreddit is required" }, { status: 400 })
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { clerkUserId },
    select: { workspaceId: true },
  })
  if (!member) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 })
  }

  const config = { settings: { subreddits: body.subreddits, keywords: body.keywords ?? [] } }
  const validation = await redditConnector.validate(config)
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const name = `Reddit — r/${body.subreddits.slice(0, 2).join(", r/")}`

  await prisma.connector.create({
    data: {
      workspaceId: member.workspaceId,
      type:        "REDDIT",
      name,
      status:      "ACTIVE",
      configJson:  config,
    },
  })

  return NextResponse.json({ ok: true })
}
