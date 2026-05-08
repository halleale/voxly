import type { FastifyPluginAsync } from "fastify"

/**
 * SAML SSO via WorkOS.
 *
 * WorkOS acts as a unified SAML broker — one integration covers Okta, Azure AD,
 * Google Workspace, and any other SAML-compliant IdP.
 *
 * Required env vars:
 *   WORKOS_API_KEY       — from the WorkOS dashboard
 *   WORKOS_CLIENT_ID     — from the WorkOS dashboard
 *   APP_URL              — public base URL of this API (used for redirect)
 *
 * Flow:
 *   1. Client calls GET /auth/sso?domain=acme.com  (or ?connection=<connection_id>)
 *   2. We build a WorkOS authorization URL and redirect the browser there.
 *   3. WorkOS posts back to GET /auth/sso/callback?code=<code>
 *   4. We exchange the code for a profile, upsert the WorkspaceMember, and
 *      redirect to the web app with a session token.
 */

interface WorkOSProfile {
  id: string
  email: string
  firstName?: string
  lastName?: string
  organizationId?: string
  connectionId: string
  rawAttributes: Record<string, unknown>
}

interface WorkOSTokenResponse {
  profile: WorkOSProfile
  accessToken: string
}

async function getAuthorizationUrl(params: {
  apiKey: string
  clientId: string
  redirectUri: string
  domain?: string
  connection?: string
  state?: string
}): Promise<string> {
  const { apiKey, clientId, redirectUri, domain, connection, state } = params

  const body: Record<string, string> = {
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
  }
  if (domain) body["domain"] = domain
  if (connection) body["connection"] = connection
  if (state) body["state"] = state

  const res = await fetch("https://api.workos.com/sso/authorize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`WorkOS authorize failed: ${err}`)
  }

  const data = (await res.json()) as { authorization_url: string }
  return data.authorization_url
}

async function exchangeCode(params: {
  apiKey: string
  clientId: string
  clientSecret: string
  code: string
  redirectUri: string
}): Promise<WorkOSTokenResponse> {
  const res = await fetch("https://api.workos.com/sso/token", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      code: params.code,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`WorkOS token exchange failed: ${err}`)
  }

  return res.json() as Promise<WorkOSTokenResponse>
}

const sso: FastifyPluginAsync = async (fastify) => {
  const WORKOS_API_KEY = process.env.WORKOS_API_KEY ?? ""
  const WORKOS_CLIENT_ID = process.env.WORKOS_CLIENT_ID ?? ""
  const WORKOS_CLIENT_SECRET = process.env.WORKOS_CLIENT_SECRET ?? ""
  const APP_URL = process.env.APP_URL ?? "http://localhost:4000"
  const WEB_URL = process.env.WEB_URL ?? "http://localhost:3000"
  const REDIRECT_URI = `${APP_URL}/auth/sso/callback`

  // GET /auth/sso?domain=acme.com  — initiate SSO
  fastify.get<{ Querystring: { domain?: string; connection?: string; state?: string } }>(
    "/auth/sso",
    { config: { skipAuth: true } },
    async (request, reply) => {
      if (!WORKOS_API_KEY || !WORKOS_CLIENT_ID) {
        return reply.code(503).send({ error: "SSO not configured" })
      }

      const { domain, connection, state } = request.query
      if (!domain && !connection) {
        return reply.code(400).send({ error: "domain or connection is required" })
      }

      try {
        const url = await getAuthorizationUrl({
          apiKey: WORKOS_API_KEY,
          clientId: WORKOS_CLIENT_ID,
          redirectUri: REDIRECT_URI,
          domain,
          connection,
          state,
        })
        return reply.redirect(url)
      } catch (err) {
        fastify.log.error(err, "SSO initiation failed")
        return reply.code(502).send({ error: "Failed to initiate SSO" })
      }
    }
  )

  // GET /auth/sso/callback?code=<code>  — WorkOS posts back here
  fastify.get<{ Querystring: { code?: string; error?: string; error_description?: string } }>(
    "/auth/sso/callback",
    { config: { skipAuth: true } },
    async (request, reply) => {
      const { code, error, error_description } = request.query

      if (error) {
        fastify.log.warn({ error, error_description }, "SSO callback error from IdP")
        return reply.redirect(`${WEB_URL}/login?error=${encodeURIComponent(error_description ?? error)}`)
      }

      if (!code) {
        return reply.redirect(`${WEB_URL}/login?error=missing_code`)
      }

      try {
        const { profile } = await exchangeCode({
          apiKey: WORKOS_API_KEY,
          clientId: WORKOS_CLIENT_ID,
          clientSecret: WORKOS_CLIENT_SECRET,
          code,
          redirectUri: REDIRECT_URI,
        })

        // Upsert the workspace member using the WorkOS organization ID as workspace anchor.
        // In production the org_id → workspace mapping is set up during WorkOS org provisioning.
        if (profile.organizationId) {
          const workspace = await fastify.prisma.workspace.findFirst({
            where: { slug: profile.organizationId },
            select: { id: true },
          })

          if (workspace) {
            await fastify.prisma.workspaceMember.upsert({
              where: {
                workspaceId_clerkUserId: {
                  workspaceId: workspace.id,
                  clerkUserId: `workos_${profile.id}`,
                },
              },
              create: {
                workspaceId: workspace.id,
                clerkUserId: `workos_${profile.id}`,
                email: profile.email,
                name: [profile.firstName, profile.lastName].filter(Boolean).join(" ") || undefined,
                role: "MEMBER",
              },
              update: {
                email: profile.email,
                name: [profile.firstName, profile.lastName].filter(Boolean).join(" ") || undefined,
              },
            })
          }
        }

        // Redirect to the web app — in production include a short-lived session token
        return reply.redirect(
          `${WEB_URL}/auth/sso/complete?` +
          `email=${encodeURIComponent(profile.email)}&` +
          `workos_id=${encodeURIComponent(profile.id)}`
        )
      } catch (err) {
        fastify.log.error(err, "SSO callback processing failed")
        return reply.redirect(`${WEB_URL}/login?error=sso_failed`)
      }
    }
  )

  // GET /api/workspaces/:workspaceId/sso/connections — list SSO connections
  fastify.get<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/sso/connections",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      if (!WORKOS_API_KEY) return { data: [] }

      const workspace = await fastify.prisma.workspace.findUnique({
        where: { id: request.params.workspaceId },
        select: { slug: true },
      })
      if (!workspace) return reply.code(404).send({ error: "Workspace not found" })

      const res = await fetch(
        `https://api.workos.com/connections?organization_id=${encodeURIComponent(workspace.slug)}`,
        { headers: { Authorization: `Bearer ${WORKOS_API_KEY}` } }
      )
      if (!res.ok) return { data: [] }
      const data = (await res.json()) as { data: unknown[] }
      return { data: data.data ?? [] }
    }
  )
}

export default sso
