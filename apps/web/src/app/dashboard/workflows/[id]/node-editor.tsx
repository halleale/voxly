"use client"

import { useState } from "react"
import type { Node } from "@xyflow/react"
import { Trash2, Plus, X, CheckCircle2, XCircle, SkipForward } from "lucide-react"
import type { FilterClause, FilterOperator } from "@voxly/types"

type StepResult = { nodeType: string; result: "pass" | "fail" | "skip"; detail?: unknown } | null

interface NodeEditorProps {
  node: Node
  members: Array<{ id: string; clerkUserId: string; role: string }>
  onUpdate: (data: Record<string, unknown>) => void
  onDelete: () => void
  testResult: StepResult
}

const FILTER_FIELDS = [
  { value: "customer.tier",    label: "Customer tier" },
  { value: "sentiment",        label: "Sentiment score" },
  { value: "severity",         label: "Severity" },
  { value: "status",           label: "Status" },
  { value: "sourceType",       label: "Source type" },
  { value: "theme_id",         label: "Theme ID" },
  { value: "customer.arrCents",label: "ARR (cents)" },
]

const FILTER_OPS: Array<{ value: FilterOperator; label: string }> = [
  { value: "eq",          label: "=" },
  { value: "neq",         label: "≠" },
  { value: "gt",          label: ">" },
  { value: "gte",         label: "≥" },
  { value: "lt",          label: "<" },
  { value: "lte",         label: "≤" },
  { value: "in",          label: "in" },
  { value: "contains",    label: "contains" },
  { value: "is_null",     label: "is empty" },
  { value: "is_not_null", label: "is not empty" },
]

