import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { prisma } from "@voxly/db"
import { TrendingUp, DollarSign } from "lucide-react"
import { ThemesList } from "./themes-list"

interface ArrTheme {
  id: string
  name: string
  slug: string
  itemCount: number
  totalArrCents: number
}

async function getArrImpact(workspaceId: string): Promise<ArrTheme[]> {
  const apiBase = process.env.INTERNAL_API_URL ?? "http://localhost:3001"
  try {
    const res = await fetch(
      `${apiBase}/api/workspaces/${workspaceId}/themes/arr-impact?days=30&limit=5`,
      { headers: { "x-workspace-id": workspaceId }, cache: "no-store" },
    )
    if (!res.ok) return []
    const json = (await res.json()) as { data: ArrTheme[] }
    return json.data
  } catch {
    return []
  }
}

export default async function ThemesPage() {
  const { orgId } = await auth()
  if (!orgId) redirect("/onboarding")

  const workspace = await prisma.workspace.findFirst({
    where: { slug: orgId },
    select: { id: true },
  })
  if (!workspace) redirect("/onboarding")

  const [themes, arrThemes] = await Promise.all([
    prisma.theme.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ isSpiking: "desc" }, { resolvedAt: "asc" }, { itemCount: "desc" }],
    }),
    getArrImpact(workspace.id),
  ])

  const spikingCount = themes.filter((t) => t.isSpiking && !t.isProto).length
  const resolvedCount = themes.filter((t) => t.resolvedAt !== null).length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">Themes</h1>
          <p className="text-sm text-muted-foreground">
            {themes.filter((t) => !t.isProto && !t.resolvedAt).length} active ·{" "}
            {resolvedCount > 0 && `${resolvedCount} resolved · `}
            {themes.reduce((s, t) => s + t.itemCount, 0)} total items
          </p>
        </div>
        <div className="flex items-center gap-2">
          {spikingCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-sm font-medium text-orange-700 border border-orange-200">
              <TrendingUp className="h-3.5 w-3.5" />
              {spikingCount} spiking
            </div>
          )}
        </div>
      </div>

      {/* ARR Impact panel */}
      {arrThemes.length > 0 && (
        <div className="border-b border-border px-6 py-4 bg-muted/20">
          <div className="flex items-center gap-1.5 mb-3">
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Top by ARR impact (last 30 days)
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {arrThemes.map((t) => (
              <div
                key={t.id}
                className="shrink-0 rounded-lg border border-border bg-card px-3 py-2 min-w-[140px]"
              >
                <div className="text-xs text-muted-foreground truncate">#{t.slug}</div>
                <div className="text-sm font-medium truncate">{t.name}</div>
                <div className="mt-1 text-xs font-semibold text-emerald-600">
                  ${Math.round(t.totalArrCents / 100).toLocaleString()} ARR
                </div>
                <div className="text-xs text-muted-foreground">{t.itemCount} items</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        <ThemesList
          themes={themes.map((t) => ({
            ...t,
            lastActiveAt: t.lastActiveAt?.toISOString() ?? null,
            createdAt: t.createdAt.toISOString(),
            resolvedAt: t.resolvedAt?.toISOString() ?? null,
          }))}
          workspaceId={workspace.id}
        />
      </div>
    </div>
  )
}
