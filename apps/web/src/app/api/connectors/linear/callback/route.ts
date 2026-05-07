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

  const clientId     = process.env.LINEAR_CLIENT_ID ?? ""
  const clientSecret = process.env.LINEAR_CLIENT_SECRET ?? ""
  const redirectUri  = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard/connectors/setup/linear`

  const tokenRes = await fetch("https://api.linear.app/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      redirect_uri:  redirectUri,
      client_id:     clientId,
      client_secret: clientSecret,
      grant_type:    "authorization_code",
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    return NextResponse.json({ error: `Linear token exchange failed: ${err}` }, { status: 400 })
  }

  const tokenData = (await tokenRes.json()) as {
    access_token?: string
    token_type?: string
    organization?: { name?: string }
  }

  if (!tokenData.access_token) {
    return NextResponse.json({ error: "No access token returned" }, { status: 400 })
  }

  const orgName = tokenData.organization?.name ?? "Linear"

  const existing = await prisma.connector.findFirst({
    where: { workspaceId: member.workspaceId, type: "LINEAR" },
  })

  if (existing) {
    await prisma.connector.update({
      where: { id: existing.id },
      data: {
        configJson: { accessToken: tokenData.access_token },
        status: "ACTIVE",
        enabled: true,
      },
    })
  } else {
    await prisma.connector.create({
      data: {
        workspaceId: member.workspaceId,
        type:        "LINEAR",
        name:        `Linear · ${orgName}`,
        configJson:  { accessToken: tokenData.access_token },
        status:      "ACTIVE",
        enabled:     true,
      },
    })
  }

  return NextResponse.json({ ok: true })
}
