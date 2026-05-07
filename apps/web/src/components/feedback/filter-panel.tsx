"use client"

import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface FilterState {
  sourceTypes: string[]
  severities: string[]
  statuses: string[]
  sentimentRange: "positive" | "neutral" | "negative" | null
  customerTiers: string[]
}

interface FilterPanelProps {
  open: boolean
  filters: FilterState
  onChange: (filters: FilterState) => void
  onClose: () => void
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
      )}
    >
      {label}
    </button>
  )
}

function toggle<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]
}

export function FilterPanel({ open, filters, onChange, onClose }: FilterPanelProps) {
  const hasFilters =
    filters.sourceTypes.length > 0 ||
    filters.severities.length > 0 ||
    filters.statuses.length > 0 ||
    filters.sentimentRange !== null ||
    filters.customerTiers.length > 0

  const clear = () =>
    onChange({ sourceTypes: [], severities: [], statuses: [], sentimentRange: null, customerTiers: [] })

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30" onClick={onClose} />
      )}
      <div
        className={cn(
          "absolute right-0 top-full z-40 mt-1 w-72 rounded-xl border border-border bg-card shadow-xl transition-all duration-150 origin-top-right",
          open ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none",
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold">Filters</span>
          <div className="flex items-center gap-2">
            {hasFilters && (
              <button onClick={clear} className="text-xs text-muted-foreground hover:text-foreground">
                Clear all
              </button>
            )}
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-4 p-4">
          <FilterGroup label="Source">
            {["SLACK", "INTERCOM", "ZENDESK", "G2", "GONG", "CANNY", "HN", "REDDIT"].map((s) => (
              <Chip
                key={s}
                label={s.charAt(0) + s.slice(1).toLowerCase()}
                active={filters.sourceTypes.includes(s)}
                onClick={() => onChange({ ...filters, sourceTypes: toggle(filters.sourceTypes, s) })}
              />
            ))}
          </FilterGroup>

          <FilterGroup label="Severity">
            {["HIGH", "MEDIUM", "LOW"].map((s) => (
              <Chip
                key={s}
                label={s.charAt(0) + s.slice(1).toLowerCase()}
                active={filters.severities.includes(s)}
                onClick={() => onChange({ ...filters, severities: toggle(filters.severities, s) })}
              />
            ))}
          </FilterGroup>

          <FilterGroup label="Status">
            {["NEW", "ASSIGNED", "RESOLVED", "ARCHIVED"].map((s) => (
              <Chip
                key={s}
                label={s.charAt(0) + s.slice(1).toLowerCase()}
                active={filters.statuses.includes(s)}
                onClick={() => onChange({ ...filters, statuses: toggle(filters.statuses, s) })}
              />
            ))}
          </FilterGroup>

          <FilterGroup label="Sentiment">
            {(["positive", "neutral", "negative"] as const).map((s) => (
              <Chip
                key={s}
                label={s.charAt(0) + s.slice(1)}
                active={filters.sentimentRange === s}
                onClick={() =>
                  onChange({ ...filters, sentimentRange: filters.sentimentRange === s ? null : s })
                }
              />
            ))}
          </FilterGroup>

          <FilterGroup label="Customer tier">
            {["ENTERPRISE", "GROWTH", "STARTER"].map((t) => (
              <Chip
                key={t}
                label={t.charAt(0) + t.slice(1).toLowerCase()}
                active={filters.customerTiers.includes(t)}
                onClick={() => onChange({ ...filters, customerTiers: toggle(filters.customerTiers, t) })}
              />
            ))}
          </FilterGroup>
        </div>

        <div className="border-t border-border px-4 py-3">
          <Button size="sm" className="w-full" onClick={onClose}>
            Apply
          </Button>
        </div>
      </div>
    </>
  )
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

export type { FilterState }
