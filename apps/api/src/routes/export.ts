/**
 * Notion export — POST /api/workspaces/:workspaceId/export/notion
 *
 * Creates a Notion page per theme (or a single table page) using the
 * Notion API. Requires NOTION_API_KEY env var and the user to have already
 * shared a parent page/database with the integration.
 */
import type { FastifyPluginAsync } from "fastify"
import { requireRole } from "../plugins/auth"
import { audit } from "../lib/audit"

interface NotionRichText {
  type: "text"
  text: { content: string; link?: { url: string } | null }
}

interface NotionBlock {
  object: "block"
  type: string
  [key: string]: unknown
}

function richText(content: string): NotionRichText[] {
  return [{ type: "text", text: { content, link: null } }]
}

function heading2(text: string): NotionBlock {
  return { object: "block", type: "heading_2", heading_2: { rich_text: richText(text) } }
}

function paragraph(text: string): NotionBlock {
  return { object: "block", type: "paragraph", paragraph: { rich_text: richText(text) } }
}

function divider(): NotionBlock {
  return { object: "block", type: "divider", divider: {} }
}

async function notionRequest(
  path: string,
  method: "POST" | "PATCH" | "GET",
  body?: unknown,
): Promise<Response> {
  const apiKey = process.env.NOTION_API_KEY ?? ""
  return fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

const exportRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Export themes to Notion.
   * Body: { parentPageId: string; includeResolved?: boolean }
   * Creates one child page per theme with feedback summary and ARR impact.
   */
  fastify.post<{
    Params: { workspaceId: string }
    Body: { parentPageId: string; includeResolved?: boolean }
  }>(
    "/api/workspaces/:workspaceId/export/notion",
    { preHandler: requireRole("MEMBER") },
    async (request, reply) => {
      if (request.params.workspaceId !== request.workspaceId) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const notionKey = process.env.NOTION_API_KEY
      if (!notionKey) {
        return reply.code(503).send({ error: "Notion integration not configured" })
      }

      const { parentPageId, includeResolved = false } = request.body
      if (!parentPageId) {
        return reply.code(400).send({ error: "parentPageId is required" })
      }

      const wid = request.workspaceId

      // Fetch themes
      const themes = await fastify.prisma.theme.findMany({
        where: {
          workspaceId: wid,
          ...(includeResolved ? {} : { resolvedAt: null }),
        },
        include: {
          _count: { select: { feedbackItems: true } },
        },
        orderBy: { feedbackCount: "desc" },
        take: 50,
      })

      // Fetch linked outcomes per theme
      const themeIds = themes.map((t) => t.id)
      const outcomes = await fastify.prisma.themeOutcome.findMany({
        where: { themeId: { in: themeIds } },
        orderBy: { createdAt: "desc" },
      })
      const outcomesByTheme = new Map<string, typeof outcomes>()
      for (const o of outcomes) {
        const list = outcomesByTheme.get(o.themeId) ?? []
        list.push(o)
        outcomesByTheme.set(o.themeId, list)
      }

      const createdPages: string[] = []

      for (const theme of themes) {
        const themeOutcomes = outcomesByTheme.get(theme.id) ?? []
        const status = theme.resolvedAt ? "Resolved" : "Active"

        const blocks: NotionBlock[] = [
          paragraph(`Status: ${status}   |   Feedback count: ${theme._count.feedbackItems}`),
          divider(),
        ]

        if (theme.summary) {
          blocks.push(heading2("Summary"))
          blocks.push(paragraph(theme.summary))
        }

        if (themeOutcomes.length > 0) {
          blocks.push(heading2("Linked tickets"))
          for (const o of themeOutcomes) {
            blocks.push(paragraph(`• ${o.ticketTitle ?? o.ticketId} — ${o.ticketUrl}`))
          }
        }

        const res = await notionRequest("/pages", "POST", {
          parent: { page_id: parentPageId },
          properties: {
            title: {
              title: richText(theme.name),
            },
          },
          children: blocks,
        })

        if (!res.ok) {
          const body = await res.text()
          fastify.log.error(`Notion page creation failed: ${body}`)
          continue
        }

        const page = (await res.json()) as { id?: string }
        if (page.id) createdPages.push(page.id)
      }

      audit({
        prisma:       fastify.prisma,
        workspaceId:  wid,
        userId:       request.clerkUserId,
        action:       "export.notion",
        resourceType: "workspace",
        resourceId:   wid,
        meta:         { pagesCreated: createdPages.length, parentPageId },
      })

      return { exported: createdPages.length, pageIds: createdPages }
    },
  )
}

export default exportRoutes
