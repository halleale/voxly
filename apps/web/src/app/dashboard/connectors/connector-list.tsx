"use client"

import Link from "next/link"
import { useState } from "react"
import {
  Slack, MessageCircle, HelpCircle, Star, Headphones,
  MessageSquare, Building2, GitBranch, CheckCircle2, XCircle,
  Clock, AlertCircle, Plus, Hash, Ticket, RefreshCw, RotateCcw,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Connector } from "@voxly/db"

interface ConnectorListProps {
  workspaceId: string
  connectors: Connector[]
}

const AVAILABLE_CONNECTORS = [
  { type: "SLACK",    label: "Slack",          icon: Slack,         description: "Customer feedback from Slack channels" },
  { type: "INTERCOM", label: "Intercom",        icon: MessageCircle, description: "Support conversations and tickets" },
  { type: "ZENDESK",  label: "Zendesk",         icon: HelpCircle,    description: "Support tickets and CSAT scores" },
  { type: "GONG",     label: "Gong",            icon: Headphones,    description: "Customer calls and transcripts" },
  { type: "CANNY",    label: "Canny",           icon: MessageSquare, description: "Feature requests and votes" },
  { type: "G2",       label: "G2",              icon: Star,          description: "G2 product reviews — polled daily" },
  { type: "HN",       label: "Hacker News",     icon: Hash,          description: "HN mentions — polled hourly via Algolia" },
  { type: "REDDIT",   label: "Reddit",          icon: MessageSquare, description: "Reddit posts and comments — polled hourly" },
  { type: "HUBSPOT",  label: "HubSpot",         icon: Building2,     description: "CRM sync — company ARR and tier data" },
  { type: "LINEAR",   label: "Linear",          icon: GitBranch,     description: "Create and link issues from feedback" },
  { type: "JIRA",     label: "Jira",            icon: Ticket,        description: "Create and link Jira issues from feedback" },
] as const

const STATUS_CONFIG = {
  ACTIVE:       { icon: CheckCircle2, color: "text-green-500",           label: "Active" },
  ERROR:        { icon: XCircle,      color: "text-red-500",             label: "Error" },
  PAUSED:       { icon: Clock,        color: "text-amber-500",           label: "Paused" },
  PENDING_AUTH: { icon: AlertCircle,  color: "text-muted-foreground",    label: "Needs auth" },
} as const

// Polling connectors can be manually triggered
const POLLING_CONNECTORS = new Set(["G2", "HN", "REDDIT"])

// OAuth connectors that can be re-authed via their setup flow
const OAUTH_CONNECTORS = new Set(["SLACK", "INTERCOM", "HUBSPOT", "LINEAR", "JIRA"])

export function ConnectorList({ workspaceId, connectors }: ConnectorListProps) {
  const connected = new Set(connectors.map((c) => c.type))
  const [pollingIds, setPollingIds] = useState<Set<string>>(new Set())

  async function triggerPoll(connectorId: string) {
    setPollingIds((s) => new Set([...s, connectorId]))
    try {
      await fetch(`/api/connectors/${connectorId}/poll`, { method: "POST" })
    } finally {
      setPollingIds((s) => {
        const next = new Set(s)
        next.delete(connectorId)
        return next
      })
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      {/* Connected sources */}
      {connectors.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Connected sources
          </h2>
          <div className="space-y-2">
            {connectors.map((connector) => {
              const avail = AVAILABLE_CONNECTORS.find((a) => a.type === connector.type)
              const Icon = avail?.icon ?? MessageSquare
              const statusKey = connector.status as keyof typeof STATUS_CONFIG
              const statusCfg = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.PENDING_AUTH
              const StatusIcon = statusCfg.icon
              const isPolling = pollingIds.has(connector.id)
              const needsReauth =
                connector.status === "ERROR" || connector.status === "PENDING_AUTH"
              const isOAuth = OAUTH_CONNECTORS.has(connector.type)
              const canPoll = POLLING_CONNECTORS.has(connector.type)

              return (
                <div
                  key={connector.id}
                  className="rounded-xl border border-border bg-card px-5 py-4 space-y-3"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted shrink-0">
                      <Icon className="h-4.5 w-4.5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{connector.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {connector.itemCount.toLocaleString()} items
                        {connector.lastPolledAt &&
                          ` · last synced ${formatAge(connector.lastPolledAt)}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <StatusIcon className={`h-4 w-4 ${statusCfg.color}`} />
                        <span className="text-xs text-muted-foreground">{statusCfg.label}</span>
                      </div>

                      {canPoll && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => triggerPoll(connector.id)}
                          disabled={isPolling}
                          title="Trigger manual poll"
                        >
                          <RefreshCw className={`h-3 w-3 ${isPolling ? "animate-spin" : ""}`} />
                        </Button>
                      )}

                      {needsReauth && isOAuth && (
                        <Link href={`/dashboard/connectors/setup/${connector.type.toLowerCase()}`}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1 border-red-200 text-red-600 hover:bg-red-50"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Re-auth
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* Error message */}
                  {connector.errorMessage && (
                    <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      {connector.errorMessage}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Available connectors */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Available sources
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {AVAILABLE_CONNECTORS.map(({ type, label, icon: Icon, description }) => {
            const isConnected = connected.has(type)
            return (
              <div
                key={type}
                className="relative rounded-xl border border-border bg-card px-5 py-4"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                      {description}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  {isConnected ? (
                    <Badge variant="new" className="text-[10px]">Connected</Badge>
                  ) : (
                    <Link href={`/dashboard/connectors/setup/${type.toLowerCase()}`}>
                      <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7">
                        <Plus className="h-3 w-3" />
                        Connect
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function formatAge(date: Date): string {
  const ms = Date.now() - new Date(date).getTime()
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
