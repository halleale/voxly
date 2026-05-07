import type { ConnectorAdapter } from "./adapter"
import type { ConnectorConfig, NormalizedFeedback } from "@voxly/types"
import { SourceType } from "@voxly/types"

// HubSpot is a CRM connector — it syncs customers, not feedback items.
// poll() returns an empty array for feedback; the CRM enrichment job
// uses the HubSpot API directly to look up contacts/companies by email/domain.
export class HubSpotAdapter implements ConnectorAdapter {
  readonly type = SourceType.HUBSPOT

  normalize(_raw: unknown, _config: ConnectorConfig): NormalizedFeedback[] {
    // HubSpot does not produce feedback items
    return []
  }

  async poll(config: ConnectorConfig, since: Date): Promise<NormalizedFeedback[]> {
    // No feedback items from HubSpot — used only for CRM enrichment
    return []
  }

  async validate(config: ConnectorConfig): Promise<{ valid: boolean; error?: string }> {
    if (!config.accessToken) return { valid: false, error: "Missing HubSpot access token" }
    try {
      const res = await fetch("https://api.hubapi.com/crm/v3/owners/?limit=1", {
        headers: { Authorization: `Bearer ${config.accessToken}` },
      })
      if (!res.ok) return { valid: false, error: "HubSpot auth failed" }
      return { valid: true }
    } catch {
      return { valid: false, error: "Network error validating HubSpot token" }
    }
  }
}

// ─── CRM lookup helpers ───────────────────────────────────────────────────────

interface HubSpotContact {
  id: string
  properties: {
    email?: string
    firstname?: string
    lastname?: string
    company?: string
    associatedcompanyid?: string
  }
}

interface HubSpotCompany {
  id: string
  properties: {
    name?: string
    domain?: string
    annualrevenue?: string
    hs_annual_revenue_currency_code?: string
    lifecyclestage?: string
  }
}

export async function lookupContactByEmail(
  accessToken: string,
  email: string
): Promise<HubSpotContact | null> {
  try {
    const res = await fetch(
      `https://api.hubapi.com/crm/v3/objects/contacts/search`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filterGroups: [
            { filters: [{ propertyName: "email", operator: "EQ", value: email }] },
          ],
          properties: ["email", "firstname", "lastname", "company", "associatedcompanyid"],
          limit: 1,
        }),
      }
    )
    if (!res.ok) return null
    const data = (await res.json()) as { results: HubSpotContact[] }
    return data.results[0] ?? null
  } catch {
    return null
  }
}

export async function lookupCompanyByDomain(
  accessToken: string,
  domain: string
): Promise<HubSpotCompany | null> {
  try {
    const res = await fetch(
      `https://api.hubapi.com/crm/v3/objects/companies/search`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filterGroups: [
            { filters: [{ propertyName: "domain", operator: "EQ", value: domain }] },
          ],
          properties: ["name", "domain", "annualrevenue", "lifecyclestage"],
          limit: 1,
        }),
      }
    )
    if (!res.ok) return null
    const data = (await res.json()) as { results: HubSpotCompany[] }
    return data.results[0] ?? null
  } catch {
    return null
  }
}

// Map HubSpot lifecyclestage to our CustomerTier
export function mapLifecyclestageToTier(stage?: string): "ENTERPRISE" | "GROWTH" | "STARTER" {
  if (!stage) return "STARTER"
  const s = stage.toLowerCase()
  if (s === "customer" || s === "evangelist") return "GROWTH"
  // HubSpot doesn't natively have "enterprise" — use ARR as the signal
  return "STARTER"
}
