"use client"

import { useEffect, useState, useTransition } from "react"
import { CheckCircle, XCircle, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatAge } from "@/lib/utils"

interface BorderlineItem {
  id: string
  externalId: string
  sourceType: string
  connectorName: string
  verbatimText: string
  authorName?: string
  externalUrl?: string
  publishedAt?: string
  receivedAt: string
  stage3Score: number | null
}

const SOURCE_LABELS: Record<string, string> = {
  SLACK: "Slack", INTERCOM: "Intercom", ZENDESK: "Zendesk",
  G2: "G2", TRUSTRADIUS: "TrustRadius", GONG: "Gong",
  CANNY: "Canny", HN: "Hacker News", REDDIT: "Reddit",
  HUBSPOT: "HubSpot", SALESFORCE: "Salesforce", API: "API",
}

function BorderlineCard({
  item,
  onResolved,
}: {
  item: BorderlineItem
  onResolved: (id: string) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [action, setAction] = useState<"approve" | "dismiss" | null>(null)

  async function handleApprove() {
    setAction("approve")
    startTransition(async () => {
      await fetch(`/api/inbox/${item.id}/approve-borderline`, { method: "POST" })
      onResolved(item.id)
    })
  }

  async function handleDismiss() {
    setAction("dismiss")
    startTransition(async () => {
      // Just remove from UI — it stays as REJECTED in DB, score already stored
      onResolved(item.id)
    })
  }

  const age = formatAge(new Date(item.publishedAt ?? item.receivedAt))
  const scorePercent = item.stage3Score ? Math.round(item.stage3Score * 100) : null

  return (
    <div
      className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3 transition-opacity duration-150 data-[loading=true]:opacity-50"
      data-loading={isPending}
    >
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-[10px] font-medium">
          {SOURCE_LABELS[item.sourceType] ?? item.sourceType}
        </Badge>
        <span className="text-xs text-muted-foreground">{item.connectorName}</span>
        {item.authorName && (
          <>
            <span className="text-muted-foreground/40 text-xs">·</span>
            <span className="text-xs text-muted-foreground">{item.authorName}</span>
          </>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{age}</span>
        {scorePercent && (
          <span className="text-xs text-amber-600 font-medium tabular-nums">
            score {scorePercent}%
          </span>
        )}
      </div>

      <p className="text-sm leading-relaxed line-clamp-4 whitespace-pre-line">
        {item.verbatimText}
      </p>

      <div className="flex items-center gap-2">
        {item.externalUrl && (
          <a
            href={item.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <ExternalLink className="h-3 w-3" /> Source
          </a>
        )}
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={handleDismiss}
            disabled={isPending}
          >
            <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
            Dismiss
          </Button>
          <Button
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={handleApprove}
            disabled={isPending}
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Approve + train
          </Button>
        </div>
      </div>
    </div>
  )
}

export function BorderlineList({ workspaceId }: { workspaceId: string }) {
  const [items, setItems] = useState<BorderlineItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"
    fetch(`${apiBase}/api/workspaces/${workspaceId}/inbox/borderline`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((json: { data: BorderlineItem[] }) => setItems(json.data ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [workspaceId])

  function handleResolved(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
  }

  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No borderline-rejected items right now.
        <p className="mt-1 text-xs">Items rejected by the classifier with a score close to the threshold will appear here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {items.length} items · Sorted by classifier score (highest first — most likely to be real feedback)
      </p>
      {items.map((item) => (
        <BorderlineCard key={item.id} item={item} onResolved={handleResolved} />
      ))}
    </div>
  )
}
