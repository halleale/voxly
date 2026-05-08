import type { ConnectorAdapter } from "./adapter"
import type { NormalizedFeedback, ConnectorConfig } from "@voxly/types"
import { SourceType } from "@voxly/types"

// ─── Jira API helpers ─────────────────────────────────────────────────────────

interface JiraCloudId {
  id: string
  url: string
  name: string
  scopes: string[]
}

/** Fetch the Atlassian cloud ID (site ID) for the first accessible site. */
export async function fetchJiraCloudId(accessToken: string): Promise<JiraCloudId | null> {
  const res = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  })
  if (!res.ok) return null
  const sites = (await res.json()) as JiraCloudId[]
  return sites[0] ?? null
}

function jiraApiBase(cloudId: string): string {
  return `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3`
}

// ─── Create a Jira issue ──────────────────────────────────────────────────────

export interface CreateJiraIssueInput {
  accessToken: string
  cloudId:     string
  projectKey:  string
  summary:     string
  description: string
  issueType?:  string
}

export interface JiraIssue {
  id:  string
  key: string
  url: string
}

export async function createJiraIssue(input: CreateJiraIssueInput): Promise<JiraIssue> {
  const base = jiraApiBase(input.cloudId)
  const res = await fetch(`${base}/issue`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      fields: {
        project:   { key: input.projectKey },
        summary:   input.summary,
        issuetype: { name: input.issueType ?? "Task" },
        description: {
          type:    "doc",
          version: 1,
          content: [
            {
              type:    "paragraph",
              content: [{ type: "text", text: input.description }],
            },
          ],
        },
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Jira create issue error ${res.status}: ${body}`)
  }

  const data = (await res.json()) as { id: string; key: string; self: string }
  const siteUrl = `https://api.atlassian.com/ex/jira/${input.cloudId}`
  return {
    id:  data.id,
    key: data.key,
    url: `${siteUrl}/browse/${data.key}`,
  }
}

// ─── Add a comment to a Jira issue ───────────────────────────────────────────

export async function addJiraComment(
  accessToken: string,
  cloudId: string,
  issueIdOrKey: string,
  body: string,
): Promise<void> {
  const base = jiraApiBase(cloudId)
  const res = await fetch(`${base}/issue/${issueIdOrKey}/comment`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      body: {
        type:    "doc",
        version: 1,
        content: [
          {
            type:    "paragraph",
            content: [{ type: "text", text: body }],
          },
        ],
      },
    }),
  })

  if (!res.ok) throw new Error(`Jira add comment error: ${res.status}`)
}

// ─── Fetch issue status (for bi-directional sync) ─────────────────────────────

export async function fetchJiraIssueStatus(
  accessToken: string,
  cloudId: string,
  issueIdOrKey: string,
): Promise<{ status: string } | null> {
  const base = jiraApiBase(cloudId)
  const res = await fetch(`${base}/issue/${issueIdOrKey}?fields=status`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  })
  if (!res.ok) return null

  const data = (await res.json()) as { fields?: { status?: { name?: string } } }
  const status = data.fields?.status?.name
  return status ? { status } : null
}

// ─── Fetch projects (for setup UI picker) ────────────────────────────────────

export interface JiraProject {
  id:  string
  key: string
  name: string
}

export async function fetchJiraProjects(
  accessToken: string,
  cloudId: string,
): Promise<JiraProject[]> {
  const base = jiraApiBase(cloudId)
  const res = await fetch(`${base}/project/search?maxResults=50`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  })
  if (!res.ok) return []

  const data = (await res.json()) as { values?: JiraProject[] }
  return data.values ?? []
}

// ─── Build issue description from feedback context ────────────────────────────

export function buildJiraIssueDescription(opts: {
  verbatimText:  string
  authorName?:   string | null
  customerName?: string | null
  customerTier?: string | null
  arrCents?:     number | null
  sourceType:    string
  externalUrl?:  string | null
  feedbackItemId: string
  appUrl:        string
}): string {
  const arr = opts.arrCents
    ? `$${Math.round(opts.arrCents / 100).toLocaleString()} ARR`
    : null
  const customerLine = [opts.customerName, opts.customerTier, arr]
    .filter(Boolean)
    .join(" · ")

  return [
    "Customer Feedback",
    "",
    opts.customerName ? `Customer: ${customerLine}` : null,
    `Source: ${opts.sourceType}`,
    opts.externalUrl ? `Original: ${opts.externalUrl}` : null,
    "",
    "Verbatim:",
    `"${opts.verbatimText}"`,
    "",
    `View in Voxly: ${opts.appUrl}/dashboard/feedback?item=${opts.feedbackItemId}`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n")
}

// ─── ConnectorAdapter (action-only — Jira doesn't produce feedback items) ─────

export const jiraConnector: ConnectorAdapter = {
  type: SourceType.JIRA,

  normalize(_raw: unknown, _config: ConnectorConfig): NormalizedFeedback[] {
    return []
  },

  async validate(config: ConnectorConfig): Promise<{ valid: boolean; error?: string }> {
    if (!config.accessToken) return { valid: false, error: "Missing Jira access token" }

    const cloudId = config.settings?.cloudId as string | undefined
    if (!cloudId) {
      // Try to resolve the cloud ID on validation
      const site = await fetchJiraCloudId(config.accessToken)
      if (!site) return { valid: false, error: "Could not access any Jira sites" }
    }

    return { valid: true }
  },
}
