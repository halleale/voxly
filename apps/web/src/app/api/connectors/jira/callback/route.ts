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

  const body = (await request.json()) as { code?: string }
  if (!body.code) {
    return NextResponse.json({ error: "Missing OAuth code" }, { status: 400 })
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { clerkUserId },
    select: { workspaceId: true },
  })
  if (!member) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 })
  }

  const clientId = process.env.JIRA_CLIENT_ID
  const clientSecret = process.env.JIRA_CLIENT_SECRET
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin}/dashboard/connectors/setup/jira`

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Jira OAuth not configured" }, { status: 500 })
  }

  // Exchange code for access token
  const tokenRes = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type:    "authorization_code",
      client_id:     clientId,
      client_secret: clientSecret,
      code:          body.code,
      redirect_uri:  redirectUri,
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    return NextResponse.json({ error: `Jira token exchange failed: ${err}` }, { status: 400 })
  }

  const tokens = (await tokenRes.json()) as {
    access_token:  string
    refresh_token?: string
    expires_in?:   number
  }

  // Resolve the cloud ID for the first accessible site
  const sitesRes = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
    headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json" },
  })
  const sites = sitesRes.ok
    ? ((await sitesRes.json()) as Array<{ id: string; name: string; url: string }>)
    : []

  const firstSite = sites[0]

  const jiraId = `${member.workspaceId}:JIRA`
  await prisma.connector.upsert({
    where: { id: jiraId },
    create: {
      id:          jiraId,
      workspaceId: member.workspaceId,
      type:        "JIRA",
      name:        firstSite ? `Jira — ${firstSite.name}` : "Jira",
      status:      "ACTIVE",
      configJson:  {
        accessToken:  tokens.access_token,
        refreshToken: tokens.refresh_token,
        settings: {
          cloudId:   firstSite?.id,
          siteUrl:   firstSite?.url,
          siteName:  firstSite?.name,
        },
      },
    },
    update: {
      name:       firstSite ? `Jira — ${firstSite.name}` : "Jira",
      status:     "ACTIVE",
      configJson: {
        accessToken:  tokens.access_token,
        refreshToken: tokens.refresh_token,
        settings: {
          cloudId:   firstSite?.id,
          siteUrl:   firstSite?.url,
          siteName:  firstSite?.name,
        },
      },
    },
  })

  return NextResponse.json({ ok: true })
}
