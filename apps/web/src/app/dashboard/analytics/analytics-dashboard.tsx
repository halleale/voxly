"use client"

import { useEffect, useState } from "react"
import {
  CheckCircle2,
  XCircle,
  Clock,
  PauseCircle,
  TrendingUp,
  Zap,
  Inbox,
  BarChart3,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ConnectorHealth {
  id: string
  type: string
  name: string
  status: string
  health: "healthy" | "error" | "stale" | "paused"
  itemCount: number
  lastPolledAt: string | null
  errorMessage: string | null
}

interface AnalyticsData {
  connectors: ConnectorHealth[]
  feedback: {
    total: number
    actioned: number
    actionedRate: number
    byStatus: Record<string, number>
    bySource: Record<string, number>
    periodDays: number
    periodTotal: number
  }
  workflows: {
    active: number
    total: number
    successRate: number | null
    recentRuns: Array<{
      id: string
      workflowId: string
      status: string
      startedAt: string
      completedAt: string | null
    }>
  }
}

const HEALTH_ICONS = {
  healthy: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  error:   <XCircle className="h-4 w-4 text-destructive" />,
  stale:   <Clock className="h-4 w-4 text-yellow-500" />,
  paused:  <PauseCircle className="h-4 w-4 text-muted-foreground" />,
}

function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div>
        <span className="text-2xl font-bold tabular-nums">{value}</span>
        {sub && <span className="ml-2 text-xs text-muted-foreground">{sub}</span>}
      </div>
    </div>
  )
}

export function AnalyticsDashboard({ workspaceId }: { workspaceId: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/workspaces/${workspaceId}/analytics?days=${days}`)
      .then((r) => r.json())
      .then((d) => { setData(d as AnalyticsData); setLoading(false) })
      .catch(() => setLoading(false))
  }, [workspaceId, days])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!data) {
    return <div className="p-8 text-sm text-muted-foreground">Failed to load analytics.</div>
  }

  const topSources = Object.entries(data.feedback.bySource)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  return (
    <div className="flex flex-col gap-6 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Analytics</h1>
        <div className="flex items-center gap-2">
          {([7, 30, 90] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium",
                days === d
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total feedback"
          value={data.feedback.total.toLocaleString()}
          sub="all time"
          icon={<Inbox className="h-4 w-4" />}
        />
        <StatCard
          label="Actioned rate"
          value={`${data.feedback.actionedRate}%`}
          sub={`${data.feedback.actioned} resolved/archived`}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          label={`New (${days}d)`}
          value={data.feedback.periodTotal.toLocaleString()}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Workflow success"
          value={data.workflows.successRate !== null ? `${data.workflows.successRate}%` : "—"}
          sub={`${data.workflows.active}/${data.workflows.total} active`}
          icon={<Zap className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Connector health */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Connector health</h2>
          <div className="flex flex-col divide-y divide-border">
            {data.connectors.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">No connectors yet</p>
            )}
            {data.connectors.map((c) => (
              <div key={c.id} className="flex items-center gap-3 py-2.5">
                {HEALTH_ICONS[c.health]}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  {c.errorMessage && (
                    <p className="truncate text-xs text-destructive">{c.errorMessage}</p>
                  )}
                  {!c.errorMessage && c.lastPolledAt && (
                    <p className="text-xs text-muted-foreground">
                      Last synced {new Date(c.lastPolledAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <span className="tabular-nums text-xs text-muted-foreground">
                  {c.itemCount.toLocaleString()} items
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Feedback by source */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Top sources ({days}d)</h2>
          {topSources.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">No data for this period</p>
          ) : (
            <div className="flex flex-col gap-3">
              {topSources.map(([source, count]) => {
                const pct = Math.round((count / data.feedback.periodTotal) * 100) || 0
                return (
                  <div key={source} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{source}</span>
                      <span className="tabular-nums text-muted-foreground">{count.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Feedback by status */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <BarChart3 className="h-4 w-4" />
          Feedback by status (all time)
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(data.feedback.byStatus).map(([status, count]) => (
            <div key={status} className="rounded-md bg-muted/50 p-3 text-center">
              <p className="text-lg font-bold tabular-nums">{count.toLocaleString()}</p>
              <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {status}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
