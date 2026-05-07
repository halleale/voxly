"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type RowSelectionState,
  type VisibilityState,
} from "@tanstack/react-table"
import { feedbackColumns, type FeedbackRow } from "./columns"
import { cn } from "@/lib/utils"
import {
  ArrowUp, ArrowDown, ChevronsUpDown,
  Trash2, UserCheck, Archive,
  ChevronDown, X, SlidersHorizontal,
} from "lucide-react"
import { Button } from "@/components/ui/button"

// ─── View filtering ──────────────────────────────────────────────────────────

function applyViewFilter(data: FeedbackRow[], view: string): FeedbackRow[] {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000)
  switch (view) {
    case "enterprise":
      return data.filter((r) => r.customer?.tier === "ENTERPRISE" && r.severity === "HIGH")
    case "untracked":
      return data.filter((r) => !r.themeId)
    case "last7":
      return data.filter((r) => r.publishedAt && new Date(r.publishedAt) >= sevenDaysAgo)
    case "unassigned":
      return data.filter((r) => !r.assigneeId && r.status === "NEW")
    case "negative":
      return data.filter((r) => r.sentiment != null && r.sentiment < -0.3)
    default:
      return data
  }
}

// ─── Panel filter types ───────────────────────────────────────────────────────

type FilterField = "sourceType" | "severity" | "status" | "customerTier"

interface ActiveFilter {
  key: string // field:value
  field: FilterField
  label: string
  value: string
}

const FILTER_FIELDS: { value: FilterField; label: string; options: { value: string; label: string }[] }[] = [
  {
    value: "sourceType",
    label: "Source",
    options: [
      { value: "SLACK",     label: "Slack" },
      { value: "INTERCOM",  label: "Intercom" },
      { value: "ZENDESK",   label: "Zendesk" },
      { value: "G2",        label: "G2" },
      { value: "GONG",      label: "Gong" },
      { value: "CANNY",     label: "Canny" },
      { value: "HN",        label: "HN" },
      { value: "REDDIT",    label: "Reddit" },
    ],
  },
  {
    value: "severity",
    label: "Severity",
    options: [
      { value: "HIGH",   label: "High" },
      { value: "MEDIUM", label: "Medium" },
      { value: "LOW",    label: "Low" },
    ],
  },
  {
    value: "status",
    label: "Status",
    options: [
      { value: "NEW",      label: "New" },
      { value: "ASSIGNED", label: "Assigned" },
      { value: "RESOLVED", label: "Resolved" },
      { value: "ARCHIVED", label: "Archived" },
    ],
  },
  {
    value: "customerTier",
    label: "Tier",
    options: [
      { value: "ENTERPRISE", label: "Enterprise" },
      { value: "GROWTH",     label: "Growth" },
      { value: "STARTER",    label: "Starter" },
    ],
  },
]

function applyPanelFilters(data: FeedbackRow[], filters: ActiveFilter[]): FeedbackRow[] {
  if (filters.length === 0) return data
  return data.filter((row) =>
    filters.every((f) => {
      switch (f.field) {
        case "sourceType":   return row.sourceType === f.value
        case "severity":     return row.severity === f.value
        case "status":       return row.status === f.value
        case "customerTier": return row.customer?.tier === f.value
        default:             return true
      }
    })
  )
}

// ─── Dropdown helpers ─────────────────────────────────────────────────────────

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [ref, onClose])
}

// ─── Column visibility dropdown ───────────────────────────────────────────────

const COLUMN_LABELS: Record<string, string> = {
  customer:  "Customer",
  theme:     "Theme",
  feedback:  "Feedback",
  source:    "Source",
  sentiment: "Sentiment",
  severity:  "Severity",
  status:    "Status",
  age:       "Age",
}

interface ColumnToggleProps {
  visibility: VisibilityState
  onChange: (id: string, visible: boolean) => void
}

