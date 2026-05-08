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

  const themes = await prisma.theme.findMany({
    where: { workspaceId: workspace.id },
    orderBy: [{ isSpiking: "desc" }, { itemCount: "desc" }],
  })

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
          }))}
          workspaceId={workspace.id}
        />
      </div>
    </div>
  )
}
