import type { ConnectorAdapter } from "./adapter"
import type { NormalizedFeedback, ConnectorConfig } from "@voxly/types"
import { SourceType } from "@voxly/types"
import type { NormalizedCustomer } from "./hubspot"

// ─── ARR → tier (shared with HubSpot) ────────────────────────────────────────

function arrToTier(arrCents: number): "ENTERPRISE" | "GROWTH" | "STARTER" {
  if (arrCents >= 5_000_000_00) return "ENTERPRISE"
  if (arrCents >= 1_000_000_00) return "GROWTH"
  return "STARTER"
}

// ─── Salesforce REST API ──────────────────────────────────────────────────────

interface SalesforceAccount {
  Id: string
  Name: string
  Website?: string
  AnnualRevenue?: number
  Industry?: string
  BillingCountry?: string
  SystemModstamp?: string
}

interface SalesforceQueryResponse<T> {
  totalSize: number
  done: boolean
  nextRecordsUrl?: string
  records: T[]
}

interface SalesforceTokenResponse {
  access_token: string
  instance_url: string
  token_type: string
  error?: string
  error_description?: string
}

/** Extract a clean domain from a Website field. */
function extractDomain(website?: string): string | undefined {
  if (!website) return undefined
  try {
    const url = new URL(website.startsWith("http") ? website : `https://${website}`)
    return url.hostname.replace(/^www\./, "").toLowerCase()
  } catch {
    return undefined
  }
}

export async function fetchSalesforceAccounts(
  accessToken: string,
  instanceUrl: string,
  since?: Date,
): Promise<NormalizedCustomer[]> {
  const customers: NormalizedCustomer[] = []
  const sinceClause = since
    ? ` AND SystemModstamp >= ${since.toISOString()}`
    : ""

  const soql =
    `SELECT Id, Name, Website, AnnualRevenue, Industry, SystemModstamp ` +
    `FROM Account WHERE IsDeleted = false${sinceClause} ` +
    `ORDER BY SystemModstamp DESC LIMIT 2000`

  let url: string | null =
    `${instanceUrl}/services/data/v58.0/query?q=${encodeURIComponent(soql)}`

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Salesforce query error ${res.status}: ${body.slice(0, 200)}`)
    }

    const data = (await res.json()) as SalesforceQueryResponse<SalesforceAccount>

    for (const acct of data.records) {
      const name = acct.Name ?? "Unknown Account"
      const domain = extractDomain(acct.Website)
      const arrCents = acct.AnnualRevenue ? Math.round(acct.AnnualRevenue * 100) : 0

      customers.push({
        crmId: acct.Id,
        name,
        domain,
        arrCents: arrCents > 0 ? arrCents : undefined,
        tier: arrToTier(arrCents),
      })
    }

    url = data.nextRecordsUrl ? `${instanceUrl}${data.nextRecordsUrl}` : null
  }

  return customers
}

/** Exchange an OAuth code for Salesforce tokens. */
export async function exchangeSalesforceCode(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; instanceUrl: string; refreshToken?: string }> {
  const params = new URLSearchParams({
    grant_type:    "authorization_code",
    code,
    redirect_uri:  redirectUri,
    client_id:     process.env.SALESFORCE_CLIENT_ID ?? "",
    client_secret: process.env.SALESFORCE_CLIENT_SECRET ?? "",
  })

  const res = await fetch("https://login.salesforce.com/services/oauth2/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    params.toString(),
  })

  const data = (await res.json()) as SalesforceTokenResponse
  if (data.error) throw new Error(`Salesforce OAuth error: ${data.error_description ?? data.error}`)

  return {
    accessToken:  data.access_token,
    instanceUrl:  data.instance_url,
    refreshToken: undefined,
  }
}

// ─── ConnectorAdapter ─────────────────────────────────────────────────────────

export const salesforceConnector: ConnectorAdapter = {
  type: SourceType.SALESFORCE,

  normalize(_raw: unknown, _config: ConnectorConfig): NormalizedFeedback[] {
    // Salesforce is a CRM source — feedback flows through CRM_SYNC, not ingestion
    return []
  },

  async validate(config: ConnectorConfig) {
    if (!config.accessToken) return { valid: false, error: "Missing Salesforce access token" }
    const instanceUrl = (config.settings?.instanceUrl as string | undefined) ?? ""
    if (!instanceUrl) return { valid: false, error: "Missing Salesforce instance URL" }

    try {
      const res = await fetch(
        `${instanceUrl}/services/data/v58.0/query?q=SELECT+Id+FROM+Account+LIMIT+1`,
        { headers: { Authorization: `Bearer ${config.accessToken}` } },
      )
      if (!res.ok) return { valid: false, error: `Salesforce returned ${res.status}` }
      return { valid: true }
    } catch (err) {
      return { valid: false, error: String(err) }
    }
  },
}
