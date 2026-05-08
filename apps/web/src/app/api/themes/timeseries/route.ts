import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@voxly/db"

const SKIP_AUTH = process.env.SKIP_AUTH === "true"
const DEV_CLERK_USER_ID = "seed_owner"

export async function GET(req: NextRequest) {
  const clerkUserId = SKIP_AUTH
    ? DEV_CLERK_USER_ID
    : (await auth()).userId

  if (!clerkUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const workspaceId = req.nextUrl.searchParams.get("workspaceId")
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 })
  }

  const days = Math.min(parseInt(req.nextUrl.searchParams.get("days") ?? "28", 10), 90)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  // Fetch all feedback items with a theme, grouped by theme + ingestedAt date
  const items = await prisma.feedbackItem.findMany({
    where: {
      workspaceId,
      themeId: { not: null },
      ingestedAt: { gte: since },
    },
    select: { themeId: true, ingestedAt: true },
  })

  // Build date range (last N days)
  const dateLabels: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    dateLabels.push(d.toISOString().slice(0, 10))
  }

  // Group counts by themeId → date
  const byTheme = new Map<string, Map<string, number>>()
  for (const item of items) {
    const themeId = item.themeId!
    const date = item.ingestedAt.toISOString().slice(0, 10)
    if (!byTheme.has(themeId)) byTheme.set(themeId, new Map())
    const dateMap = byTheme.get(themeId)!
    dateMap.set(date, (dateMap.get(date) ?? 0) + 1)
  }

  const result = Array.from(byTheme.entries()).map(([themeId, dateMap]) => ({
    themeId,
    dates: dateLabels,
    counts: dateLabels.map((d) => dateMap.get(d) ?? 0),
  }))

  return NextResponse.json(result)
}
