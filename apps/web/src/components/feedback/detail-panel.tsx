"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  X, ExternalLink, Hash, User, Tag, Zap, Clock, Link2,
  CheckCircle2, Archive, ChevronDown, Loader2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatAge, formatArr, formatSentiment, cn } from "@/lib/utils"
import type { FeedbackRow } from "./columns"

interface Member { id: string; name: string | null; email: string }

interface DetailPanelProps {
  item: FeedbackRow | null
  onClose: () => void
  workspaceId: string
  members: Member[]
  apiBase: string
  hasLinear: boolean
}

const SOURCE_LABELS: Record<string, string> = {
  SLACK: "Slack", INTERCOM: "Intercom", ZENDESK: "Zendesk",
  G2: "G2", TRUSTRADIUS: "TrustRadius", GONG: "Gong",
  CANNY: "Canny", HN: "Hacker News", REDDIT: "Reddit",
  HUBSPOT: "HubSpot", SALESFORCE: "Salesforce", API: "API",
}

const TIER_ABBR: Record<string, string> = {
  ENTERPRISE: "ENT", GROWTH: "GRO", STARTER: "STR",
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/60 last:border-0">
      <span className="w-24 shrink-0 text-xs text-muted-foreground pt-0.5">{label}</span>
      <span className="text-xs font-medium flex-1 min-w-0">{children}</span>
    </div>
  )
}

export function DetailPanel({ item, onClose, workspaceId, members, apiBase, hasLinear }: DetailPanelProps) {
  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-background/60 backdrop-blur-sm transition-opacity duration-200",
          item ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-[480px] flex-col bg-card border-l border-border shadow-2xl transition-transform duration-200 ease-out",
          item ? "translate-x-0" : "translate-x-full",
        )}
      >
        {item && (
          <PanelContent
            item={item}
            onClose={onClose}
            workspaceId={workspaceId}
            members={members}
            apiBase={apiBase}
            hasLinear={hasLinear}
          />
        )}
      </div>
    </>
  )
}

