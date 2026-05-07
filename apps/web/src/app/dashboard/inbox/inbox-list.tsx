"use client"

import { useState, useTransition } from "react"
import { CheckCircle, XCircle, ExternalLink, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatAge } from "@/lib/utils"

interface InboxItem {
  id: string
  externalId: string
  sourceType: string
  connectorName: string
  verbatimText: string
  authorName?: string
  externalUrl?: string
  publishedAt?: string
  receivedAt: string
}

const SOURCE_LABELS: Record<string, string> = {
  SLACK: "Slack", INTERCOM: "Intercom", ZENDESK: "Zendesk",
  G2: "G2", TRUSTRADIUS: "TrustRadius", GONG: "Gong",
  CANNY: "Canny", HN: "Hacker News", REDDIT: "Reddit",
  HUBSPOT: "HubSpot", SALESFORCE: "Salesforce", API: "API",
}

function InboxCard({
  item,
  onResolved,
}: {
  item: InboxItem
  onResolved: (id: string) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [action, setAction] = useState<"approve" | "reject" | null>(null)

  async function handleAction(type: "approve" | "reject") {
    setAction(type)
    startTransition(async () => {
      await fetch(`/api/inbox/${item.id}/${type}`, { method: "POST" })
      onResolved(item.id)
    })
  }

  const age = formatAge(new Date(item.publishedAt ?? item.receivedAt))
  const loading = isPending

  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3 transition-opacity duration-150 data-[loading=true]:opacity-50"
      data-loading={loading}>
      {/* Header row */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-[10px] font-medium">
          {SOURCE_LABELS[item.sourceType] ?? item.sourceType}
        </Badge>
        <span className="text-xs text-muted-foreground">{item.connectorName}</span>
        {item.authorName && (
          <>
            <span className="text-muted-foreground/40 text-xs">·</span>
            <span className="text-xs font-medium">{item.authorName}</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {age}
        </div>
        {item.externalUrl && (
          <a
            href={item.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {/* Verbatim text */}
      <p className="text-sm text-foreground leading-relaxed line-clamp-5">
        {item.verbatimText}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-xs text-muted-foreground mr-auto">
          Is this product feedback?
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs border-red-500/30 text-red-600 hover:bg-red-50 hover:border-red-500 dark:hover:bg-red-950"
          disabled={loading}
          onClick={() => handleAction("reject")}
        >
          <XCircle className="h-3.5 w-3.5" />
          {action === "reject" && loading ? "Rejecting…" : "Not feedback"}
        </Button>
        <Button
          size="sm"
          className="h-7 gap-1.5 text-xs"
          disabled={loading}
          onClick={() => handleAction("approve")}
        >
          <CheckCircle className="h-3.5 w-3.5" />
          {action === "approve" && loading ? "Approving…" : "Approve"}
        </Button>
      </div>
    </div>
  )
}

export function InboxList({ initialItems }: { initialItems: InboxItem[] }) {
  const [items, setItems] = useState(initialItems)

  function onResolved(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <CheckCircle className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm font-medium text-muted-foreground">Inbox zero</p>
        <p className="text-xs text-muted-foreground/70 max-w-xs">
          Items the AI couldn&apos;t confidently classify as product feedback land here for
          your review. Approved items go through sentiment, severity, and summary generation.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <InboxCard key={item.id} item={item} onResolved={onResolved} />
      ))}
    </div>
  )
}
