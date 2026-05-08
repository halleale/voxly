"use client"

import { useState } from "react"
import {
  TrendingUp,
  Hash,
  MoreHorizontal,
  Pencil,
  Merge,
  Trash2,
  Check,
  X,
  Flame,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Theme {
  id: string
  slug: string
  name: string
  description: string | null
  itemCount: number
  isSpiking: boolean
  lastActiveAt: string | null
  createdAt: string
}

// ─── Seed data ────────────────────────────────────────────────────────────────

const SEED_THEMES: Theme[] = [
  {
    id: "t1",
    slug: "mobile-app-sync",
    name: "Mobile App Sync",
    description: "Issues with syncing data between mobile devices",
    itemCount: 24,
    isSpiking: true,
    lastActiveAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: "t2",
    slug: "pdf-export-crashes",
    name: "PDF Export Crashes",
    description: "Application crashes or errors during PDF export",
    itemCount: 18,
    isSpiking: false,
    lastActiveAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 25 * 86400000).toISOString(),
  },
  {
    id: "t3",
    slug: "onboarding-too-long",
    name: "Onboarding Too Long",
    description: "Users find the onboarding flow overwhelming or time-consuming",
    itemCount: 15,
    isSpiking: false,
    lastActiveAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
  },
  {
    id: "t4",
    slug: "api-rate-limits",
    name: "API Rate Limits",
    description: "Enterprise customers hitting API rate limits",
    itemCount: 12,
    isSpiking: true,
    lastActiveAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 15 * 86400000).toISOString(),
  },
  {
    id: "t5",
    slug: "dark-mode",
    name: "Dark Mode",
    description: "Requests for dark mode support",
    itemCount: 9,
    isSpiking: false,
    lastActiveAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 45 * 86400000).toISOString(),
  },
  {
    id: "t6",
    slug: "bulk-export-csv",
    name: "Bulk CSV Export",
    description: "Requests for bulk data export as CSV",
    itemCount: 7,
    isSpiking: false,
    lastActiveAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
]

// ─── Inline rename form ───────────────────────────────────────────────────────

