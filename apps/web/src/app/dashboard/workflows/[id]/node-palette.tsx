"use client"

import { Zap, Filter, Sparkles, MousePointerClick } from "lucide-react"
import type { WorkflowNode } from "@voxly/types"

const PALETTE_ITEMS: Array<{
  type: WorkflowNode["type"]
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}> = [
  {
    type: "trigger",
    label: "Trigger",
    description: "Starts the workflow",
    icon: Zap,
    color: "bg-primary/10 text-primary border-primary/30",
  },
  {
    type: "filter",
    label: "Filter",
    description: "Route by conditions",
    icon: Filter,
    color: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    type: "enrich",
    label: "Enrich",
    description: "Add AI / CRM data",
    icon: Sparkles,
    color: "bg-violet-50 text-violet-700 border-violet-200",
  },
  {
    type: "action",
    label: "Action",
    description: "Assign, ticket, Slack…",
    icon: MousePointerClick,
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
]

interface NodePaletteProps {
  onAdd: (type: WorkflowNode["type"]) => void
}

export function NodePalette({ onAdd }: NodePaletteProps) {
  return (
    <div className="w-44 shrink-0 border-r border-border bg-card flex flex-col gap-1 p-2">
      <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        Add node
      </p>
      {PALETTE_ITEMS.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.type}
            onClick={() => onAdd(item.type)}
            className={`flex items-start gap-2 rounded-lg border p-2.5 text-left hover:shadow-sm transition-all ${item.color}`}
          >
            <Icon className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold">{item.label}</p>
              <p className="text-[10px] opacity-70 leading-tight">{item.description}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
