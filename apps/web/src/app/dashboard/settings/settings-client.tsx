"use client"

import { useState, useEffect } from "react"
import { Key, Users, Shield, Building2, Download } from "lucide-react"
import { cn } from "@/lib/utils"

type MemberRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER"

interface WorkspaceMember {
  id: string
  clerkUserId: string
  email: string
  name: string
  role: MemberRole
  createdAt: string
}

interface WorkspaceSettings {
  id: string
  name: string
  slug: string
  plan: string
  hasApiKey: boolean
  workosConnectionId: string | null
  members: WorkspaceMember[]
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

export function SettingsClient({ workspaceId, memberRole }: { workspaceId: string; memberRole: string }) {
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null)
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [keyLoading, setKeyLoading] = useState(false)
  const [roleUpdating, setRoleUpdating] = useState<string | null>(null)
  const [notionParentId, setNotionParentId] = useState("")
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState("")

  const isAdmin = ["OWNER", "ADMIN"].includes(memberRole)
  const isOwner = memberRole === "OWNER"

  useEffect(() => {
    fetch(`/api/workspaces/${workspaceId}/settings`)
      .then((r) => r.json())
      .then((d) => { setSettings(d as WorkspaceSettings); setLoading(false) })
      .catch(() => setLoading(false))
  }, [workspaceId])

  async function generateApiKey() {
    setKeyLoading(true)
    setApiKey(null)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/api-key`, { method: "POST" })
      const data = (await res.json()) as { key?: string; error?: string }
      if (data.key) {
        setApiKey(data.key)
        setSettings((s) => s ? { ...s, hasApiKey: true } : s)
      }
    } finally {
      setKeyLoading(false)
    }
  }

  async function revokeApiKey() {
    if (!confirm("Revoke the current API key? Any existing integrations using it will stop working.")) return
    setKeyLoading(true)
    try {
      await fetch(`/api/workspaces/${workspaceId}/api-key`, { method: "DELETE" })
      setApiKey(null)
      setSettings((s) => s ? { ...s, hasApiKey: false } : s)
    } finally {
      setKeyLoading(false)
    }
  }

  async function updateMemberRole(memberId: string, role: MemberRole) {
    setRoleUpdating(memberId)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members/${memberId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      })
      if (res.ok) {
        setSettings((s) =>
          s
            ? { ...s, members: s.members.map((m) => (m.id === memberId ? { ...m, role } : m)) }
            : s,
        )
      }
    } finally {
      setRoleUpdating(null)
    }
  }

  async function exportToNotion() {
    if (!notionParentId.trim()) return
    setExporting(true)
    setExportMsg("")
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/export/notion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentPageId: notionParentId.trim() }),
      })
      const data = (await res.json()) as { exported?: number; error?: string }
      if (data.exported !== undefined) {
        setExportMsg(`Exported ${data.exported} themes to Notion.`)
      } else {
        setExportMsg(data.error ?? "Export failed")
      }
    } catch {
      setExportMsg("Export failed")
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!settings) {
    return <div className="p-8 text-sm text-muted-foreground">Failed to load settings.</div>
  }

  return (
    <div className="flex flex-col gap-6 overflow-y-auto p-6 max-w-2xl">
      <h1 className="text-xl font-semibold">Settings</h1>

      {/* Workspace info */}
      <Section title="Workspace" description="Your workspace details.">
        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Name</dt>
            <dd className="font-medium">{settings.name}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Slug</dt>
            <dd className="font-medium">{settings.slug}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Plan</dt>
            <dd>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                {settings.plan}
              </span>
            </dd>
          </div>
        </dl>
      </Section>

      {/* API key */}
      {isAdmin && (
        <Section
          title="Public API key"
          description="Use this key to ingest feedback via the REST API (POST /api/v1/feedback)."
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">
                {settings.hasApiKey ? "An API key is currently active." : "No API key — generate one to get started."}
              </span>
            </div>

            {apiKey && (
              <div className="rounded-md border border-border bg-muted p-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Copy this key now — it won&apos;t be shown again.
                </p>
                <code className="break-all text-xs font-mono">{apiKey}</code>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={generateApiKey}
                disabled={keyLoading}
                className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {settings.hasApiKey ? "Rotate key" : "Generate key"}
              </button>
              {settings.hasApiKey && (
                <button
                  onClick={revokeApiKey}
                  disabled={keyLoading}
                  className="rounded-md border border-destructive/50 px-4 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  Revoke
                </button>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* Members */}
      <Section title="Members" description="Manage workspace access and roles.">
        <div className="flex flex-col divide-y divide-border">
          {settings.members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 py-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {(m.name || m.email)[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.name || m.email}</p>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
              </div>
              {isOwner && m.role !== "OWNER" ? (
                <select
                  value={m.role}
                  disabled={roleUpdating === m.id}
                  onChange={(e) => updateMemberRole(m.id, e.target.value as MemberRole)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                >
                  {(["ADMIN", "MEMBER", "VIEWER"] as MemberRole[]).map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              ) : (
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  m.role === "OWNER" && "bg-primary/10 text-primary",
                  m.role === "ADMIN" && "bg-blue-100 text-blue-700",
                  m.role === "MEMBER" && "bg-muted text-muted-foreground",
                  m.role === "VIEWER" && "bg-muted text-muted-foreground",
                )}>
                  {m.role}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          Invite members via your identity provider or Clerk dashboard.
        </div>
      </Section>

      {/* SSO */}
      <Section
        title="Single Sign-On (SSO)"
        description="Enterprise SAML SSO is managed via WorkOS."
      >
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            {settings.workosConnectionId ? (
              <p>
                SSO is <span className="font-medium text-green-600">active</span>.{" "}
                Connection ID:{" "}
                <code className="text-xs">{settings.workosConnectionId}</code>
              </p>
            ) : (
              <p>
                SSO is not configured. Contact{" "}
                <a href="mailto:support@voxly.io" className="underline">
                  support@voxly.io
                </a>{" "}
                to enable SAML SSO for your workspace.
              </p>
            )}
          </div>
        </div>
      </Section>

      {/* Notion export */}
      <Section
        title="Export to Notion"
        description="Push all active themes as pages into a Notion parent page."
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            Requires a Notion integration token configured in your environment (NOTION_API_KEY).
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Notion parent page ID"
              value={notionParentId}
              onChange={(e) => setNotionParentId(e.target.value)}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={exportToNotion}
              disabled={exporting || !notionParentId.trim()}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {exporting ? "Exporting…" : "Export"}
            </button>
          </div>
          {exportMsg && (
            <p className={cn("text-xs", exportMsg.includes("failed") || exportMsg.includes("error") ? "text-destructive" : "text-green-600")}>
              {exportMsg}
            </p>
          )}
        </div>
      </Section>
    </div>
  )
}
