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

  const body = await req.json() as { code: string }
  const { code } = body

  const clientId     = process.env.INTERCOM_CLIENT_ID ?? ""
  const clientSecret = process.env.INTERCOM_CLIENT_SECRET ?? ""

  // Exchange code for access token
  const tokenRes = await fetch("https://api.intercom.io/auth/eagle/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ code, client_id: clientId, client_secret: clientSecret }),
  })

  const tokenData = await tokenRes.json() as {
    access_token?: string
    token?: string
    error?: string
  }

  const accessToken = tokenData.access_token ?? tokenData.token
  if (!accessToken) {
    return NextResponse.json(
      { error: tokenData.error ?? "Intercom token exchange failed" },
      { status: 400 },
    )
  }

  await prisma.connector.upsert({
    where: { id: `${member.workspaceId}:INTERCOM` },
    create: {
      id:          `${member.workspaceId}:INTERCOM`,
      workspaceId: member.workspaceId,
      type:        "INTERCOM",
      name:        "Intercom",
      status:      "ACTIVE",
      configJson:  {
        accessToken,
        webhookSecret: process.env.INTERCOM_WEBHOOK_SECRET ?? "",
        settings:      {},
      },
    },
    update: {
      status:     "ACTIVE",
      configJson: {
        accessToken,
        webhookSecret: process.env.INTERCOM_WEBHOOK_SECRET ?? "",
        settings:      {},
      },
    },
  })

  return NextResponse.json({ ok: true })
}
