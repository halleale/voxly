"use client"

import {
  X, ExternalLink, Hash, MessageSquare, Slack, MessageCircle,
  Star, HelpCircle, Headphones, Archive, UserCheck, Ticket,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatAge, formatArr, formatSentiment, cn } from "@/lib/utils"
import type { FeedbackRow } from "./columns"

const SOURCE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  SLACK:       Slack,
  INTERCOM:    MessageCircle,
  G2:          Star,
  TRUSTRADIUS: Star,
  ZENDESK:     HelpCircle,
  GONG:        Headphones,
}

const TIER_ABBR: Record<string, string> = {
  ENTERPRISE: "ENT",
  GROWTH:     "GRO",
  STARTER:    "STR",
}

interface MetaRowProps {
  label: string
  children: React.ReactNode
}

function MetaRow({ label, children }: MetaRowProps) {
  return (
    <>
      <dt className="text-muted-foreground self-center">{label}</dt>
      <dd>{children}</dd>
    </>
  )
}

interface FeedbackDetailPanelProps {
  item: FeedbackRow
  onClose: () => void
}

export function FeedbackDetailPanel({ item, onClose }: FeedbackDetailPanelProps) {
  const SourceIcon = SOURCE_ICONS[item.sourceType] ?? MessageSquare

  const sentimentColor =
    item.sentiment == null  ? "text-muted-foreground" :
    item.sentiment > 0.3    ? "text-green-600"         :
    item.sentiment < -0.3   ? "text-red-500"           : "text-amber-500"

  return (
    <div className="flex h-full w-[440px] shrink-0 flex-col border-l border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <SourceIcon className="h-4 w-4 shrink-0" />
          <span className="capitalize">{item.sourceType.toLowerCase()}</span>
          {item.externalUrl && (
            <a
              href={item.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="ml-0.5 hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7 text-muted-foreground">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-5 p-5">

          {/* Verbatim */}
          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Verbatim
            </p>
            <blockquote className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm leading-relaxed text-foreground">
              {item.verbatimText}
            </blockquote>
          </section>

          {/* AI Summary card — placeholder when extractedSummary is null */}
          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              AI Summary
            </p>
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-relaxed">
              {item.extractedSummary ?? (
                <span className="text-muted-foreground italic">
                  AI summary will appear here once the item has been processed.
                </span>
              )}
            </div>
          </section>

          {/* Metadata */}
          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Details
            </p>
            <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2.5 text-sm">
              {item.customer && (
                <>
                  <MetaRow label="Customer">
                    <span className="font-medium">{item.customer.name}</span>
                  </MetaRow>
                  <MetaRow label="Tier · ARR">
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant={item.customer.tier.toLowerCase() as "enterprise" | "growth" | "starter"}
                        className="text-[9px] px-1 py-0"
                      >
                        {TIER_ABBR[item.customer.tier] ?? item.customer.tier}
                      </Badge>
                      {item.customer.arrCents && (
                        <span className="text-muted-foreground">{formatArr(item.customer.arrCents)}</span>
                      )}
                    </div>
                  </MetaRow>
                </>
              )}

              <MetaRow label="Theme">
                {item.theme ? (
                  <div className="flex items-center gap-1 font-medium text-primary">
                    <Hash className="h-3 w-3 shrink-0" />
                    <span>{item.theme.slug}</span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </MetaRow>

              <MetaRow label="Sentiment">
                <span className={cn("font-mono text-xs font-medium", sentimentColor)}>
                  {formatSentiment(item.sentiment)}
                </span>
              </MetaRow>

              <MetaRow label="Severity">
                {item.severity ? (
                  <Badge variant={item.severity.toLowerCase() as "high" | "medium" | "low"}>
                    {item.severity.charAt(0) + item.severity.slice(1).toLowerCase()}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </MetaRow>

              <MetaRow label="Status">
                <Badge variant={item.status.toLowerCase() as "new" | "assigned" | "resolved" | "archived"}>
                  {item.status.charAt(0) + item.status.slice(1).toLowerCase()}
                </Badge>
              </MetaRow>

              <MetaRow label="Assignee">
                <span className="text-muted-foreground">{item.assignee?.name ?? "—"}</span>
              </MetaRow>

              <MetaRow label="Linked issue">
                <span className="text-muted-foreground">—</span>
              </MetaRow>

              <MetaRow label="Age">
                <span className="text-muted-foreground">{formatAge(item.publishedAt)}</span>
              </MetaRow>
            </dl>
          </section>

          {/* Actions */}
          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Actions
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1.5">
                <UserCheck className="h-3.5 w-3.5" /> Assign
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Archive className="h-3.5 w-3.5" /> Archive
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Ticket className="h-3.5 w-3.5" /> Create ticket
              </Button>
            </div>
          </section>

          {/* Activity log */}
          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Activity
            </p>
            <p className="text-xs text-muted-foreground">No activity yet.</p>
          </section>

        </div>
      </div>
    </div>
  )
}
