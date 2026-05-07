"use client"

import { useState } from "react"
import { FeedbackTable } from "./feedback-table"
import { FeedbackDetailPanel } from "./detail-panel"
import type { FeedbackRow } from "./columns"

interface FeedbackViewProps {
  data: FeedbackRow[]
  activeView: string
}

export function FeedbackView({ data, activeView }: FeedbackViewProps) {
  const [selectedRow, setSelectedRow] = useState<FeedbackRow | null>(null)

  function handleRowClick(row: FeedbackRow) {
    setSelectedRow((prev) => (prev?.id === row.id ? null : row))
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 overflow-auto">
        <FeedbackTable
          data={data}
          activeView={activeView}
          selectedRowId={selectedRow?.id}
          onRowClick={handleRowClick}
        />
      </div>
      {selectedRow && (
        <FeedbackDetailPanel item={selectedRow} onClose={() => setSelectedRow(null)} />
      )}
    </div>
  )
}
