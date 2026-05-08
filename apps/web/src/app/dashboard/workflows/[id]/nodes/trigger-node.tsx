"use client"

import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Zap, Calendar, TrendingUp } from "lucide-react"

const TRIGGER_LABELS: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  new_feedback:  { label: "New feedback",  icon: Zap },
  theme_spike:   { label: "Theme spike",   icon: TrendingUp },
  schedule:      { label: "Schedule",      icon: Calendar },
}

export function TriggerNode({ data, selected }: NodeProps) {
  const d = data as { trigger?: string; config?: Record<string, unknown> }
  const trigger = d.trigger ?? "new_feedback"
  const triggerMeta = TRIGGER_LABELS[trigger] ?? TRIGGER_LABELS.new_feedback
  const { label, icon: Icon } = triggerMeta!

  return (
    <div
      className={`rounded-xl border-2 bg-card shadow-sm min-w-[180px] ${
        selected ? "border-primary" : "border-primary/30"
      }`}
    >
      <div className="flex items-center gap-2 rounded-t-[10px] bg-primary/10 px-3 py-2">
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Icon className="h-3 w-3" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">Trigger</span>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-sm font-medium">{label}</p>
        {d.config && Object.keys(d.config).length > 0 && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {Object.entries(d.config).map(([k, v]) => `${k}: ${v}`).join(", ")}
          </p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-primary !border-primary-foreground !w-3 !h-3" />
    </div>
  )
}
