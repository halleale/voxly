"use client"

import { useState, useMemo, useTransition } from "react"
import { useRouter } from "next/navigation"
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
import { DetailPanel } from "./detail-panel"
import { FilterPanel, type FilterState } from "./filter-panel"
import { cn } from "@/lib/utils"
import {
  ArrowUp, ArrowDown, ChevronsUpDown, Archive, CheckCircle2,
  SlidersHorizontal, Columns3, UserCheck, ChevronDown, Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface Member { id: string; name: string | null; email: string }

interface FeedbackTableProps {
  data: FeedbackRow[]
  workspaceId: string
  members: Member[]
  apiBase: string
  hasLinear: boolean
}

const EMPTY_FILTERS: FilterState = {
  sourceTypes: [],
  severities: [],
  statuses: [],
  sentimentRange: null,
  customerTiers: [],
}

function applyFilters(rows: FeedbackRow[], filters: FilterState): FeedbackRow[] {
  return rows.filter((row) => {
    if (filters.sourceTypes.length > 0 && !filters.sourceTypes.includes(row.sourceType as string)) return false
    if (filters.severities.length > 0 && !filters.severities.includes(row.severity as string)) return false
    if (filters.statuses.length > 0 && !filters.statuses.includes(row.status as string)) return false
    if (filters.customerTiers.length > 0) {
      if (!row.customer || !filters.customerTiers.includes(row.customer.tier as string)) return false
    }
    if (filters.sentimentRange) {
      const s = row.sentiment as number | null
      if (s == null) return false
      if (filters.sentimentRange === "positive" && s <= 0.3) return false
      if (filters.sentimentRange === "negative" && s >= -0.3) return false
      if (filters.sentimentRange === "neutral" && (s < -0.3 || s > 0.3)) return false
    }
    return true
  })
}

const COLUMN_LABELS: Record<string, string> = {
  select: "Select",
  customer: "Customer",
  theme: "Theme",
  feedback: "Feedback",
  source: "Source",
  sentiment: "Sentiment",
  severity: "Severity",
  status: "Status",
  age: "Age",
  ticket: "Ticket",
}

export function FeedbackTable({ data, workspaceId, members, apiBase, hasLinear }: FeedbackTableProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [sorting, setSorting] = useState<SortingState>([{ id: "age", desc: false }])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [selectedItem, setSelectedItem] = useState<FeedbackRow | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)

  const filteredData = useMemo(() => applyFilters(data, filters), [data, filters])

  const table = useReactTable({
    data: filteredData,
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
  const selectedIds = table
    .getSelectedRowModel()
    .rows.map((r) => r.original.id)

  const activeFilterCount =
    filters.sourceTypes.length +
    filters.severities.length +
    filters.statuses.length +
    filters.customerTiers.length +
    (filters.sentimentRange ? 1 : 0)
  const hasFilters = activeFilterCount > 0

  const toggleableColumns = table.getAllLeafColumns().filter((c) => c.id !== "select")

  async function bulkAction(action: "archive" | "resolve" | "assign", assigneeId?: string | null) {
    setBulkError(null)
    setBulkAssignOpen(false)
    try {
      const res = await fetch(`${apiBase}/api/workspaces/${workspaceId}/feedback/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: selectedIds, action, assigneeId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? "Request failed")
      }
      setRowSelection({})
      startTransition(() => router.refresh())
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <div className="relative flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {table.getRowModel().rows.length} items
            </span>
            {hasFilters && (
              <button
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="text-xs text-primary hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Filter button */}
            <div className="relative">
              <Button
                variant={hasFilters ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => { setFilterOpen((v) => !v); setColMenuOpen(false) }}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filter
                {hasFilters && (
                  <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-foreground/20 px-1 text-[10px] font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
              <FilterPanel
                open={filterOpen}
                filters={filters}
                onChange={setFilters}
                onClose={() => setFilterOpen(false)}
              />
            </div>

            {/* Column visibility */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => { setColMenuOpen((v) => !v); setFilterOpen(false) }}
              >
                <Columns3 className="h-3.5 w-3.5" />
                Columns
              </Button>
              {colMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setColMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-40 mt-1 w-44 rounded-xl border border-border bg-card shadow-xl p-2">
                    {toggleableColumns.map((col) => (
                      <label
                        key={col.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent"
                      >
                        <input
                          type="checkbox"
                          checked={col.getIsVisible()}
                          onChange={col.getToggleVisibilityHandler()}
                          className="h-3.5 w-3.5 rounded border-border"
                        />
                        {COLUMN_LABELS[col.id] ?? col.id}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
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
                              {sorted === "asc"  ? <ArrowUp className="h-3 w-3" />    :
                               sorted === "desc" ? <ArrowDown className="h-3 w-3" />  :
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
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelectedItem(row.original)}
                  data-selected={row.getIsSelected()}
                  className={cn(row.getIsSelected() && "bg-primary/5")}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} style={{ width: cell.column.getSize() }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
              {table.getRowModel().rows.length === 0 && (
                <tr>
                  <td colSpan={feedbackColumns.length} className="py-16 text-center text-sm text-muted-foreground">
                    No feedback items found.
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
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            {bulkError && <span className="text-xs text-destructive">{bulkError}</span>}
            <div className="h-4 w-px bg-border" />

            {/* Bulk assign dropdown */}
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => setBulkAssignOpen((v) => !v)}
              >
                <UserCheck className="h-4 w-4" /> Assign <ChevronDown className="h-3 w-3" />
              </Button>
              {bulkAssignOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setBulkAssignOpen(false)} />
                  <div className="absolute bottom-full left-0 z-40 mb-2 w-52 rounded-lg border border-border bg-card shadow-xl overflow-hidden">
                    <button
                      className="w-full px-3 py-2 text-left text-xs hover:bg-muted text-muted-foreground"
                      onClick={() => bulkAction("assign", null)}
                    >
                      Unassign
                    </button>
                    {members.map((m) => (
                      <button
                        key={m.id}
                        className="w-full px-3 py-2 text-left text-xs hover:bg-muted"
                        onClick={() => bulkAction("assign", m.id)}
                      >
                        {m.name ?? m.email}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => bulkAction("resolve")}
            >
              <CheckCircle2 className="h-4 w-4" /> Resolve
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => bulkAction("archive")}
            >
              <Archive className="h-4 w-4" /> Archive
            </Button>

            <Button variant="ghost" size="sm" onClick={() => setRowSelection({})}>
              Cancel
            </Button>
          </div>
        )}
      </div>

      {/* Detail Panel */}
      <DetailPanel
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        workspaceId={workspaceId}
        members={members}
        apiBase={apiBase}
        hasLinear={hasLinear}
      />
    </>
  )
}
