import type { ConnectorConfig, NormalizedFeedback } from "@voxly/types"
import { SourceType } from "@voxly/types"
import type { ConnectorAdapter } from "./adapter"

// ─── HubSpot API types ────────────────────────────────────────────────────────

interface HubSpotCompany {
  id: string
  properties: {
    name?: string
    domain?: string
    annualrevenue?: string
    hs_annual_revenue?: string
    lifecyclestage?: string
    hs_object_id?: string
  }
  updatedAt?: string
}

interface HubSpotCompaniesResponse {
  results: HubSpotCompany[]
  paging?: { next?: { after?: string; link?: string } }
}

export interface NormalizedCustomer {
  crmId: string
  name: string
  domain?: string
  arrCents?: number
  tier: "ENTERPRISE" | "GROWTH" | "STARTER"
}

// ─── ARR → tier mapping ───────────────────────────────────────────────────────

function arrToTier(arrCents: number): "ENTERPRISE" | "GROWTH" | "STARTER" {
  if (arrCents >= 5000000_00) return "ENTERPRISE"  // $50k+
  if (arrCents >= 1000000_00) return "GROWTH"       // $10k+
  return "STARTER"
}

// ─── HubSpot CRM sync — fetches companies, returns NormalizedCustomer[] ───────

export async function fetchHubSpotCompanies(
  accessToken: string,
  since?: Date,
): Promise<NormalizedCustomer[]> {
  const customers: NormalizedCustomer[] = []
  let after: string | undefined

  const sinceMs = since?.getTime() ?? 0

  do {
    const params = new URLSearchParams({
      limit: "100",
      properties: ["name", "domain", "annualrevenue", "hs_annual_revenue"].join(","),
    })
    if (after) params.set("after", after)

    const res = await fetch(
      `https://api.hubapi.com/crm/v3/objects/companies?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`HubSpot API error ${res.status}: ${body.slice(0, 200)}`)
    }

    const data = (await res.json()) as HubSpotCompaniesResponse

    for (const company of data.results) {
      // Skip if not updated since `since`
      if (since && company.updatedAt) {
        const updatedMs = new Date(company.updatedAt).getTime()
        if (updatedMs < sinceMs) continue
      }

      const name = company.properties.name ?? "Unknown Company"
      const domain = company.properties.domain ?? undefined

      const rawArr =
        company.properties.hs_annual_revenue ??
        company.properties.annualrevenue ??
        "0"
      const arrDollars = parseFloat(rawArr) || 0
      const arrCents = Math.round(arrDollars * 100)

      customers.push({
        crmId: company.id,
        name,
        domain: domain?.toLowerCase(),
        arrCents: arrCents > 0 ? arrCents : undefined,
        tier: arrToTier(arrCents),
      })
    }

    after = data.paging?.next?.after
  } while (after)

  return customers
}

// ─── ConnectorAdapter implementation (used only for validate + registration) ──
// HubSpot is a CRM source, not a feedback source, so normalize() returns [].
// Actual data flow goes through the CRM_SYNC queue job.

export const hubspotConnector: ConnectorAdapter = {
  type: SourceType.HUBSPOT,

  normalize(_raw: unknown, _config: ConnectorConfig): NormalizedFeedback[] {
    return []
  },

  async validate(config: ConnectorConfig) {
    if (!config.accessToken) {
      return { valid: false, error: "Missing HubSpot access token" }
    }
    try {
      const res = await fetch("https://api.hubapi.com/crm/v3/objects/companies?limit=1", {
        headers: { Authorization: `Bearer ${config.accessToken}` },
      })
      if (!res.ok) return { valid: false, error: `HubSpot returned ${res.status}` }
      return { valid: true }
    } catch (err) {
      return { valid: false, error: String(err) }
    }
  },
}
