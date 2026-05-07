"use client"

import Link from "next/link"
import {
  Slack, MessageCircle, HelpCircle, Star, Headphones,
  MessageSquare, CheckCircle2, XCircle, Clock, AlertCircle,
  Plus,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Connector } from "@voxly/db"

interface ConnectorListProps {
  workspaceId: string
  connectors: Connector[]
}

const AVAILABLE_CONNECTORS = [
  { type: "SLACK",     label: "Slack",      icon: Slack,         description: "Customer feedback from Slack channels" },
  { type: "INTERCOM",  label: "Intercom",   icon: MessageCircle, description: "Support conversations and tickets" },
  { type: "ZENDESK",   label: "Zendesk",    icon: HelpCircle,    description: "Support tickets and CSAT scores" },
  { type: "G2",        label: "G2",         icon: Star,          description: "G2 product reviews" },
  { type: "GONG",      label: "Gong",       icon: Headphones,    description: "Customer calls and transcripts" },
  { type: "CANNY",     label: "Canny",      icon: MessageSquare, description: "Feature requests and votes" },
] as const

const STATUS_ICONS = {
  ACTIVE:       { icon: CheckCircle2, color: "text-green-500" },
  ERROR:        { icon: XCircle,      color: "text-red-500" },
  PAUSED:       { icon: Clock,        color: "text-amber-500" },
  PENDING_AUTH: { icon: AlertCircle,  color: "text-muted-foreground" },
}

export function ConnectorList({ connectors }: ConnectorListProps) {
  const connected = new Set(connectors.map((c) => c.type))

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
              const status = connector.status as keyof typeof STATUS_ICONS
              const StatusIcon = STATUS_ICONS[status]?.icon ?? AlertCircle
              const statusColor = STATUS_ICONS[status]?.color ?? "text-muted-foreground"
              return (
                <div
                  key={connector.id}
                  className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{connector.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {connector.itemCount} items
                      {connector.lastPolledAt &&
                        ` · last synced ${formatAge(connector.lastPolledAt)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusIcon className={`h-4 w-4 ${statusColor}`} />
                    <span className="text-xs text-muted-foreground capitalize">
                      {connector.status.toLowerCase().replace("_", " ")}
                    </span>
                  </div>
                  {connector.errorMessage && (
                    <Badge variant="high" className="text-[10px]">
                      Error
                    </Badge>
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
