export const dynamic = 'force-dynamic'

import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { prisma } from "@voxly/db"
import { TrendingUp } from "lucide-react"
import { ThemesList } from "./themes-list"

export default async function ThemesPage() {
  const { orgId } = await auth()
  if (!orgId) redirect("/onboarding")

  const workspace = await prisma.workspace.findFirst({
    where: { slug: orgId },
    select: { id: true },
  })
  if (!workspace) redirect("/onboarding")

  const since28d = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000)

  const [themes, recentItems] = await Promise.all([
    prisma.theme.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ isSpiking: "desc" }, { itemCount: "desc" }],
    }),
    prisma.feedbackItem.findMany({
      where: { workspaceId: workspace.id, themeId: { not: null }, ingestedAt: { gte: since28d } },
      select: { themeId: true, ingestedAt: true },
    }),
  ])

  // Build sparkline counts per theme (last 28 days bucketed by day)
  const dateLabels: string[] = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(Date.now() - (27 - i) * 24 * 60 * 60 * 1000)
    return d.toISOString().slice(0, 10)
  })
  const sparklineMap = new Map<string, number[]>()
  for (const item of recentItems) {
    const tid = item.themeId!
    const date = item.ingestedAt.toISOString().slice(0, 10)
    if (!sparklineMap.has(tid)) sparklineMap.set(tid, new Array(28).fill(0))
    const idx = dateLabels.indexOf(date)
    const arr = sparklineMap.get(tid)
    if (idx >= 0 && arr) arr[idx] = (arr[idx] ?? 0) + 1
  }

  const spikingCount = themes.filter((t) => t.isSpiking && !t.isProto).length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">Themes</h1>
          <p className="text-sm text-muted-foreground">
            {themes.filter((t) => !t.isProto).length} active themes ·{" "}
            {themes.reduce((s, t) => s + t.itemCount, 0)} total items
          </p>
        </div>
        {spikingCount > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-sm font-medium text-orange-700 border border-orange-200">
            <TrendingUp className="h-3.5 w-3.5" />
            {spikingCount} spiking
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        <ThemesList
          themes={themes.map((t) => ({
            ...t,
            lastActiveAt: t.lastActiveAt?.toISOString() ?? null,
            createdAt: t.createdAt.toISOString(),
            sparkline: sparklineMap.get(t.id) ?? new Array(28).fill(0),
          }))}
          workspaceId={workspace.id}
        />
      </div>
    </div>
  )
}
