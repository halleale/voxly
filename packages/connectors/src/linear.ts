import type { ConnectorConfig, NormalizedFeedback } from "@voxly/types"
import { SourceType } from "@voxly/types"
import type { ConnectorAdapter } from "./adapter"

// ─── Linear GraphQL helpers ───────────────────────────────────────────────────

async function linearMutation<T>(
  accessToken: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!res.ok) throw new Error(`Linear API error: ${res.status}`)

  const data = (await res.json()) as { data?: T; errors?: Array<{ message: string }> }
  if (data.errors?.length) throw new Error(data.errors.map((e) => e.message).join("; "))
  if (!data.data) throw new Error("Linear API returned no data")
  return data.data
}

// ─── Get teams (needed to pick a teamId for issue creation) ──────────────────

interface LinearTeam { id: string; name: string; key: string }

export async function fetchLinearTeams(accessToken: string): Promise<LinearTeam[]> {
  const data = await linearMutation<{ teams: { nodes: LinearTeam[] } }>(
    accessToken,
    `query { teams { nodes { id name key } } }`,
  )
  return data.teams.nodes
}

// ─── Create a Linear issue ────────────────────────────────────────────────────

export interface CreateLinearIssueInput {
  accessToken: string
  teamId: string
  title: string
  description: string
}

export interface LinearIssue {
  id: string
  identifier: string   // e.g. "ENG-42"
  url: string
  title: string
  state: { name: string }
}

export async function createLinearIssue(input: CreateLinearIssueInput): Promise<LinearIssue> {
  const CREATE_ISSUE = `
    mutation CreateIssue($teamId: String!, $title: String!, $description: String!) {
      issueCreate(input: { teamId: $teamId, title: $title, description: $description }) {
        success
        issue {
          id
          identifier
          url
          title
          state { name }
        }
      }
    }
  `
  const data = await linearMutation<{
    issueCreate: { success: boolean; issue: LinearIssue }
  }>(input.accessToken, CREATE_ISSUE, {
    teamId: input.teamId,
    title: input.title,
    description: input.description,
  })

  if (!data.issueCreate.success) throw new Error("Linear issue creation failed")
  return data.issueCreate.issue
}

// ─── Add a comment (evidence) to an existing Linear issue ────────────────────

export async function addLinearComment(
  accessToken: string,
  issueId: string,
  body: string,
): Promise<void> {
  const ADD_COMMENT = `
    mutation AddComment($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) {
        success
      }
    }
  `
  await linearMutation(accessToken, ADD_COMMENT, { issueId, body })
}

// ─── Fetch issue status (for webhook-less polling fallback) ───────────────────

export async function fetchLinearIssueStatus(
  accessToken: string,
  issueId: string,
): Promise<{ state: string } | null> {
  const GET_ISSUE = `
    query GetIssue($id: String!) {
      issue(id: $id) {
        state { name }
      }
    }
  `
  try {
    const data = await linearMutation<{ issue: { state: { name: string } } | null }>(
      accessToken,
      GET_ISSUE,
      { id: issueId },
    )
    if (!data.issue) return null
    return { state: data.issue.state.name }
  } catch {
    return null
  }
}

// ─── Build the issue body from feedback context ───────────────────────────────

export function buildLinearIssueBody(opts: {
  verbatimText: string
  authorName?: string | null
  customerName?: string | null
  customerTier?: string | null
  arrCents?: number | null
  sourceType: string
  externalUrl?: string | null
  feedbackItemId: string
  appUrl: string
}): string {
  const arr = opts.arrCents ? `$${Math.round(opts.arrCents / 100).toLocaleString()} ARR` : null

  const customerLine = [opts.customerName, opts.customerTier, arr].filter(Boolean).join(" · ")

  return [
    `## Customer Feedback`,
    ``,
    opts.customerName ? `**Customer:** ${customerLine}` : null,
    `**Source:** ${opts.sourceType}`,
    opts.externalUrl ? `**Original:** ${opts.externalUrl}` : null,
    ``,
    `### Verbatim`,
    `> ${opts.verbatimText.replace(/\n/g, "\n> ")}`,
    ``,
    `---`,
    `[View in Voxly](${opts.appUrl}/dashboard/feedback?item=${opts.feedbackItemId})`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n")
}

// ─── ConnectorAdapter (validate only — Linear doesn't produce feedback) ───────

export const linearConnector: ConnectorAdapter = {
  type: SourceType.LINEAR,

  normalize(_raw: unknown, _config: ConnectorConfig): NormalizedFeedback[] {
    return []
  },

  async validate(config: ConnectorConfig) {
    if (!config.accessToken) return { valid: false, error: "Missing Linear access token" }
    try {
      const teams = await fetchLinearTeams(config.accessToken)
      return teams.length > 0 ? { valid: true } : { valid: false, error: "No teams found" }
    } catch (err) {
      return { valid: false, error: String(err) }
    }
  },
}
