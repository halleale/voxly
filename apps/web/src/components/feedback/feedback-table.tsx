"use client"

import { useState } from "react"
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type RowSelectionState,
  type ColumnFiltersState,
  type VisibilityState,
} from "@tanstack/react-table"
import { feedbackColumns, type FeedbackRow } from "./columns"
import { cn } from "@/lib/utils"
import { ArrowUp, ArrowDown, ChevronsUpDown, Trash2, UserCheck, Archive } from "lucide-react"
import { Button } from "@/components/ui/button"

interface FeedbackTableProps {
  data: FeedbackRow[]
  onRowClick?: (row: FeedbackRow) => void
}

export function FeedbackTable({ data, onRowClick }: FeedbackTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "age", desc: false }])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

  const table = useReactTable({
    data,
    columns: feedbackColumns,
    state: { sorting, rowSelection, columnFilters, columnVisibility },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableRowSelection: true,
  })

  const selectedCount = Object.keys(rowSelection).length

  return (
    <div className="relative flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {table.getFilteredRowModel().rows.length} items
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            + Filter
          </Button>
          <Button variant="outline" size="sm">
            Columns
          </Button>
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
                onClick={() => onRowClick?.(row.original)}
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
