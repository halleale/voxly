import type { Job } from "bullmq"
import type { PrismaClient } from "@voxly/db"
import type { CrmEnrichJob } from "@voxly/queue"
import {
  lookupContactByEmail,
  lookupCompanyByDomain,
  mapLifecyclestageToTier,
} from "@voxly/connectors"

export async function handleCrmEnrich(job: Job<CrmEnrichJob>, prisma: PrismaClient) {
  const { feedbackItemId, workspaceId, authorEmail, authorDomain } = job.data

  // Find the HubSpot connector for this workspace
  const hubspotConnector = await prisma.connector.findFirst({
    where: { workspaceId, type: "HUBSPOT", enabled: true, status: "ACTIVE" },
    select: { configJson: true },
  })
  if (!hubspotConnector) return

  const config = hubspotConnector.configJson as { accessToken?: string }
  if (!config.accessToken) return

  const domain = authorDomain ?? (authorEmail ? authorEmail.split("@")[1] : undefined)
  if (!domain) return

  // Skip personal email domains
  const freeEmailDomains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"]
  if (freeEmailDomains.includes(domain)) return

  // Look up company by domain
  const company = await lookupCompanyByDomain(config.accessToken, domain)
  if (!company) return

  const arrCents = company.properties.annualrevenue
    ? Math.round(parseFloat(company.properties.annualrevenue) * 100)
    : undefined

  // Determine tier: > $100k ARR = Enterprise, > $10k = Growth, else Starter
  let tier: "ENTERPRISE" | "GROWTH" | "STARTER" = mapLifecyclestageToTier(
    company.properties.lifecyclestage
  )
  if (arrCents !== undefined) {
    if (arrCents >= 100_000_00) tier = "ENTERPRISE"
    else if (arrCents >= 10_000_00) tier = "GROWTH"
    else tier = "STARTER"
  }

  // Upsert customer record
  const customer = await prisma.customer.upsert({
    where: {
      // Use a unique lookup by workspaceId + domain (add this unique index if missing)
      id: "noop",
    },
    create: {
      workspaceId,
      name: company.properties.name ?? domain,
      domain,
      tier,
      arrCents,
      crmId: company.id,
      enrichedAt: new Date(),
    },
    update: {
      name: company.properties.name ?? domain,
      tier,
      arrCents,
      enrichedAt: new Date(),
    },
  }).catch(async () => {
    // fallback: find or create by domain
    const existing = await prisma.customer.findFirst({
      where: { workspaceId, domain },
      select: { id: true },
    })
    if (existing) {
      return prisma.customer.update({
        where: { id: existing.id },
        data: { name: company.properties.name ?? domain, tier, arrCents, enrichedAt: new Date() },
      })
    }
    return prisma.customer.create({
      data: {
        workspaceId,
        name: company.properties.name ?? domain,
        domain,
        tier,
        arrCents,
        crmId: company.id,
        enrichedAt: new Date(),
      },
    })
  })

  // Link the feedback item to this customer
  await prisma.feedbackItem.update({
    where: { id: feedbackItemId },
    data: { customerId: customer.id },
  })

  // If this changes severity (enterprise + high negative), re-run severity inference
  const item = await prisma.feedbackItem.findUnique({
    where: { id: feedbackItemId },
    select: { sentiment: true, severity: true },
  })
  if (
    tier === "ENTERPRISE" &&
    item?.sentiment !== null &&
    item?.sentiment !== undefined &&
    item.sentiment < -0.5 &&
    item.severity !== "HIGH"
  ) {
    await prisma.feedbackItem.update({
      where: { id: feedbackItemId },
      data: { severity: "HIGH" },
    })
  }
}
