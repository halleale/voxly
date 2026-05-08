"use client"

import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Filter } from "lucide-react"
import type { FilterClause } from "@voxly/types"

export function FilterNode({ data, selected }: NodeProps) {
  const d = data as { logic?: "AND" | "OR"; clauses?: FilterClause[] }
  const logic = d.logic ?? "AND"
  const clauses = d.clauses ?? []

  return (
    <div
      className={`rounded-xl border-2 bg-card shadow-sm min-w-[180px] ${
        selected ? "border-amber-500" : "border-amber-400/50"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-amber-500 !border-background !w-3 !h-3" />
      <div className="flex items-center gap-2 rounded-t-[10px] bg-amber-50 px-3 py-2">
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white">
          <Filter className="h-3 w-3" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">Filter</span>
        <span className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
          {logic}
        </span>
      </div>
      <div className="px-3 py-2.5">
        {clauses.length === 0 ? (
          <p className="text-xs text-muted-foreground">No conditions — click to configure</p>
        ) : (
          <ul className="space-y-1">
            {clauses.map((c, i) => (
              <li key={i} className="text-xs text-foreground">
                <span className="font-mono text-muted-foreground">{c.field}</span>{" "}
                <span className="text-amber-700">{c.operator}</span>{" "}
                <span className="font-medium">{String(c.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-amber-500 !border-background !w-3 !h-3" />
    </div>
  )
}
