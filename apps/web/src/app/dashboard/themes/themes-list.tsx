"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { TrendingUp, MoreHorizontal, Pencil, GitMerge, Trash2, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface Theme {
  id: string
  slug: string
  name: string
  description: string | null
  itemCount: number
  isSpiking: boolean
  isProto: boolean
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

export function ThemesList({ themes, workspaceId }: ThemesListProps) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [mergeState, setMergeState] = useState<{ sourceId: string; sourceName: string } | null>(null)

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

  async function handleRename(themeId: string) {
    if (!editName.trim()) return
    await fetch(`${apiBase}/api/workspaces/${workspaceId}/themes/${themeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: editName.trim() }),
    })
    setEditingId(null)
    router.refresh()
  }

  async function handleDelete(themeId: string) {
    if (!confirm("Delete this theme? Feedback items will be unassigned.")) return
    await fetch(`${apiBase}/api/workspaces/${workspaceId}/themes/${themeId}`, {
      method: "DELETE",
      credentials: "include",
    })
    router.refresh()
  }

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

  const stableThemes = themes.filter((t) => !t.isProto)
  const protoThemes  = themes.filter((t) => t.isProto)

  if (mergeState) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>Merge "{mergeState.sourceName}"</strong> into which theme? All its feedback items will move to the target.
          <button
            className="ml-3 underline"
            onClick={() => setMergeState(null)}
          >
            Cancel
          </button>
        </div>
        <div className="divide-y divide-border rounded-lg border border-border">
          {stableThemes
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
      {/* Stable themes */}
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground px-1">
          Themes ({stableThemes.length})
        </h2>
        {stableThemes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No themes yet. Run the nightly clustering job or wait for items to accumulate.
          </div>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {stableThemes.map((theme) => (
              <div key={theme.id} className="flex items-center gap-3 px-4 py-3">
                {/* Spike indicator */}
                {theme.isSpiking && (
                  <span title="Spiking — 2× recent volume">
                    <TrendingUp className="h-4 w-4 text-orange-500 shrink-0" />
                  </span>
                )}

                {/* Name / inline edit */}
                <div className="flex-1 min-w-0">
                  {editingId === theme.id ? (
                    <form
                      onSubmit={(e) => { e.preventDefault(); handleRename(theme.id) }}
                      className="flex items-center gap-2"
                    >
                      <input
                        autoFocus
                        className="flex-1 rounded border border-border bg-background px-2 py-0.5 text-sm"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === "Escape" && setEditingId(null)}
                      />
                      <Button type="submit" size="sm" className="h-6 px-2 text-xs">Save</Button>
                      <button type="button" className="text-xs text-muted-foreground" onClick={() => setEditingId(null)}>Cancel</button>
                    </form>
                  ) : (
                    <div>
                      <span className="text-xs text-muted-foreground">#{theme.slug}</span>
                      <span className="ml-2 text-sm font-medium">{theme.name}</span>
                      {theme.description && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{theme.description}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Meta */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                  <span>{theme.itemCount} items</span>
                  <span>{timeAgo(theme.lastActiveAt)}</span>
                </div>

                {/* Actions menu */}
                {editingId !== theme.id && (
                  <div className="relative shrink-0">
                    <button
                      className="rounded p-1 hover:bg-muted"
                      onClick={() => setMenuOpenId(menuOpenId === theme.id ? null : theme.id)}
                    >
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                    </button>
                    {menuOpenId === theme.id && (
                      <div
                        className="absolute right-0 top-8 z-50 w-40 rounded-lg border border-border bg-card shadow-md text-sm"
                        onMouseLeave={() => setMenuOpenId(null)}
                      >
                        <button
                          className="flex w-full items-center gap-2 px-3 py-2 hover:bg-muted"
                          onClick={() => { setEditingId(theme.id); setEditName(theme.name); setMenuOpenId(null) }}
                        >
                          <Pencil className="h-3.5 w-3.5" /> Rename
                        </button>
                        <button
                          className="flex w-full items-center gap-2 px-3 py-2 hover:bg-muted"
                          onClick={() => { setMergeState({ sourceId: theme.id, sourceName: theme.name }); setMenuOpenId(null) }}
                        >
                          <GitMerge className="h-3.5 w-3.5" /> Merge into…
                        </button>
                        <button
                          className="flex w-full items-center gap-2 px-3 py-2 text-destructive hover:bg-muted"
                          onClick={() => { setMenuOpenId(null); handleDelete(theme.id) }}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

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