function RenameInline({
  theme,
  onSave,
  onCancel,
}: {
  theme: Theme
  onSave: (name: string, slug: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(theme.name)
  const slugify = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

  return (
    <div className="flex items-center gap-2 flex-1">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        className="w-full max-w-xs rounded border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave(name, slugify(name))
          if (e.key === "Escape") onCancel()
        }}
      />
      <button onClick={() => onSave(name, slugify(name))} className="text-green-500 hover:text-green-600">
        <Check className="h-4 w-4" />
      </button>
      <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

// ─── Theme row ────────────────────────────────────────────────────────────────

function ThemeRow({
  theme,
  themes,
  onRename,
  onMerge,
  onDelete,
}: {
  theme: Theme
  themes: Theme[]
  onRename: (id: string, name: string, slug: string) => void
  onMerge: (targetId: string, sourceId: string) => void
  onDelete: (id: string) => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mergePickerOpen, setMergePickerOpen] = useState(false)

  const lastActive = theme.lastActiveAt
    ? Math.round((Date.now() - new Date(theme.lastActiveAt).getTime()) / (60 * 1000))
    : null

  const lastActiveLabel =
    lastActive === null
      ? "—"
      : lastActive < 60
      ? `${lastActive}m ago`
      : lastActive < 1440
      ? `${Math.round(lastActive / 60)}h ago`
      : `${Math.round(lastActive / 1440)}d ago`

  return (
    <div
      className={cn(
        "group flex items-center gap-4 rounded-lg border px-4 py-3 transition-colors",
        theme.isSpiking ? "border-amber-200 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/10" : "border-border bg-card"
      )}
    >
      {/* Theme name + spike indicator */}
      {renaming ? (
        <RenameInline
          theme={theme}
          onSave={(name, slug) => {
            onRename(theme.id, name, slug)
            setRenaming(false)
          }}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <div className="flex flex-1 items-center gap-2 min-w-0">
          {theme.isSpiking && (
            <Flame className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Spiking" />
          )}
          <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <span className="text-sm font-medium">{theme.name}</span>
            <span className="ml-2 text-xs text-muted-foreground">{theme.slug}</span>
          </div>
          {theme.description && (
            <span className="hidden text-xs text-muted-foreground truncate lg:block ml-2">
              {theme.description}
            </span>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="flex shrink-0 items-center gap-6 text-xs text-muted-foreground">
        <span className="w-16 text-right tabular-nums font-medium text-foreground">
          {theme.itemCount} items
        </span>
        <span className="w-20 text-right">{lastActiveLabel}</span>
      </div>

      {/* Actions */}
      <div className="relative shrink-0">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-opacity"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full z-20 mt-1 min-w-36 rounded-lg border border-border bg-card shadow-md">
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-muted"
                onClick={() => { setRenaming(true); setMenuOpen(false) }}
              >
                <Pencil className="h-3.5 w-3.5" /> Rename
              </button>
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-muted"
                onClick={() => { setMergePickerOpen(true); setMenuOpen(false) }}
              >
                <Merge className="h-3.5 w-3.5" /> Merge into…
              </button>
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-muted"
                onClick={() => { onDelete(theme.id); setMenuOpen(false) }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Archive
              </button>
            </div>
          </>
        )}

        {mergePickerOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMergePickerOpen(false)} />
            <div className="absolute right-0 top-full z-20 mt-1 min-w-48 rounded-lg border border-border bg-card shadow-md">
              <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Merge {theme.name} into:
              </p>
              {themes
                .filter((t) => t.id !== theme.id)
                .map((t) => (
                  <button
                    key={t.id}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-muted"
                    onClick={() => {
                      onMerge(t.id, theme.id)
                      setMergePickerOpen(false)
                    }}
                  >
                    <Hash className="h-3 w-3 text-muted-foreground" />
                    {t.name}
                  </button>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ThemesPage() {
  const [themes, setThemes] = useState<Theme[]>(SEED_THEMES)

  const spiking = themes.filter((t) => t.isSpiking)
  const normal = themes.filter((t) => !t.isSpiking)

  const handleRename = (id: string, name: string, slug: string) => {
    setThemes((prev) => prev.map((t) => (t.id === id ? { ...t, name, slug } : t)))
  }

  const handleMerge = (targetId: string, sourceId: string) => {
    setThemes((prev) => {
      const source = prev.find((t) => t.id === sourceId)
      const target = prev.find((t) => t.id === targetId)
      if (!source || !target) return prev
      return prev
        .filter((t) => t.id !== sourceId)
        .map((t) =>
          t.id === targetId ? { ...t, itemCount: t.itemCount + source.itemCount } : t
        )
    })
  }

  const handleDelete = (id: string) => setThemes((prev) => prev.filter((t) => t.id !== id))

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold">Themes</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            AI-clustered topics from your feedback. Updated nightly.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">{themes.length} themes</span>
      </div>

      {spiking.length > 0 && (
        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-amber-500" />
            <h2 className="text-xs font-semibold uppercase tracking-widest text-amber-600">
              Spiking
            </h2>
            <Badge className="ml-1 bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0 border-amber-200">
              {spiking.length}
            </Badge>
          </div>
          <div className="flex flex-col gap-2">
            {spiking.map((t) => (
              <ThemeRow
                key={t.id}
                theme={t}
                themes={themes}
                onRename={handleRename}
                onMerge={handleMerge}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        {spiking.length > 0 && (
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            All themes
          </h2>
        )}
        <div className="flex flex-col gap-2">
          {normal.map((t) => (
            <ThemeRow
              key={t.id}
              theme={t}
              themes={themes}
              onRename={handleRename}
              onMerge={handleMerge}
              onDelete={handleDelete}
            />
          ))}
          {normal.length === 0 && themes.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
              <Hash className="mb-2 h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium">No themes yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Themes are generated nightly once feedback starts flowing in.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
