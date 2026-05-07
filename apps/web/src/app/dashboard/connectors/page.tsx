"use client"

import { useState } from "react"
import {
  Slack,
  MessageCircle,
  HelpCircle,
  Star,
  Headphones,
  MessageSquare,
  Radio,
  Hash,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConnectorType {
  type: string
  name: string
  description: string
  auth: "oauth" | "api_key" | "none"
}

interface Connector {
  id: string
  type: string
  name: string
  enabled: boolean
  status: "ACTIVE" | "ERROR" | "PAUSED" | "PENDING_AUTH"
  itemCount: number
  errorMessage?: string | null
}

// ─── Mocked data for the UI (will be fetched from API when wired up) ─────────

const AVAILABLE_TYPES: ConnectorType[] = [
  { type: "SLACK",    name: "Slack",          description: "Customer messages from selected channels",       auth: "oauth"   },
  { type: "INTERCOM", name: "Intercom",        description: "Support conversations and tickets",             auth: "oauth"   },
  { type: "ZENDESK",  name: "Zendesk",         description: "Support tickets and CSAT scores",               auth: "oauth"   },
  { type: "G2",       name: "G2",              description: "Product reviews",                               auth: "oauth"   },
  { type: "GONG",     name: "Gong",            description: "Feedback extracted from call transcripts",      auth: "oauth"   },
  { type: "CANNY",    name: "Canny",           description: "Feature requests and votes",                    auth: "api_key" },
  { type: "HN",       name: "Hacker News",     description: "Mentions — no auth required",                  auth: "none"    },
  { type: "REDDIT",   name: "Reddit",          description: "Mentions across subreddits",                    auth: "oauth"   },
]

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  SLACK:    Slack,
  INTERCOM: MessageCircle,
  ZENDESK:  HelpCircle,
  G2:       Star,
  GONG:     Headphones,
  CANNY:    MessageSquare,
  HN:       Hash,
  REDDIT:   Radio,
}

const AUTH_LABEL: Record<string, string> = {
  oauth:   "Connect with OAuth",
  api_key: "Enter API key",
  none:    "No auth needed",
}

// ─── Add-connector modal (inline) ─────────────────────────────────────────────

function AddConnectorPanel({
  ct,
  onClose,
  onAdd,
}: {
  ct: ConnectorType
  onClose: () => void
  onAdd: (c: Connector) => void
}) {
  const [name, setName] = useState(ct.name)
  const [token, setToken] = useState("")
  const [channels, setChannels] = useState("")
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    // In production this calls POST /api/workspaces/:workspaceId/connectors
    await new Promise((r) => setTimeout(r, 600))
    const mock: Connector = {
      id: `mock-${Date.now()}`,
      type: ct.type,
      name,
      enabled: true,
      status: token ? "ACTIVE" : "PENDING_AUTH",
      itemCount: 0,
    }
    onAdd(mock)
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
        <h2 className="mb-4 text-sm font-semibold">Connect {ct.name}</h2>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-muted-foreground">Connector name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </label>

        {ct.auth !== "none" && (
          <label className="mb-3 block">
            <span className="mb-1 block text-xs text-muted-foreground">
              {ct.auth === "oauth" ? "Access token" : "API key"}
            </span>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your token here"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
        )}

        {ct.type === "SLACK" && (
          <label className="mb-3 block">
            <span className="mb-1 block text-xs text-muted-foreground">
              Channel allowlist (comma-separated, e.g. #feedback, #support)
            </span>
            <input
              value={channels}
              onChange={(e) => setChannels(e.target.value)}
              placeholder="#feedback, #product"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
        )}

        {ct.type === "HN" && (
          <p className="mb-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Voxly polls Hacker News Algolia API using your product name as a keyword. No auth
            required.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !name}>
            {saving ? "Connecting…" : AUTH_LABEL[ct.auth]}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Connector["status"] }) {
  if (status === "ACTIVE")
    return (
      <span className="flex items-center gap-1 text-xs text-green-500">
        <CheckCircle2 className="h-3.5 w-3.5" /> Active
      </span>
    )
  if (status === "ERROR")
    return (
      <span className="flex items-center gap-1 text-xs text-destructive">
        <AlertCircle className="h-3.5 w-3.5" /> Error
      </span>
    )
  if (status === "PENDING_AUTH")
    return <span className="text-xs text-muted-foreground">Pending auth</span>
  return <span className="text-xs text-muted-foreground">Paused</span>
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConnectorsPage() {
  const [connected, setConnected] = useState<Connector[]>([])
  const [adding, setAdding] = useState<ConnectorType | null>(null)

  const connectedTypes = new Set(connected.map((c) => c.type))

  const toggleEnabled = (id: string) => {
    setConnected((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, enabled: !c.enabled, status: c.enabled ? "PAUSED" : "ACTIVE" } : c
      )
    )
  }

  const remove = (id: string) => setConnected((prev) => prev.filter((c) => c.id !== id))

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-sm font-semibold">Sources</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Connect your feedback sources. Voxly will start ingesting items immediately.
        </p>
      </div>

      {/* Connected connectors */}
      {connected.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Connected
          </h2>
          <div className="flex flex-col gap-2">
            {connected.map((c) => {
              const Icon = TYPE_ICONS[c.type] ?? MessageSquare
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <StatusBadge status={c.status} />
                  </div>
                  <span className="tabular-nums text-xs text-muted-foreground">{c.itemCount} items</span>
                  <button
                    onClick={() => toggleEnabled(c.id)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {c.enabled ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => remove(c.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Available connectors */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Available sources
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {AVAILABLE_TYPES.map((ct) => {
            const Icon = TYPE_ICONS[ct.type] ?? MessageSquare
            const isConnected = connectedTypes.has(ct.type)
            return (
              <div
                key={ct.type}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-4 transition-colors",
                  isConnected
                    ? "border-border bg-muted/40 opacity-60"
                    : "border-border bg-card hover:border-primary/50 cursor-pointer"
                )}
                onClick={() => !isConnected && setAdding(ct)}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{ct.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{ct.description}</p>
                </div>
                {isConnected ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                ) : (
                  <PlusCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </div>
            )
          })}
        </div>
      </section>

      {adding && (
        <AddConnectorPanel
          ct={adding}
          onClose={() => setAdding(null)}
          onAdd={(c) => setConnected((prev) => [...prev, c])}
        />
      )}
    </div>
  )
}
