"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"

interface FeedbackItem {
  id: string
  verbatimText: string
  extractedSummary: string | null
  sourceType: string
  sentiment: number | null
  severity: string | null
  status: string
  publishedAt: Date
}

interface Customer {
  id: string
  name: string
  tier: string
  arrCents: number | null
}

interface Theme {
  id: string
  slug: string
}

interface WorkspaceMember {
  id: string
}

interface Connector {
  id: string
  type: string
}

interface LinkedTicket {
  id: string
  ticketUrl: string
  ticketStatus: string | null
}
import { formatAge, formatArr, formatSentiment, cn } from "@/lib/utils"
import {
  Slack, MessageCircle, Star, HelpCircle, Headphones,
  Hash, MessageSquare, ExternalLink,
} from "lucide-react"

export type FeedbackRow = FeedbackItem & {
  customer: Customer | null
  theme: Theme | null
  assignee: WorkspaceMember | null
  connector: Connector
  linkedTickets: LinkedTicket[]
}

const col = createColumnHelper<FeedbackRow>()

const SOURCE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  SLACK:     Slack,
  INTERCOM:  MessageCircle,
  G2:        Star,
  TRUSTRADIUS: Star,
  ZENDESK:   HelpCircle,
  GONG:      Headphones,
}

const TIER_ABBR: Record<string, string> = {
  ENTERPRISE: "ENT",
  GROWTH:     "GRO",
  STARTER:    "STR",
}

export const feedbackColumns = [
  col.display({
    id: "select",
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllPageRowsSelected()}
        onChange={table.getToggleAllPageRowsSelectedHandler()}
        className="h-4 w-4 rounded border-border"
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
        onClick={(e) => e.stopPropagation()}
        className="h-4 w-4 rounded border-border"
        aria-label="Select row"
      />
    ),
    size: 40,
    enableSorting: false,
  }),

  col.accessor("customer", {
    id: "customer",
    header: "Customer",
    cell: ({ getValue }) => {
      const customer = getValue()
      if (!customer) return <span className="text-muted-foreground">—</span>
      const tier = customer.tier as string
      return (
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
            {customer.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{customer.name}</p>
            <div className="flex items-center gap-1">
              <Badge variant={tier.toLowerCase() as "enterprise" | "growth" | "starter"} className="text-[9px] px-1 py-0">
                {TIER_ABBR[tier] ?? tier}
              </Badge>
              {customer.arrCents && (
                <span className="text-[10px] text-muted-foreground">{formatArr(customer.arrCents)}</span>
              )}
            </div>
          </div>
        </div>
      )
    },
    size: 180,
  }),

  col.accessor("theme", {
    id: "theme",
    header: "Theme",
    cell: ({ getValue }) => {
      const theme = getValue()
      if (!theme) return <span className="text-muted-foreground text-xs">—</span>
      return (
        <div className="flex items-center gap-1 text-xs font-medium text-primary">
          <Hash className="h-3 w-3" />
          <span className="truncate">{theme.slug}</span>
        </div>
      )
    },
    size: 160,
  }),

  col.accessor("extractedSummary", {
    id: "feedback",
    header: "Feedback",
    cell: ({ getValue, row }) => {
      const summary = getValue()
      const verbatim = row.original.verbatimText
      return (
        <p className="line-clamp-2 text-sm text-foreground">
          {summary ?? verbatim}
        </p>
      )
    },
    size: 320,
  }),

  col.accessor("sourceType", {
    id: "source",
    header: "Source",
    cell: ({ getValue }) => {
      const source = getValue() as string
      const Icon = SOURCE_ICONS[source] ?? MessageSquare
      return (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="capitalize">{source.toLowerCase()}</span>
        </div>
      )
    },
    size: 110,
  }),

  col.accessor("sentiment", {
    id: "sentiment",
    header: "Sentiment",
    cell: ({ getValue }) => {
      const score = getValue()
      if (score == null) return <span className="text-muted-foreground text-xs">—</span>
      const color =
        score > 0.3  ? "text-green-600" :
        score < -0.3 ? "text-red-500"   : "text-amber-500"
      return (
        <span className={cn("text-xs font-mono tabular-nums font-medium", color)}>
          {formatSentiment(score)}
        </span>
      )
    },
    size: 90,
  }),

  col.accessor("severity", {
    id: "severity",
    header: "Severity",
    cell: ({ getValue }) => {
      const severity = getValue() as string | null
      if (!severity) return <span className="text-muted-foreground text-xs">—</span>
      return (
        <Badge variant={severity.toLowerCase() as "high" | "medium" | "low"}>
          {severity.charAt(0) + severity.slice(1).toLowerCase()}
        </Badge>
      )
    },
    size: 90,
  }),

  col.accessor("status", {
    id: "status",
    header: "Status",
    cell: ({ getValue }) => {
      const status = getValue() as string
      return (
        <Badge variant={status.toLowerCase() as "new" | "assigned" | "resolved" | "archived"}>
          {status.charAt(0) + status.slice(1).toLowerCase()}
        </Badge>
      )
    },
    size: 90,
  }),

  col.accessor("publishedAt", {
    id: "age",
    header: "Age",
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground tabular-nums">
        {formatAge(getValue())}
      </span>
    ),
    size: 60,
  }),

  col.accessor("linkedTickets", {
    id: "ticket",
    header: "Ticket",
    cell: ({ getValue }) => {
      const tickets = getValue()
      if (!tickets?.length) return <span className="text-muted-foreground text-xs">—</span>
      const ticket = tickets[0]!
      const status = (ticket.ticketStatus ?? "").toLowerCase()
      const dotColor =
        status === "done" || status === "completed" ? "bg-green-500" :
        status === "in progress" || status === "started" ? "bg-blue-500" :
        status === "cancelled" ? "bg-muted-foreground" : "bg-amber-400"
      return (
        <a
          href={ticket.ticketUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 text-xs font-medium text-foreground hover:text-primary"
        >
          <span className={cn("h-2 w-2 rounded-full shrink-0", dotColor)} />
          <ExternalLink className="h-3 w-3 text-muted-foreground" />
        </a>
      )
    },
    size: 70,
    enableSorting: false,
  }),
]
