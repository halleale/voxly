import type { FastifyPluginAsync } from "fastify"
import { MemberRole } from "@voxly/types"
import { requireRole } from "../plugins/roles"
import { writeAudit } from "../plugins/audit"

interface NotionExportBody {
  /** Notion integration token (Bearer) */
  integrationToken: string
  /** Parent page ID or database ID to create the export page under */
  parentPageId: string
}

interface ConfluenceExportBody {
  /** Confluence base URL, e.g. https://myorg.atlassian.net/wiki */
  baseUrl: string
  /** Confluence API token (email:token basic auth) */
  email: string
  apiToken: string
  /** Confluence space key, e.g. "ENG" */
  spaceKey: string
  /** Optional parent page ID */
  parentPageId?: string
}

// ─── Notion helpers ───────────────────────────────────────────────────────────

async function createNotionPage(params: {
  token: string
  parentPageId: string
  title: string
  content: string
}): Promise<{ url: string }> {
  const blocks = paragraphsToNotionBlocks(params.content)

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.token}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify({
      parent: { page_id: params.parentPageId },
      properties: {
        title: { title: [{ text: { content: params.title } }] },
      },
      children: blocks,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Notion API error: ${err}`)
  }

  const data = (await res.json()) as { url: string }
  return { url: data.url }
}

function paragraphsToNotionBlocks(text: string): unknown[] {
  return text.split("\n\n").map((para) => ({
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [{ type: "text", text: { content: para.slice(0, 2000) } }],
    },
  }))
}

// ─── Confluence helpers ────────────────────────────────────────────────────────

async function createConfluencePage(params: {
  baseUrl: string
  email: string
  apiToken: string
  spaceKey: string
  parentPageId?: string
  title: string
  body: string
}): Promise<{ url: string }> {
  const auth = Buffer.from(`${params.email}:${params.apiToken}`).toString("base64")

  const payload: Record<string, unknown> = {
    type: "page",
    title: params.title,
    space: { key: params.spaceKey },
    body: {
      storage: {
        value: `<p>${params.body.replace(/\n/g, "</p><p>")}</p>`,
        representation: "storage",
      },
    },
  }
  if (params.parentPageId) {
    payload["ancestors"] = [{ id: params.parentPageId }]
  }

  const res = await fetch(`${params.baseUrl}/rest/api/content`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Confluence API error: ${err}`)
  }

  const data = (await res.json()) as {
    _links: { base?: string; webui?: string }
    id: string
  }
  const url = data._links.base
    ? `${data._links.base}${data._links.webui ?? ""}`
    : `${params.baseUrl}/pages/${data.id}`

  return { url }
}

// ─── Build export content from a theme ────────────────────────────────────────

async function buildThemeExport(
  prisma: import("@prisma/client").PrismaClient,
  workspaceId: string,
  themeId: string
): Promise<{ title: string; content: string } | null> {
  const theme = await prisma.theme.findUnique({
    where: { id: themeId },
    select: { name: true, description: true, workspaceId: true },
  })
  if (!theme || theme.workspaceId !== workspaceId) return null

  const items = await prisma.feedbackItem.findMany({
    where: { themeId, workspaceId },
    orderBy: { ingestedAt: "desc" },
    take: 20,
    select: {
      verbatimText: true,
      authorName: true,
      sourceType: true,
      publishedAt: true,
      externalUrl: true,
    },
  })

  const lines: string[] = [
    `Theme: ${theme.name}`,
    theme.description ? `\n${theme.description}` : "",
    `\n--- Evidence (${items.length} items) ---`,
  ]

  for (const item of items) {
    const source = item.authorName ? `${item.authorName} via ${item.sourceType}` : item.sourceType
    const date = item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : ""
    lines.push(`\n[${source}${date ? ` · ${date}` : ""}]`)
    lines.push(item.verbatimText.slice(0, 500))
    if (item.externalUrl) lines.push(`Source: ${item.externalUrl}`)
  }

  return { title: `Voxly Theme: ${theme.name}`, content: lines.filter(Boolean).join("\n") }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const exportRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/workspaces/:workspaceId/themes/:themeId/export/notion
  fastify.post<{
    Params: { workspaceId: string; themeId: string }
    Body: NotionExportBody
  }>(
    "/api/workspaces/:workspaceId/themes/:themeId/export/notion",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      if (await requireRole(request, reply, MemberRole.MEMBER)) return

      const { integrationToken, parentPageId } = request.body
      if (!integrationToken || !parentPageId) {
        return reply.code(400).send({ error: "integrationToken and parentPageId are required" })
      }

      const exportData = await buildThemeExport(fastify.prisma, request.params.workspaceId, request.params.themeId)
      if (!exportData) return reply.code(404).send({ error: "Theme not found" })

      try {
        const result = await createNotionPage({
          token: integrationToken,
          parentPageId,
          title: exportData.title,
          content: exportData.content,
        })

        await writeAudit(fastify.prisma, request, {
          entityType: "theme",
          entityId: request.params.themeId,
          action: "THEME_EXPORTED",
          metadata: { destination: "notion", url: result.url },
        })

        return { url: result.url }
      } catch (err) {
        fastify.log.error(err, "Notion export failed")
        return reply.code(502).send({ error: "Notion export failed" })
      }
    }
  )

  // POST /api/workspaces/:workspaceId/themes/:themeId/export/confluence
  fastify.post<{
    Params: { workspaceId: string; themeId: string }
    Body: ConfluenceExportBody
  }>(
    "/api/workspaces/:workspaceId/themes/:themeId/export/confluence",
    async (request, reply) => {
      if (request.workspaceId !== request.params.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      if (await requireRole(request, reply, MemberRole.MEMBER)) return

      const { baseUrl, email, apiToken, spaceKey, parentPageId } = request.body
      if (!baseUrl || !email || !apiToken || !spaceKey) {
        return reply.code(400).send({ error: "baseUrl, email, apiToken, and spaceKey are required" })
      }

      const exportData = await buildThemeExport(fastify.prisma, request.params.workspaceId, request.params.themeId)
      if (!exportData) return reply.code(404).send({ error: "Theme not found" })

      try {
        const result = await createConfluencePage({
          baseUrl,
          email,
          apiToken,
          spaceKey,
          parentPageId,
          title: exportData.title,
          body: exportData.content,
        })

        await writeAudit(fastify.prisma, request, {
          entityType: "theme",
          entityId: request.params.themeId,
          action: "THEME_EXPORTED",
          metadata: { destination: "confluence", url: result.url },
        })

        return { url: result.url }
      } catch (err) {
        fastify.log.error(err, "Confluence export failed")
        return reply.code(502).send({ error: "Confluence export failed" })
      }
    }
  )
}

export default exportRoutes
