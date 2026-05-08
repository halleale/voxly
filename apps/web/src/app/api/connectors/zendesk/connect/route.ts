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

  const body = (await request.json()) as {
    subdomain?: string
    apiToken?: string
    adminEmail?: string
    webhookSecret?: string
  }

  if (!body.subdomain || !body.apiToken || !body.adminEmail || !body.webhookSecret) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
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
      type:        "ZENDESK",
      name:        `Zendesk — ${body.subdomain}`,
      status:      "ACTIVE",
      configJson: {
        accessToken:  body.apiToken,
        webhookSecret: body.webhookSecret,
        settings: {
          subdomain:  body.subdomain,
          adminEmail: body.adminEmail,
        },
      },
    },
  })

  return NextResponse.json({ ok: true })
}