function TriggerEditor({ data, onUpdate }: { data: Record<string, unknown>; onUpdate: (d: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="text-xs font-medium">Event type</label>
        <select
          value={(data.trigger as string) ?? "new_feedback"}
          onChange={(e) => onUpdate({ ...data, trigger: e.target.value })}
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
        >
          <option value="new_feedback">New feedback item</option>
          <option value="theme_spike">Theme spike detected</option>
          <option value="schedule">Schedule (cron)</option>
        </select>
      </div>
      {data.trigger === "schedule" && (
        <div className="space-y-1">
          <label className="text-xs font-medium">Cron expression</label>
          <input
            value={((data.config as Record<string, unknown> | undefined)?.cron as string) ?? "0 9 * * MON"}
            onChange={(e) => onUpdate({ ...data, config: { ...(data.config as object), cron: e.target.value } })}
            placeholder="0 9 * * MON"
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono"
          />
          <p className="text-[10px] text-muted-foreground">e.g. "0 9 * * MON" = Monday 9am</p>
        </div>
      )}
    </div>
  )
}

function FilterEditor({ data, onUpdate }: { data: Record<string, unknown>; onUpdate: (d: Record<string, unknown>) => void }) {
  const clauses: FilterClause[] = (data.clauses as FilterClause[] | undefined) ?? []
  const logic = (data.logic as "AND" | "OR" | undefined) ?? "AND"

  function updateClause(index: number, partial: Partial<FilterClause>) {
    const next = clauses.map((c, i) => (i === index ? { ...c, ...partial } : c))
    onUpdate({ ...data, clauses: next })
  }

  function addClause() {
    onUpdate({
      ...data,
      clauses: [...clauses, { field: "customer.tier", operator: "eq" as FilterOperator, value: "ENTERPRISE" }],
    })
  }

  function removeClause(index: number) {
    onUpdate({ ...data, clauses: clauses.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium">Match</span>
        {(["AND", "OR"] as const).map((l) => (
          <button
            key={l}
            onClick={() => onUpdate({ ...data, logic: l })}
            className={`rounded-md px-2.5 py-1 text-xs font-medium border ${
              logic === l
                ? "bg-amber-100 text-amber-800 border-amber-300"
                : "bg-background text-muted-foreground border-border"
            }`}
          >
            {l}
          </button>
        ))}
        <span className="text-xs text-muted-foreground">of the conditions</span>
      </div>

      <div className="space-y-2">
        {clauses.map((clause, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] gap-1 items-center">
            <select
              value={clause.field}
              onChange={(e) => updateClause(i, { field: e.target.value })}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            >
              {FILTER_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <select
              value={clause.operator}
              onChange={(e) => updateClause(i, { operator: e.target.value as FilterOperator })}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            >
              {FILTER_OPS.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
            </select>
            <input
              value={String(clause.value ?? "")}
              onChange={(e) => {
                const raw = e.target.value
                const num = Number(raw)
                updateClause(i, { value: !isNaN(num) && raw !== "" ? num : raw })
              }}
              placeholder="value"
              className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            />
            <button onClick={() => removeClause(i)} className="text-muted-foreground hover:text-red-500">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          onClick={addClause}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Add condition
        </button>
      </div>
    </div>
  )
}

function EnrichEditor({ data, onUpdate }: { data: Record<string, unknown>; onUpdate: (d: Record<string, unknown>) => void }) {
  const enrichments: string[] = (data.enrichments as string[] | undefined) ?? []
  const OPTIONS = [
    { value: "crm",       label: "CRM lookup" },
    { value: "sentiment", label: "Sentiment score" },
    { value: "severity",  label: "Severity inference" },
  ]

  function toggle(value: string) {
    const next = enrichments.includes(value)
      ? enrichments.filter((e) => e !== value)
      : [...enrichments, value]
    onUpdate({ ...data, enrichments: next })
  }

  return (
    <div className="space-y-2">
      {OPTIONS.map((opt) => (
        <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enrichments.includes(opt.value)}
            onChange={() => toggle(opt.value)}
            className="rounded border-border"
          />
          <span className="text-xs">{opt.label}</span>
        </label>
      ))}
    </div>
  )
}

function ActionEditor({
  data,
  members,
  onUpdate,
}: {
  data: Record<string, unknown>
  members: NodeEditorProps["members"]
  onUpdate: (d: Record<string, unknown>) => void
}) {
  const action = (data.action as string) ?? "assign"
  const config = (data.config as Record<string, unknown>) ?? {}

  function setConfig(patch: object) {
    onUpdate({ ...data, config: { ...config, ...patch } })
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="text-xs font-medium">Action type</label>
        <select
          value={action}
          onChange={(e) => onUpdate({ ...data, action: e.target.value, config: {} })}
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
        >
          <option value="assign">Assign to team member</option>
          <option value="create_ticket">Create Linear / Jira ticket</option>
          <option value="slack_post">Post to Slack channel</option>
          <option value="webhook">HTTP Webhook</option>
        </select>
      </div>

      {action === "assign" && (
        <div className="space-y-1">
          <label className="text-xs font-medium">Assign to</label>
          <select
            value={(config.userId as string) ?? ""}
            onChange={(e) => setConfig({ userId: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
          >
            <option value="">Select member…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.clerkUserId} ({m.role})</option>
            ))}
          </select>
        </div>
      )}

      {action === "create_ticket" && (
        <div className="space-y-1">
          <label className="text-xs font-medium">Provider</label>
          <select
            value={(config.provider as string) ?? "linear"}
            onChange={(e) => setConfig({ provider: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
          >
            <option value="linear">Linear</option>
            <option value="jira">Jira</option>
          </select>
        </div>
      )}

      {action === "slack_post" && (
        <>
          <div className="space-y-1">
            <label className="text-xs font-medium">Channel</label>
            <input
              value={(config.channel as string) ?? ""}
              onChange={(e) => setConfig({ channel: e.target.value })}
              placeholder="#product-alerts"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Message template</label>
            <textarea
              value={(config.template as string) ?? ""}
              onChange={(e) => setConfig({ template: e.target.value })}
              placeholder="New feedback: {{summary}}"
              rows={3}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono resize-none"
            />
            <p className="text-[10px] text-muted-foreground">Use {"{{summary}}"} to insert the feedback summary</p>
          </div>
        </>
      )}

      {action === "webhook" && (
        <div className="space-y-1">
          <label className="text-xs font-medium">URL</label>
          <input
            value={(config.url as string) ?? ""}
            onChange={(e) => setConfig({ url: e.target.value })}
            placeholder="https://your-endpoint.com/hook"
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono"
          />
        </div>
      )}
    </div>
  )
}

export function NodeEditor({ node, members, onUpdate, onDelete, testResult }: NodeEditorProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const data = node.data as Record<string, unknown>

  const resultColor =
    testResult?.result === "pass"
      ? "border-green-500 bg-green-50"
      : testResult?.result === "fail"
      ? "border-red-500 bg-red-50"
      : null

  return (
    <div className="w-72 shrink-0 border-l border-border bg-card flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-medium capitalize">{node.type} node</span>
        <button
          onClick={() => {
            if (confirmDelete) { onDelete() } else { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000) }
          }}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
          title={confirmDelete ? "Click again to confirm" : "Delete node"}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Test result badge */}
      {testResult && (
        <div className={`mx-4 mt-3 rounded-md border p-2 text-xs flex items-center gap-2 ${resultColor}`}>
          {testResult.result === "pass"
            ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
            : testResult.result === "fail"
            ? <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />
            : <SkipForward className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          <span className="capitalize font-medium">{testResult.result}</span>
          {testResult.detail != null && (
            <span className="ml-auto text-muted-foreground truncate max-w-[100px]" title={String(testResult.detail as unknown)}>
              {String(testResult.detail as unknown).slice(0, 30)}
            </span>
          )}
        </div>
      )}

      {/* Editor body */}
      <div className="flex-1 p-4">
        {node.type === "trigger" && <TriggerEditor data={data} onUpdate={onUpdate} />}
        {node.type === "filter"  && <FilterEditor  data={data} onUpdate={onUpdate} />}
        {node.type === "enrich"  && <EnrichEditor  data={data} onUpdate={onUpdate} />}
        {node.type === "action"  && <ActionEditor  data={data} members={members} onUpdate={onUpdate} />}
      </div>
    </div>
  )
}
