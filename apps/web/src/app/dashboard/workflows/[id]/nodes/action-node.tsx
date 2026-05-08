"use client"

import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Ticket, UserPlus, MessageSquare, Globe } from "lucide-react"

const ACTION_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  assign:        { label: "Assign",         icon: UserPlus,     color: "bg-blue-500" },
  create_ticket: { label: "Create ticket",  icon: Ticket,       color: "bg-emerald-500" },
  slack_post:    { label: "Post to Slack",  icon: MessageSquare,color: "bg-[#4A154B]" },
  webhook:       { label: "Webhook",        icon: Globe,        color: "bg-gray-500" },
}

function configSummary(action: string, config: Record<string, unknown>): string {
  if (action === "assign") return config.userId ? `→ user ${String(config.userId).slice(0, 8)}…` : "No user selected"
  if (action === "create_ticket") return `via ${(config.provider as string | undefined) ?? "linear"}`
  if (action === "slack_post") return (config.channel as string | undefined) ?? "No channel"
  if (action === "webhook") return (config.url as string | undefined) ?? "No URL"
  return ""
}

export function ActionNode({ data, selected }: NodeProps) {
  const d = data as { action?: string; config?: Record<string, unknown> }
  const action = d.action ?? "assign"
  const config = d.config ?? {}
  const meta = ACTION_META[action] ?? ACTION_META.assign!
  const Icon = meta!.icon

  return (
    <div
      className={`rounded-xl border-2 bg-card shadow-sm min-w-[180px] ${
        selected ? "border-emerald-500" : "border-emerald-400/50"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-emerald-500 !border-background !w-3 !h-3" />
      <div className="flex items-center gap-2 rounded-t-[10px] bg-emerald-50 px-3 py-2">
        <div className={`flex h-5 w-5 items-center justify-center rounded-full ${meta!.color} text-white`}>
          <Icon className="h-3 w-3" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Action</span>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-sm font-medium">{meta!.label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{configSummary(action, config)}</p>
      </div>
    </div>
  )
}
