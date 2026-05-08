"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { GitBranch, Plus, Play, Pause, Trash2, AlertTriangle, TrendingUp, UserCheck, CalendarDays, Bug, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { WORKFLOW_TEMPLATES } from "@/lib/workflow-templates"

type WorkflowRow = {
  id: string
  name: string
  isActive: boolean
  runCount: number
  lastRunAt: string | null
  createdAt: string
  _count: { runs: number }
}

const TEMPLATE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  AlertTriangle,
  Bug,
  TrendingUp,
  UserCheck,
  CalendarDays,
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Never"
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function WorkflowList({ workflows, workspaceId }: { workflows: WorkflowRow[]; workspaceId: string }) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [showTemplates, setShowTemplates] = useState(workflows.length === 0)
  const [loading, setLoading] = useState<Record<string, boolean>>({})

  async function createBlank() {
    setCreating(true)
    try {
      const res = await fetch(`/api/workflows?workspaceId=${workspaceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Untitled workflow" }),
      })
      if (!res.ok) throw new Error("Failed to create workflow")
      const wf = (await res.json()) as { id: string }
      router.push(`/dashboard/workflows/${wf.id}`)
    } catch {
      setCreating(false)
    }
  }

  async function createFromTemplate(templateId: string) {
    const template = WORKFLOW_TEMPLATES.find((t) => t.id === templateId)
    if (!template) return
    setLoading((l) => ({ ...l, [templateId]: true }))
    try {
      const res = await fetch(`/api/workflows?workspaceId=${workspaceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: template.name, graphJson: template.graph }),
      })
      if (!res.ok) throw new Error("Failed to create workflow")
      const wf = (await res.json()) as { id: string }
      router.push(`/dashboard/workflows/${wf.id}`)
    } catch {
      setLoading((l) => ({ ...l, [templateId]: false }))
    }
  }

  async function toggleActive(wf: WorkflowRow) {
    setLoading((l) => ({ ...l, [wf.id]: true }))
    await fetch(`/api/workflows/${wf.id}?workspaceId=${workspaceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !wf.isActive }),
    })
    router.refresh()
    setLoading((l) => ({ ...l, [wf.id]: false }))
  }

  async function deleteWorkflow(wfId: string) {
    if (!confirm("Delete this workflow?")) return
    setLoading((l) => ({ ...l, [wfId]: true }))
    await fetch(`/api/workflows/${wfId}?workspaceId=${workspaceId}`, { method: "DELETE" })
    router.refresh()
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Action bar */}
      <div className="flex items-center gap-3">
        <button
          onClick={createBlank}
          disabled={creating}
          className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {creating ? "Creating…" : "New workflow"}
        </button>
        <button
          onClick={() => setShowTemplates((s) => !s)}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Templates
        </button>
      </div>

      {/* Template gallery */}
      {showTemplates && (
        <div>
          <p className="mb-3 text-sm font-medium text-muted-foreground">Starter templates</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {WORKFLOW_TEMPLATES.map((tpl) => {
              const Icon = TEMPLATE_ICONS[tpl.icon] ?? GitBranch
              return (
                <button
                  key={tpl.id}
                  onClick={() => createFromTemplate(tpl.id)}
                  disabled={loading[tpl.id]}
                  className="group flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-left hover:border-primary/40 hover:shadow-sm disabled:opacity-50 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-medium">{tpl.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{tpl.description}</p>
                  <span className="mt-auto text-xs font-medium text-primary group-hover:underline">
                    {loading[tpl.id] ? "Creating…" : "Use template →"}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Workflow list */}
      {workflows.length === 0 && !showTemplates ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
          <GitBranch className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">No workflows yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Create one from scratch or use a template above</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Runs</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Last run</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {workflows.map((wf) => (
                <tr
                  key={wf.id}
                  onClick={() => router.push(`/dashboard/workflows/${wf.id}`)}
                  className="cursor-pointer hover:bg-muted/40 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="font-medium">{wf.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                        wf.isActive
                          ? "bg-green-50 text-green-700 border border-green-200"
                          : "bg-muted text-muted-foreground border border-border",
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", wf.isActive ? "bg-green-500" : "bg-muted-foreground")} />
                      {wf.isActive ? "Active" : "Paused"}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{wf.runCount}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {relativeTime(wf.lastRunAt)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => toggleActive(wf)}
                        disabled={loading[wf.id]}
                        title={wf.isActive ? "Pause" : "Activate"}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                      >
                        {wf.isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => deleteWorkflow(wf.id)}
                        disabled={loading[wf.id]}
                        title="Delete"
                        className="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
