import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@voxly/db"

const DEV_CLERK_USER_ID = "seed_owner"

export async function POST(req: NextRequest) {
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

  const body = (await req.json()) as { code: string }
  const { code } = body

  const clientId     = process.env.HUBSPOT_CLIENT_ID ?? ""
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET ?? ""
  const redirectUri  = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard/connectors/setup/hubspot`

  const tokenRes = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "authorization_code",
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri,
      code,
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    return NextResponse.json({ error: `HubSpot token exchange failed: ${err}` }, { status: 400 })
  }

  const tokenData = (await tokenRes.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }

  if (!tokenData.access_token) {
    return NextResponse.json({ error: "No access token returned" }, { status: 400 })
  }

  // Get portal info to use as connector name
  const portalRes = await fetch("https://api.hubapi.com/oauth/v1/access-tokens/" + tokenData.access_token)
  const portalData = (await portalRes.json()) as { hub_domain?: string; hub_id?: number }
  const portalName = portalData.hub_domain ?? `HubSpot #${portalData.hub_id ?? "unknown"}`

  // Upsert the connector
  const existing = await prisma.connector.findFirst({
    where: { workspaceId: member.workspaceId, type: "HUBSPOT" },
  })

  if (existing) {
    await prisma.connector.update({
      where: { id: existing.id },
      data: {
        configJson: {
          accessToken:  tokenData.access_token,
          refreshToken: tokenData.refresh_token,
        },
        status: "ACTIVE",
        enabled: true,
      },
    })
  } else {
    await prisma.connector.create({
      data: {
        workspaceId: member.workspaceId,
        type:        "HUBSPOT",
        name:        `HubSpot · ${portalName}`,
        configJson:  {
          accessToken:  tokenData.access_token,
          refreshToken: tokenData.refresh_token,
        },
        status:  "ACTIVE",
        enabled: true,
      },
    })
  }

  // Enqueue an initial CRM sync
  const { createRedisConnection, createCrmSyncQueue, JOB_NAMES } = await import("@voxly/queue")
  const redis = createRedisConnection()
  const queue = createCrmSyncQueue(redis)
  try {
    const connector = await prisma.connector.findFirst({
      where: { workspaceId: member.workspaceId, type: "HUBSPOT" },
      select: { id: true },
    })
    if (connector) {
      await queue.add(JOB_NAMES.SYNC_CRM, { connectorId: connector.id, workspaceId: member.workspaceId })
    }
  } finally {
    await redis.quit()
  }

  return NextResponse.json({ ok: true })
}
