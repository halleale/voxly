import type { ConnectorAdapter } from "./adapter"
import type { ConnectorConfig, NormalizedFeedback } from "@voxly/types"
import { SourceType } from "@voxly/types"

// Salesforce connector — polls Cases and Chatter FeedItems for customer feedback.
// OAuth access token is the Salesforce Connected App access_token.
// settings.instanceUrl: required — e.g. "https://myorg.my.salesforce.com"

interface SFCase {
  Id: string
  CaseNumber: string
  Subject: string
  Description?: string
  SuppliedEmail?: string
  ContactEmail?: string
  ContactId?: string
  Contact?: { Name?: string; Email?: string }
  CreatedDate: string
  Status: string
}

interface SFChatterFeedItem {
  id: string
  body?: { text?: string }
  actor?: { name?: string; email?: string; id?: string }
  createdDate: string
  relatedRecordId?: string
}

interface SFQueryResponse<T> {
  totalSize: number
  done: boolean
  records: T[]
}

async function sfQuery<T>(
  instanceUrl: string,
  accessToken: string,
  soql: string
): Promise<T[]> {
  const url = `${instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(soql)}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  })
  if (!res.ok) throw new Error(`Salesforce query failed: ${res.status}`)
  const data = (await res.json()) as SFQueryResponse<T>
  return data.records
}

export class SalesforceAdapter implements ConnectorAdapter {
  readonly type = SourceType.SALESFORCE

  normalize(raw: unknown, _config: ConnectorConfig): NormalizedFeedback[] {
    const r = raw as SFCase
    const text = [r.Subject, r.Description].filter(Boolean).join("\n\n").trim()
    if (!text) return []

    return [
      {
        externalId: r.Id,
        externalUrl: undefined,
        verbatimText: text,
        authorName: r.Contact?.Name,
        authorEmail: r.SuppliedEmail ?? r.ContactEmail ?? r.Contact?.Email,
        sourceType: SourceType.SALESFORCE,
        publishedAt: new Date(r.CreatedDate),
        rawPayload: raw,
      },
    ]
  }

  async poll(config: ConnectorConfig, since: Date): Promise<NormalizedFeedback[]> {
    const { accessToken, settings } = config
    if (!accessToken) return []

    const instanceUrl = (settings?.instanceUrl as string | undefined) ?? ""
    if (!instanceUrl) return []

    const sinceIso = since.toISOString()
    const results: NormalizedFeedback[] = []

    // Poll Cases
    try {
      const cases = await sfQuery<SFCase>(
        instanceUrl,
        accessToken,
        `SELECT Id, CaseNumber, Subject, Description, SuppliedEmail, ContactEmail,
                Contact.Name, Contact.Email, CreatedDate, Status
         FROM Case
         WHERE CreatedDate > ${sinceIso}
         ORDER BY CreatedDate ASC
         LIMIT 200`
      )
      for (const c of cases) {
        results.push(...this.normalize(c, config))
      }
    } catch {
      // Partial results are better than none
    }

    // Poll Chatter FeedItems on Account/Opportunity objects
    try {
      const chatter = await sfQuery<SFChatterFeedItem>(
        instanceUrl,
        accessToken,
        `SELECT Id, Body, Actor.Name, CreatedDate
         FROM FeedItem
         WHERE CreatedDate > ${sinceIso}
           AND Type = 'TextPost'
         ORDER BY CreatedDate ASC
         LIMIT 200`
      )
      for (const item of chatter) {
        const text = item.body?.text?.trim() ?? ""
        if (!text) continue
        results.push({
          externalId: `chatter:${item.id}`,
          verbatimText: text,
          authorName: item.actor?.name,
          authorEmail: item.actor?.email,
          sourceType: SourceType.SALESFORCE,
          publishedAt: new Date(item.createdDate),
          rawPayload: item,
        })
      }
    } catch {
      // Chatter may not be enabled in all orgs — swallow silently
    }

    return results
  }

  async validate(config: ConnectorConfig): Promise<{ valid: boolean; error?: string }> {
    const { accessToken, settings } = config
    if (!accessToken) return { valid: false, error: "Missing Salesforce access token" }

    const instanceUrl = (settings?.instanceUrl as string | undefined) ?? ""
    if (!instanceUrl) return { valid: false, error: "Missing instanceUrl in settings" }

    try {
      const res = await fetch(`${instanceUrl}/services/data/v59.0/`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) return { valid: false, error: "Salesforce auth failed" }
      return { valid: true }
    } catch {
      return { valid: false, error: "Network error validating Salesforce token" }
    }
  }
}

// ─── CRM lookup helpers (mirrors HubSpot pattern) ─────────────────────────────

export async function lookupContactByEmail(
  instanceUrl: string,
  accessToken: string,
  email: string
): Promise<{ name?: string; accountName?: string; annualRevenue?: number } | null> {
  try {
    const contacts = await sfQuery<{
      Id: string
      Name: string
      Email: string
      Account?: { Name?: string; AnnualRevenue?: number }
    }>(
      instanceUrl,
      accessToken,
      `SELECT Id, Name, Email, Account.Name, Account.AnnualRevenue
       FROM Contact
       WHERE Email = '${email.replace(/'/g, "\\'")}'
       LIMIT 1`
    )
    const c = contacts[0]
    if (!c) return null
    return {
      name: c.Name,
      accountName: c.Account?.Name,
      annualRevenue: c.Account?.AnnualRevenue,
    }
  } catch {
    return null
  }
}