function ColumnToggleDropdown({ visibility, onChange }: ColumnToggleProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false))

  return (
    <div ref={ref} className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)} className="gap-1.5">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Columns
        <ChevronDown className="h-3 w-3 opacity-60" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-44 rounded-lg border border-border bg-card py-1 shadow-lg">
          {Object.entries(COLUMN_LABELS).map(([id, label]) => {
            const visible = visibility[id] !== false
            return (
              <label
                key={id}
                className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-accent"
              >
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={(e) => onChange(id, (e.target as HTMLInputElement).checked)}
                  className="h-3.5 w-3.5 rounded border-border"
                />
                {label}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Filter panel ─────────────────────────────────────────────────────────────

interface FilterPanelProps {
  activeFilters: ActiveFilter[]
  onAdd: (filter: ActiveFilter) => void
  onRemove: (key: string) => void
}

function FilterPanel({ activeFilters, onAdd, onRemove }: FilterPanelProps) {
  const [open, setOpen] = useState(false)
  const [field, setField] = useState<FilterField>("sourceType")
  const [value, setValue] = useState("")
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false))

  const fieldDef = FILTER_FIELDS.find((f) => f.value === field)!

  function handleAdd() {
    if (!value) return
    const option = fieldDef.options.find((o) => o.value === value)
    if (!option) return
    const key = `${field}:${value}`
    if (activeFilters.some((f) => f.key === key)) return
    onAdd({ key, field, label: `${fieldDef.label}: ${option.label}`, value })
    setValue("")
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)} className="gap-1.5">
        + Filter
        {activeFilters.length > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {activeFilters.length}
          </span>
        )}
      </Button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-64 rounded-lg border border-border bg-card p-3 shadow-lg">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Add filter</p>
          <div className="flex flex-col gap-2">
            <select
              value={field}
              onChange={(e) => { setField((e.target as HTMLSelectElement).value as FilterField); setValue("") }}
              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {FILTER_FIELDS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <select
              value={value}
              onChange={(e) => setValue((e.target as HTMLSelectElement).value)}
              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select value…</option>
              {fieldDef.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <Button size="sm" onClick={handleAdd} disabled={!value}>
              Apply
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

interface FeedbackTableProps {
  data: FeedbackRow[]
  activeView?: string
  selectedRowId?: string
  onRowClick?: (row: FeedbackRow) => void
}

export function FeedbackTable({ data, activeView = "all", selectedRowId, onRowClick }: FeedbackTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "age", desc: false }])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([])

  // Apply view preset first, then panel filters
  const tableData = useMemo(
    () => applyPanelFilters(applyViewFilter(data, activeView), activeFilters),
    [data, activeView, activeFilters]
  )

  // Reset selection when view or filters change
  useEffect(() => { setRowSelection({}) }, [activeView, activeFilters])

  const table = useReactTable({
    data: tableData,
    columns: feedbackColumns,
    state: { sorting, rowSelection, columnVisibility },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableRowSelection: true,
  })

  const selectedCount = Object.keys(rowSelection).length

  function handleColumnVisibilityChange(id: string, visible: boolean) {
    setColumnVisibility((prev) => ({ ...prev, [id]: visible }))
  }

  function addFilter(filter: ActiveFilter) {
    setActiveFilters((prev) => [...prev, filter])
  }

  function removeFilter(key: string) {
    setActiveFilters((prev) => prev.filter((f) => f.key !== key))
  }

  return (
    <div className="relative flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground tabular-nums">
            {tableData.length} items
          </span>
          {/* Active filter chips */}
          {activeFilters.map((f) => (
            <span
              key={f.key}
              className="flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-xs font-medium"
            >
              {f.label}
              <button
                onClick={() => removeFilter(f.key)}
                className="ml-0.5 rounded-full hover:text-destructive transition-colors"
                aria-label={`Remove ${f.label} filter`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {activeFilters.length > 0 && (
            <button
              onClick={() => setActiveFilters([])}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <FilterPanel activeFilters={activeFilters} onAdd={addFilter} onRemove={removeFilter} />
          <ColumnToggleDropdown
            visibility={columnVisibility}
            onChange={handleColumnVisibilityChange}
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto">
        <table className="feedback-table w-full border-collapse">
          <thead className="border-b border-border bg-muted/30 sticky top-0 z-10">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      style={{ width: header.getSize() }}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      className={cn(canSort && "cursor-pointer select-none")}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && (
                          <span className="ml-1 text-muted-foreground/50">
                            {sorted === "asc"  ? <ArrowUp className="h-3 w-3" />   :
                             sorted === "desc" ? <ArrowDown className="h-3 w-3" /> :
                                                 <ChevronsUpDown className="h-3 w-3" />}
                          </span>
                        )}
                      </div>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const isSelected = row.original.id === selectedRowId
              return (
                <tr
                  key={row.id}
                  onClick={() => onRowClick?.(row.original)}
                  data-selected={row.getIsSelected()}
                  className={cn(
                    row.getIsSelected() && "bg-primary/5",
                    isSelected && "bg-primary/10 ring-1 ring-inset ring-primary/20"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} style={{ width: cell.column.getSize() }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              )
            })}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td
                  colSpan={feedbackColumns.length}
                  className="py-16 text-center text-sm text-muted-foreground"
                >
                  No feedback items match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-3 shadow-lg">
          <span className="text-sm font-medium">{selectedCount} selected</span>
          <div className="h-4 w-px bg-border" />
          <Button variant="ghost" size="sm" className="gap-1.5">
            <UserCheck className="h-4 w-4" /> Assign
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5">
            <Archive className="h-4 w-4" /> Archive
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRowSelection({})}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  )
}
