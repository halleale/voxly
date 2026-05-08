"use client"

import { useState } from "react"
import { CheckCircle2, XCircle, MessageSquare, Slack, MessageCircle, HelpCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatAge } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

interface InboxItem {
  id: string
  externalId: string
  sourceType: string
  receivedAt: string
  rawPayload: Record<string, unknown>
  connector: { name: string; type: string }
}

// ─── Source icon ──────────────────────────────────────────────────────────────

const SOURCE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  SLACK:    Slack,
  INTERCOM: MessageCircle,
  ZENDESK:  HelpCircle,
}

function SourceIcon({ type }: { type: string }) {
  const Icon = SOURCE_ICONS[type] ?? MessageSquare
  return <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
}

// ─── Item card ────────────────────────────────────────────────────────────────

function InboxCard({
  item,
  onApprove,
  onReject,
}: {
  item: InboxItem
  onApprove: (id: string) => void
  onReject: (id: string) => void
}) {
  const [acting, setActing] = useState<"approve" | "reject" | null>(null)
  const text =
    (item.rawPayload.verbatimText as string) ??
    (item.rawPayload.text as string) ??
    "No text available"

  const handleApprove = async () => {
    setActing("approve")
    // In production: POST /api/workspaces/:id/inbox/:itemId/approve
    await new Promise((r) => setTimeout(r, 300))
    onApprove(item.id)
  }

  const handleReject = async () => {
    setActing("reject")
    await new Promise((r) => setTimeout(r, 300))
    onReject(item.id)
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <SourceIcon type={item.sourceType} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground mb-1">
          {item.connector.name} · {formatAge(new Date(item.receivedAt))}
        </p>
        <p className="text-sm line-clamp-3 text-foreground">{text}</p>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs text-green-600 border-green-200 hover:bg-green-50"
          onClick={handleApprove}
          disabled={acting !== null}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {acting === "approve" ? "Adding…" : "Approve"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs text-destructive border-destructive/20 hover:bg-destructive/5"
          onClick={handleReject}
          disabled={acting !== null}
        >
          <XCircle className="h-3.5 w-3.5" />
          {acting === "reject" ? "Rejecting…" : "Reject"}
        </Button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// Seed with a few mock items so the page is non-empty during development
const MOCK_ITEMS: InboxItem[] = [
  {
    id: "mock-1",
    externalId: "C01ABC:1234567890.000100",
    sourceType: "SLACK",
    receivedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    rawPayload: {
      verbatimText:
        "Not sure if this is a product issue or just me — sometimes the sidebar disappears and I have to refresh.",
    },
    connector: { name: "Slack #general", type: "SLACK" },
  },
  {
    id: "mock-2",
    externalId: "intercom:conv_98765",
    sourceType: "INTERCOM",
    receivedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    rawPayload: {
      verbatimText:
        "Hey, quick question — does your tool work offline? I travel a lot and sometimes lose wifi.",
    },
    connector: { name: "Intercom", type: "INTERCOM" },
  },
  {
    id: "mock-3",
    externalId: "slack:C02DEF:9876543210",
    sourceType: "SLACK",
    receivedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    rawPayload: {
      verbatimText:
        "I think I may have messed up my configuration but not sure — would be nice if there was an undo button.",
    },
    connector: { name: "Slack #product-feedback", type: "SLACK" },
  },
]

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>(MOCK_ITEMS)

  const handleApprove = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id))
  const handleReject = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id))

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-sm font-semibold">Inbox</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Items the AI was uncertain about. Approve to add to the Feedback table, reject to discard.
          Your decisions improve the classifier.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
          <CheckCircle2 className="mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">All caught up</p>
          <p className="mt-1 text-xs text-muted-foreground">No uncertain items waiting for review.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">{items.length} item{items.length !== 1 ? "s" : ""} waiting</p>
          {items.map((item) => (
            <InboxCard
              key={item.id}
              item={item}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>
      )}
    </div>
  )
}
