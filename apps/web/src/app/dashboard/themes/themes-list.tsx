"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { TrendingUp, MoreHorizontal, Pencil, GitMerge, Trash2, Zap, CheckCircle2, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sparkline } from "@/components/ui/sparkline"

interface Theme {
  id: string
  slug: string
  name: string
  description: string | null
  itemCount: number
  isSpiking: boolean
  isProto: boolean
  resolvedAt: string | null
  lastActiveAt: string | null
  createdAt: string
}

interface ThemesListProps {
  themes: Theme[]
  workspaceId: string
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "never"
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return "just now"
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

interface SparkData { date: string; count: number }

function ThemeRow({
  theme,
  workspaceId,
  onAction,
}: {
  theme: Theme
  workspaceId: string
  onAction: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(theme.name)
  const [sparkData, setSparkData] = useState<SparkData[] | null>(null)
  const [sparkLoaded, setSparkLoaded] = useState(false)
  const [linkingOutcome, setLinkingOutcome] = useState(false)
  const [outcomeUrl, setOutcomeUrl] = useState("")
  const [outcomeTitle, setOutcomeTitle] = useState("")

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

  async function loadSparkline() {
    if (sparkLoaded) return
    setSparkLoaded(true)
    try {
      const res = await fetch(
        `${apiBase}/api/workspaces/${workspaceId}/themes/${theme.id}/timeseries?days=30`,
        { credentials: "include" },
      )
      const json = (await res.json()) as { data: SparkData[] }
      setSparkData(json.data ?? [])
    } catch {
      setSparkData([])
    }
  }

  async function handleRename() {
    if (!editName.trim()) return
    await fetch(`${apiBase}/api/workspaces/${workspaceId}/themes/${theme.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: editName.trim() }),
    })
    setEditing(false)
    onAction()
  }

  async function handleDelete() {
    if (!confirm("Delete this theme? Feedback items will be unassigned.")) return
    await fetch(`${apiBase}/api/workspaces/${workspaceId}/themes/${theme.id}`, {
      method: "DELETE",
      credentials: "include",
    })
    onAction()
  }

  async function handleResolve() {
    if (!confirm(`Mark "${theme.name}" as resolved? All open items will transition to Resolved.`)) return
    await fetch(`${apiBase}/api/workspaces/${workspaceId}/themes/${theme.id}/resolve`, {
      method: "POST",
      credentials: "include",
    })
    onAction()
  }

  async function handleLinkOutcome() {
    if (!outcomeUrl.trim()) return
    const isLinear = outcomeUrl.includes("linear.app")
    const isJira = outcomeUrl.includes("atlassian.net") || outcomeUrl.includes("jira")
    const provider = isLinear ? "LINEAR" : isJira ? "JIRA" : "LINEAR"

    // Extract ticket ID from URL
    const ticketIdMatch = outcomeUrl.match(/[A-Z]+-\d+|[a-z]+-\d+/)
    const ticketId = ticketIdMatch?.[0] ?? outcomeUrl

    await fetch(`${apiBase}/api/workspaces/${workspaceId}/themes/${theme.id}/outcome`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ provider, ticketId, ticketUrl: outcomeUrl, ticketTitle: outcomeTitle || undefined }),
    })
    setLinkingOutcome(false)
    setOutcomeUrl("")
    setOutcomeTitle("")
    onAction()
  }

  const isResolved = !!theme.resolvedAt

  if (linkingOutcome) {
    return (
      <div className="px-4 py-3 space-y-2 bg-muted/30">
        <p className="text-xs font-medium">Link a shipped ticket to #{theme.slug}</p>
        <input
          autoFocus
          className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
          placeholder="Linear or Jira ticket URL"
          value={outcomeUrl}
          onChange={(e) => setOutcomeUrl(e.target.value)}
        />
        <input
          className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
          placeholder="Title (optional)"
          value={outcomeTitle}
          onChange={(e) => setOutcomeTitle(e.target.value)}
        />
        <div className="flex gap-2">
          <Button size="sm" className="h-7 px-3 text-xs" onClick={handleLinkOutcome}>Link</Button>
          <button className="text-xs text-muted-foreground" onClick={() => setLinkingOutcome(false)}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 group"
      onMouseEnter={loadSparkline}
    >
      {/* Spike / resolved indicator */}
      {isResolved ? (
        <span title="Resolved">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
        </span>
      ) : theme.isSpiking ? (
        <span title="Spiking — 2× recent volume">
          <TrendingUp className="h-4 w-4 text-orange-500 shrink-0" />
        </span>
      ) : (
        <div className="h-4 w-4 shrink-0" />
      )}

      {/* Name / inline edit */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <form onSubmit={(e) => { e.preventDefault(); handleRename() }} className="flex items-center gap-2">
            <input
              autoFocus
              className="flex-1 rounded border border-border bg-background px-2 py-0.5 text-sm"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
            />
            <Button type="submit" size="sm" className="h-6 px-2 text-xs">Save</Button>
            <button type="button" className="text-xs text-muted-foreground" onClick={() => setEditing(false)}>Cancel</button>
          </form>
        ) : (
          <div>
            <span className="text-xs text-muted-foreground">#{theme.slug}</span>
            <span className={`ml-2 text-sm font-medium ${isResolved ? "line-through text-muted-foreground" : ""}`}>
              {theme.name}
            </span>
            {isResolved && (
              <span className="ml-2 text-xs text-emerald-600">resolved {timeAgo(theme.resolvedAt)}</span>
            )}
            {theme.description && !isResolved && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{theme.description}</p>
            )}
          </div>
        )}
      </div>

      {/* Sparkline */}
      {!editing && (
        <div className="shrink-0 text-primary/70">
          {sparkData && sparkData.length >= 2 ? (
            <Sparkline data={sparkData} width={80} height={24} color="hsl(var(--primary))" />
          ) : (
            <div className="w-20 h-6" />
          )}
        </div>
      )}

      {/* Meta */}
      {!editing && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
          <span>{theme.itemCount} items</span>
          <span>{timeAgo(theme.lastActiveAt)}</span>
        </div>
      )}

      {/* Actions menu */}
      {!editing && (
        <div className="relative shrink-0">
          <button
            className="rounded p-1 hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-8 z-50 w-44 rounded-lg border border-border bg-card shadow-md text-sm"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <button
                className="flex w-full items-center gap-2 px-3 py-2 hover:bg-muted"
                onClick={() => { setEditing(true); setEditName(theme.name); setMenuOpen(false) }}
              >
                <Pencil className="h-3.5 w-3.5" /> Rename
              </button>
              {!isResolved && (
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 hover:bg-muted text-emerald-700"
                  onClick={() => { setMenuOpen(false); handleResolve() }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Mark resolved
                </button>
              )}
              <button
                className="flex w-full items-center gap-2 px-3 py-2 hover:bg-muted"
                onClick={() => { setMenuOpen(false); setLinkingOutcome(true) }}
              >
                <Link2 className="h-3.5 w-3.5" /> Link shipped ticket
              </button>
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-destructive hover:bg-muted"
                onClick={() => { setMenuOpen(false); handleDelete() }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ThemesList({ themes, workspaceId }: ThemesListProps) {
  const router = useRouter()
  const [mergeState, setMergeState] = useState<{ sourceId: string; sourceName: string } | null>(null)

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

  async function handleMerge(targetThemeId: string) {
    if (!mergeState) return
    await fetch(`${apiBase}/api/workspaces/${workspaceId}/themes/${mergeState.sourceId}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ targetThemeId }),
    })
    setMergeState(null)
    router.refresh()
  }

  const stableActive   = themes.filter((t) => !t.isProto && !t.resolvedAt)
  const stableResolved = themes.filter((t) => !t.isProto && t.resolvedAt)
  const protoThemes    = themes.filter((t) => t.isProto)

  if (mergeState) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>Merge "{mergeState.sourceName}"</strong> into which theme?
          <button className="ml-3 underline" onClick={() => setMergeState(null)}>Cancel</button>
        </div>
        <div className="divide-y divide-border rounded-lg border border-border">
          {stableActive
            .filter((t) => t.id !== mergeState.sourceId)
            .map((theme) => (
              <button
                key={theme.id}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 text-sm"
                onClick={() => handleMerge(theme.id)}
              >
                <span className="text-muted-foreground">#{theme.slug}</span>
                <span className="font-medium">{theme.name}</span>
                <span className="ml-auto text-muted-foreground">{theme.itemCount} items</span>
              </button>
            ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Active themes */}
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground px-1">
          Themes ({stableActive.length})
        </h2>
        {stableActive.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No themes yet. Run the nightly clustering job or wait for items to accumulate.
          </div>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {stableActive.map((theme) => (
              <ThemeRow
                key={theme.id}
                theme={theme}
                workspaceId={workspaceId}
                onAction={() => router.refresh()}
              />
            ))}
          </div>
        )}
      </div>

      {/* Resolved themes */}
      {stableResolved.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground px-1">
            Resolved ({stableResolved.length})
          </h2>
          <div className="divide-y divide-border rounded-lg border border-border opacity-60">
            {stableResolved.map((theme) => (
              <ThemeRow
                key={theme.id}
                theme={theme}
                workspaceId={workspaceId}
                onAction={() => router.refresh()}
              />
            ))}
          </div>
        </div>
      )}

      {/* Proto-themes */}
      {protoThemes.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground px-1">
            Unresolved ({protoThemes.length})
            <span className="ml-1 font-normal normal-case">— will be clustered tonight</span>
          </h2>
          <div className="divide-y divide-border rounded-lg border border-border opacity-60">
            {protoThemes.map((theme) => (
              <div key={theme.id} className="flex items-center gap-3 px-4 py-2.5">
                <Zap className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate text-sm text-muted-foreground">{theme.name}</span>
                <span className="text-xs text-muted-foreground">{timeAgo(theme.lastActiveAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
