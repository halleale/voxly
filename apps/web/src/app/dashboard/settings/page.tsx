"use client"

import { useState, useEffect } from "react"
import { Globe, Sparkles, X, Plus, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrandProfile {
  brandWebsite: string | null
  brandName: string | null
  brandKeywords: string[]
  brandInferredAt: string | null
}

interface InferResult {
  brandName: string
  keywords: string[]
}

// ─── Keyword chip input ───────────────────────────────────────────────────────

function KeywordChips({
  keywords,
  onChange,
}: {
  keywords: string[]
  onChange: (kw: string[]) => void
}) {
  const [draft, setDraft] = useState("")

  const add = () => {
    const trimmed = draft.trim()
    if (trimmed && !keywords.includes(trimmed)) {
      onChange([...keywords, trimmed])
    }
    setDraft("")
  }

  const remove = (kw: string) => onChange(keywords.filter((k) => k !== kw))

  return (
    <div className="flex flex-wrap gap-1.5 rounded-md border border-border bg-background p-2 min-h-[44px]">
      {keywords.map((kw) => (
        <span
          key={kw}
          className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
        >
          {kw}
          <button
            onClick={() => remove(kw)}
            className="text-primary/60 hover:text-primary"
            aria-label={`Remove ${kw}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault()
            add()
          }
        }}
        onBlur={add}
        placeholder={keywords.length === 0 ? "Type a keyword and press Enter…" : "Add more…"}
        className="flex-1 min-w-[120px] bg-transparent text-xs outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"
// In dev the workspace ID is read from localStorage or a fixed seed value.
const DEV_WORKSPACE = "seed_workspace"

function getWorkspaceId(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("workspaceId") ?? DEV_WORKSPACE
  }
  return DEV_WORKSPACE
}

function authHeaders(): HeadersInit {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("clerk_token") ?? "dev-token"
    const workspaceId = getWorkspaceId()
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-workspace-id": workspaceId,
    }
  }
  return { "Content-Type": "application/json" }
}

export default function SettingsPage() {
  const [saved, setSaved] = useState<BrandProfile | null>(null)
  const [website, setWebsite] = useState("")
  const [brandName, setBrandName] = useState("")
  const [keywords, setKeywords] = useState<string[]>([])

  const [inferring, setInferring] = useState(false)
  const [saving, setSaving] = useState(false)
  const [inferError, setInferError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle")

  // Load existing brand profile on mount
  useEffect(() => {
    const workspaceId = getWorkspaceId()
    fetch(`${API}/api/workspaces/${workspaceId}/brand`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: BrandProfile | null) => {
        if (!data) return
        setSaved(data)
        setWebsite(data.brandWebsite ?? "")
        setBrandName(data.brandName ?? "")
        setKeywords(data.brandKeywords ?? [])
      })
      .catch(() => {/* silently ignore in dev */})
  }, [])

  const handleInfer = async () => {
    if (!website) return
    setInferring(true)
    setInferError(null)
    const workspaceId = getWorkspaceId()
    try {
      const res = await fetch(`${API}/api/workspaces/${workspaceId}/brand/infer`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ website }),
      })
      if (!res.ok) {
        const err = await res.json() as { error?: string }
        throw new Error(err.error ?? "Inference failed")
      }
      const result = await res.json() as InferResult
      setBrandName(result.brandName)
      setKeywords(result.keywords)
    } catch (e) {
      setInferError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setInferring(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveStatus("idle")
    const workspaceId = getWorkspaceId()
    try {
      const res = await fetch(`${API}/api/workspaces/${workspaceId}/brand`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ brandWebsite: website, brandName, brandKeywords: keywords }),
      })
      if (!res.ok) throw new Error("Save failed")
      const updated = await res.json() as BrandProfile
      setSaved(updated)
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch {
      setSaveStatus("error")
    } finally {
      setSaving(false)
    }
  }

  const isDirty =
    website !== (saved?.brandWebsite ?? "") ||
    brandName !== (saved?.brandName ?? "") ||
    JSON.stringify(keywords) !== JSON.stringify(saved?.brandKeywords ?? [])

  return (
    <div className="flex flex-col gap-8 p-6 max-w-2xl">
      <div>
        <h1 className="text-sm font-semibold">Settings</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Manage your workspace preferences.
        </p>
      </div>

      {/* Brand profile section */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Brand profile
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Tell Voxly what brand to listen for. We'll use these keywords when crawling public
            sources like Hacker News, Reddit, and G2.
          </p>
        </div>

        {/* Website URL + infer button */}
        <div>
          <label className="mb-1.5 block text-xs font-medium">Website</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Globe className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="mongodb.com"
                className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleInfer}
              disabled={inferring || !website}
              className="shrink-0 gap-1.5"
            >
              {inferring ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {inferring ? "Analysing…" : "Auto-detect"}
            </Button>
          </div>
          {inferError && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" /> {inferError}
            </p>
          )}
          <p className="mt-1 text-[11px] text-muted-foreground">
            Click <strong>Auto-detect</strong> to scrape your homepage and infer brand keywords automatically.
          </p>
        </div>

        {/* Brand name */}
        <div>
          <label className="mb-1.5 block text-xs font-medium">Brand name</label>
          <input
            type="text"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="MongoDB"
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Keywords */}
        <div>
          <label className="mb-1.5 block text-xs font-medium">
            Search keywords
          </label>
          <KeywordChips keywords={keywords} onChange={setKeywords} />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Include product names, abbreviations, and nicknames. Press{" "}
            <kbd className="rounded border border-border px-1 text-[10px]">Enter</kbd> or{" "}
            <kbd className="rounded border border-border px-1 text-[10px]">,</kbd> to add a keyword.
          </p>
        </div>

        {/* Preview of what will be searched */}
        {keywords.length > 0 && (
          <div className="rounded-md bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Public sources will search for: </span>
            {keywords.map((k, i) => (
              <span key={k}>
                <span className="font-mono text-primary">{k}</span>
                {i < keywords.length - 1 && <span className="mx-1 text-muted-foreground">·</span>}
              </span>
            ))}
          </div>
        )}

        {/* Save row */}
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !isDirty || !brandName}
          >
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              "Save brand profile"
            )}
          </Button>

          {saveStatus === "saved" && (
            <span className="flex items-center gap-1 text-xs text-green-500">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Saved
            </span>
          )}
          {saveStatus === "error" && (
            <span className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              Save failed — try again
            </span>
          )}
        </div>

        {saved?.brandInferredAt && (
          <p className="text-[11px] text-muted-foreground">
            Last updated{" "}
            {new Date(saved.brandInferredAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        )}
      </section>
    </div>
  )
}
