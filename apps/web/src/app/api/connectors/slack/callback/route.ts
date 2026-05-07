import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@voxly/db"

const DEV_CLERK_USER_ID = "seed_owner"

export async function POST(req: NextRequest) {
  // Resolve workspace
  let clerkUserId: string | null
  if (process.env.SKIP_AUTH === "true") {
    clerkUserId = DEV_CLERK_USER_ID
  } else {
    const session = await auth()
    clerkUserId = session.userId
  }

  if (!clerkUserId) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  }

  const member = await prisma.workspaceMember.findFirst({ where: { clerkUserId } })
  if (!member) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 })
  }

  const body = await req.json() as { code: string }
  const { code } = body

  // Exchange code for access token with Slack
  const clientId     = process.env.SLACK_CLIENT_ID ?? ""
  const clientSecret = process.env.SLACK_CLIENT_SECRET ?? ""
  const signingSecret = process.env.SLACK_SIGNING_SECRET ?? ""
  const redirectUri  = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard/connectors/setup/slack`

  const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      code,
      redirect_uri:  redirectUri,
    }),
  })

  const tokenData = await tokenRes.json() as {
    ok: boolean
    access_token?: string
    team?: { name?: string }
    error?: string
  }

  if (!tokenData.ok || !tokenData.access_token) {
    return NextResponse.json(
      { error: tokenData.error ?? "Slack token exchange failed" },
      { status: 400 },
    )
  }

  // Create or update connector
  await prisma.connector.upsert({
    where: {
      // Use a fake unique key: workspaceId + type (only one Slack per workspace for now)
      id: `${member.workspaceId}:SLACK`,
    },
    create: {
      id:          `${member.workspaceId}:SLACK`,
      workspaceId: member.workspaceId,
      type:        "SLACK",
      name:        tokenData.team?.name ? `Slack · ${tokenData.team.name}` : "Slack",
      status:      "ACTIVE",
      configJson:  {
        accessToken:   tokenData.access_token,
        webhookSecret: signingSecret,
        settings:      { allowedChannels: [] },
      },
    },
    update: {
      status:     "ACTIVE",
      configJson: {
        accessToken:   tokenData.access_token,
        webhookSecret: signingSecret,
        settings:      { allowedChannels: [] },
      },
    },
  })

  return NextResponse.json({ ok: true })
}