function PanelContent({
  item,
  onClose,
  workspaceId,
  members,
  apiBase,
  hasLinear,
}: {
  item: FeedbackRow
  onClose: () => void
  workspaceId: string
  members: Member[]
  apiBase: string
  hasLinear: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [assignOpen, setAssignOpen] = useState(false)
  const [ticketOpen, setTicketOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const sentiment = item.sentiment as number | null
  const sentimentColor =
    sentiment == null ? "text-muted-foreground" :
    sentiment > 0.3   ? "text-green-600" :
    sentiment < -0.3  ? "text-red-500"   : "text-amber-500"

  async function callApi(path: string, body: object) {
    setActionError(null)
    const res = await fetch(`${apiBase}/api/workspaces/${workspaceId}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }))
      throw new Error((err as { error?: string }).error ?? "Request failed")
    }
    return res.json()
  }

  function refresh() {
    startTransition(() => router.refresh())
  }

  async function handleAssign(assigneeId: string | null) {
    setAssignOpen(false)
    try {
      await callApi(`/feedback/${item.id}/assign`, { assigneeId })
      refresh()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleStatus(status: string) {
    try {
      await callApi(`/feedback/${item.id}/status`, { status })
      refresh()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleCreateTicket() {
    setTicketOpen(false)
    try {
      await callApi(`/feedback/${item.id}/create-ticket`, { provider: "LINEAR" })
      refresh()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    }
  }

  const linkedTicket = item.linkedTickets?.[0]
  const ticketStatus = (linkedTicket?.ticketStatus ?? "").toLowerCase()
  const ticketDotColor =
    ticketStatus === "done" || ticketStatus === "completed" ? "bg-green-500" :
    ticketStatus === "in progress" || ticketStatus === "started" ? "bg-blue-500" :
    "bg-amber-400"

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Badge variant={(item.status as string).toLowerCase() as "new" | "assigned" | "resolved" | "archived"}>
            {item.status.charAt(0) + (item.status as string).slice(1).toLowerCase()}
          </Badge>
          {item.severity && (
            <Badge variant={(item.severity as string).toLowerCase() as "high" | "medium" | "low"}>
              {(item.severity as string).charAt(0) + (item.severity as string).slice(1).toLowerCase()}
            </Badge>
          )}
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {actionError && (
        <div className="mx-5 mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {actionError}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* AI Summary Card */}
        <div className="mx-5 mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">AI Summary</span>
          </div>
          <p className="text-sm text-foreground leading-relaxed">
            {item.extractedSummary ?? (
              <span className="text-muted-foreground italic">
                AI summary will be generated after the AI pipeline processes this item.
              </span>
            )}
          </p>
          {item.customer && (
            <p className="mt-2 text-xs text-muted-foreground">
              {item.customer.name}
              {item.customer.tier && <> · <span className="font-medium">{TIER_ABBR[item.customer.tier] ?? item.customer.tier}</span></>}
              {item.customer.arrCents && <> · <span className="font-medium">{formatArr(item.customer.arrCents)} ARR</span></>}
              {item.theme && <> · clustered to <span className="font-medium text-primary">#{item.theme.slug}</span></>}
            </p>
          )}
        </div>

        {/* Verbatim Text */}
        <div className="mx-5 mt-4">
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Verbatim</p>
          <blockquote className="rounded-lg bg-muted/50 p-4 text-sm leading-relaxed border-l-2 border-primary/40 text-foreground">
            {item.verbatimText}
          </blockquote>
          {item.externalUrl && (
            <a
              href={item.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              View original source
            </a>
          )}
        </div>

        {/* Metadata */}
        <div className="mx-5 mt-5">
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Details</p>
          <div className="rounded-lg border border-border px-3 py-1">
            <MetaRow label="Source">
              {SOURCE_LABELS[item.sourceType as string] ?? item.sourceType}
            </MetaRow>
            <MetaRow label="Customer">
              {item.customer ? (
                <span className="flex items-center gap-2">
                  <span>{item.customer.name}</span>
                  {item.customer.tier && (
                    <Badge variant={(item.customer.tier as string).toLowerCase() as "enterprise" | "growth" | "starter"} className="text-[9px] px-1 py-0">
                      {TIER_ABBR[item.customer.tier as string] ?? item.customer.tier}
                    </Badge>
                  )}
                  {item.customer.arrCents && (
                    <span className="text-muted-foreground font-normal">{formatArr(item.customer.arrCents)}</span>
                  )}
                </span>
              ) : <span className="text-muted-foreground font-normal">—</span>}
            </MetaRow>
            <MetaRow label="Theme">
              {item.theme ? (
                <span className="flex items-center gap-1 text-primary">
                  <Hash className="h-3 w-3" />
                  {item.theme.slug}
                  {item.themeConfidence != null && (
                    <span className="text-muted-foreground font-normal ml-1">
                      {Math.round((item.themeConfidence as number) * 100)}% confidence
                    </span>
                  )}
                </span>
              ) : <span className="text-muted-foreground font-normal">—</span>}
            </MetaRow>
            <MetaRow label="Sentiment">
              <span className={cn("font-mono", sentimentColor)}>
                {formatSentiment(sentiment)}
              </span>
            </MetaRow>
            <MetaRow label="Severity">
              {item.severity ? (
                <Badge variant={(item.severity as string).toLowerCase() as "high" | "medium" | "low"}>
                  {(item.severity as string).charAt(0) + (item.severity as string).slice(1).toLowerCase()}
                </Badge>
              ) : <span className="text-muted-foreground font-normal">—</span>}
            </MetaRow>
            <MetaRow label="Status">
              <Badge variant={(item.status as string).toLowerCase() as "new" | "assigned" | "resolved" | "archived"}>
                {(item.status as string).charAt(0) + (item.status as string).slice(1).toLowerCase()}
              </Badge>
            </MetaRow>
            <MetaRow label="Assignee">
              {item.assignee ? (
                <span className="flex items-center gap-1.5">
                  <User className="h-3 w-3 text-muted-foreground" />
                  {item.assignee.name ?? item.assignee.email}
                </span>
              ) : <span className="text-muted-foreground font-normal">—</span>}
            </MetaRow>
            <MetaRow label="Linked issue">
              {linkedTicket ? (
                <a
                  href={linkedTicket.ticketUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 hover:text-primary"
                >
                  <span className={cn("h-2 w-2 rounded-full shrink-0", ticketDotColor)} />
                  <span className="font-mono text-xs">{linkedTicket.ticketTitle?.slice(0, 40) ?? linkedTicket.ticketId}</span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </a>
              ) : <span className="text-muted-foreground font-normal">—</span>}
            </MetaRow>
            <MetaRow label="Age">
              <span className="flex items-center gap-1.5 text-muted-foreground font-normal">
                <Clock className="h-3 w-3" />
                {formatAge(item.publishedAt)}
              </span>
            </MetaRow>
          </div>
        </div>

        {/* Actions */}
        <div className="mx-5 mt-5">
          <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</p>
          <div className="flex flex-wrap gap-2">

            {/* Assign dropdown */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setAssignOpen((v) => !v)}
                disabled={isPending}
              >
                <User className="h-3.5 w-3.5" /> Assign <ChevronDown className="h-3 w-3 ml-0.5" />
              </Button>
              {assignOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setAssignOpen(false)} />
                  <div className="absolute left-0 top-full z-40 mt-1 w-52 rounded-lg border border-border bg-card shadow-xl overflow-hidden">
                    <button
                      className="w-full px-3 py-2 text-left text-xs hover:bg-muted text-muted-foreground"
                      onClick={() => handleAssign(null)}
                    >
                      Unassign
                    </button>
                    {members.map((m) => (
                      <button
                        key={m.id}
                        className="w-full px-3 py-2 text-left text-xs hover:bg-muted"
                        onClick={() => handleAssign(m.id)}
                      >
                        {m.name ?? m.email}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Create Linear ticket */}
            {hasLinear && !linkedTicket && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={handleCreateTicket}
                disabled={isPending}
              >
                <Link2 className="h-3.5 w-3.5" /> Create ticket
              </Button>
            )}

            {/* Status transitions */}
            {item.status !== "RESOLVED" && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => handleStatus("RESOLVED")}
                disabled={isPending}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
              </Button>
            )}

            {item.status !== "ARCHIVED" && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs text-muted-foreground"
                onClick={() => handleStatus("ARCHIVED")}
                disabled={isPending}
              >
                <Archive className="h-3.5 w-3.5" /> Archive
              </Button>
            )}

            {item.status === "ARCHIVED" && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => handleStatus("NEW")}
                disabled={isPending}
              >
                Restore
              </Button>
            )}

            {/* Merge into theme placeholder */}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              disabled
              title="Merge into theme (available in Themes page)"
            >
              <Tag className="h-3.5 w-3.5" /> Merge into theme
            </Button>
          </div>
        </div>

        {/* Activity Log */}
        <div className="mx-5 mt-5 mb-6">
          <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Activity</p>
          <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Ingested {formatAge(item.ingestedAt)} ago · No activity yet
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
