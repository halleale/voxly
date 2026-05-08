import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@voxly/db"
import { exchangeSalesforceCode, fetchSalesforceAccounts } from "@voxly/connectors"

export async function POST(req: Request) {
  const skip = process.env.SKIP_AUTH === "true"
  const clerkUserId = skip ? "seed_owner" : (await auth()).userId

  if (!clerkUserId) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  }

  const { code } = (await req.json()) as { code?: string }
  if (!code) {
    return NextResponse.json({ error: "Missing OAuth code" }, { status: 400 })
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { clerkUserId },
    select: { workspaceId: true, role: true },
  })

  if (!member) {
    return NextResponse.json({ error: "Not a workspace member" }, { status: 403 })
  }

  if (!["OWNER", "ADMIN"].includes(member.role)) {
    return NextResponse.json({ error: "Requires ADMIN or higher" }, { status: 403 })
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard/connectors/setup/salesforce`

  try {
    const { accessToken, instanceUrl } = await exchangeSalesforceCode(code, redirectUri)

    // Upsert the Salesforce connector
    const connector = await prisma.connector.upsert({
      where: {
        workspaceId_type: { workspaceId: member.workspaceId, type: "SALESFORCE" },
      },
      create: {
        workspaceId: member.workspaceId,
        type:        "SALESFORCE",
        name:        "Salesforce",
        status:      "ACTIVE",
        configJson:  { accessToken, instanceUrl },
      },
      update: {
        status:     "ACTIVE",
        configJson: { accessToken, instanceUrl },
      },
    })

    // Kick off an initial CRM sync in the background
    fetchSalesforceAccounts(accessToken, instanceUrl)
      .then(async (customers) => {
        for (const c of customers) {
          await prisma.crmCustomer.upsert({
            where: { workspaceId_crmId: { workspaceId: member.workspaceId, crmId: c.crmId } },
            create: { ...c, workspaceId: member.workspaceId, sourceConnectorId: connector.id },
            update: { name: c.name, domain: c.domain, arrCents: c.arrCents, tier: c.tier },
          })
        }
        await prisma.connector.update({
          where: { id: connector.id },
          data: { lastPolledAt: new Date(), itemCount: customers.length },
        })
      })
      .catch((err: unknown) => console.error("Salesforce initial sync error:", err))

    return NextResponse.json({ connectorId: connector.id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
