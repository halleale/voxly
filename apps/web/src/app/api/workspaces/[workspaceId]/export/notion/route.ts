import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@voxly/db"

const SKIP_AUTH = process.env.SKIP_AUTH === "true"
const DEV_CLERK_USER_ID = "seed_owner"

interface NotionRichText {
  type: "text"
  text: { content: string; link: null }
}

function richText(content: string): NotionRichText[] {
  return [{ type: "text", text: { content, link: null } }]
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const clerkUserId = SKIP_AUTH ? DEV_CLERK_USER_ID : (await auth()).userId
  if (!clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { workspaceId } = await context.params

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_clerkUserId: { workspaceId, clerkUserId } },
    select: { role: true },
  })
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const notionKey = process.env.NOTION_API_KEY
  if (!notionKey) return NextResponse.json({ error: "Notion integration not configured" }, { status: 503 })

  const { parentPageId, includeResolved = false } = (await request.json()) as {
    parentPageId?: string
    includeResolved?: boolean
  }
  if (!parentPageId) return NextResponse.json({ error: "parentPageId required" }, { status: 400 })

  const themes = await prisma.theme.findMany({
    where: { workspaceId, ...(includeResolved ? {} : { resolvedAt: null }) },
    include: { _count: { select: { feedbackItems: true } } },
    orderBy: { feedbackCount: "desc" },
    take: 50,
  })

  const outcomes = await prisma.themeOutcome.findMany({
    where: { themeId: { in: themes.map((t) => t.id) } },
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

    const blocks: object[] = [
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: richText(
            `Status: ${theme.resolvedAt ? "Resolved" : "Active"}  |  Feedback: ${theme._count.feedbackItems}`,
          ),
        },
      },
      { object: "block", type: "divider", divider: {} },
    ]

    if (theme.summary) {
      blocks.push(
        { object: "block", type: "heading_2", heading_2: { rich_text: richText("Summary") } },
        { object: "block", type: "paragraph", paragraph: { rich_text: richText(theme.summary) } },
      )
    }

    if (themeOutcomes.length > 0) {
      blocks.push(
        { object: "block", type: "heading_2", heading_2: { rich_text: richText("Linked tickets") } },
        ...themeOutcomes.map((o) => ({
          object: "block",
          type: "bulleted_list_item",
          bulleted_list_item: {
            rich_text: [{ type: "text", text: { content: o.ticketTitle ?? o.ticketId, link: o.ticketUrl ? { url: o.ticketUrl } : null } }],
          },
        })),
      )
    }

    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${notionKey}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        parent: { page_id: parentPageId },
        properties: { title: { title: richText(theme.name) } },
        children: blocks,
      }),
    })

    if (res.ok) {
      const page = (await res.json()) as { id?: string }
      if (page.id) createdPages.push(page.id)
    }
  }

  return NextResponse.json({ exported: createdPages.length, pageIds: createdPages })
}
