"use client"

import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Sparkles } from "lucide-react"

const ENRICHMENT_LABELS: Record<string, string> = {
  crm:       "CRM lookup",
  sentiment: "Sentiment score",
  severity:  "Severity inference",
}

export function EnrichNode({ data, selected }: NodeProps) {
  const d = data as { enrichments?: string[] }
  const enrichments = d.enrichments ?? []

  return (
    <div
      className={`rounded-xl border-2 bg-card shadow-sm min-w-[180px] ${
        selected ? "border-violet-500" : "border-violet-400/50"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-violet-500 !border-background !w-3 !h-3" />
      <div className="flex items-center gap-2 rounded-t-[10px] bg-violet-50 px-3 py-2">
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-500 text-white">
          <Sparkles className="h-3 w-3" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wide text-violet-700">Enrich</span>
      </div>
      <div className="px-3 py-2.5">
        {enrichments.length === 0 ? (
          <p className="text-xs text-muted-foreground">No enrichments — click to configure</p>
        ) : (
          <ul className="space-y-0.5">
            {enrichments.map((e) => (
              <li key={e} className="flex items-center gap-1.5 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                {ENRICHMENT_LABELS[e] ?? e}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-violet-500 !border-background !w-3 !h-3" />
    </div>
  )
}
