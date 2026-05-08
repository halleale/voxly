export const dynamic = 'force-dynamic'

import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { prisma, createRepo } from "@voxly/db"
import { FeedbackTable } from "@/components/feedback/feedback-table"
import type { FeedbackRow } from "@/components/feedback/columns"

const DEV_CLERK_USER_ID = "seed_owner"

const SYSTEM_VIEWS = [
  { id: "all",          label: "All feedback" },
  { id: "enterprise",   label: "Enterprise critical" },
  { id: "untracked",    label: "Untracked themes" },
  { id: "last7",        label: "Last 7 days" },
  { id: "unassigned",   label: "Unassigned" },
  { id: "negative",     label: "Negative sentiment" },
]

function getViewWhere(view: string): Record<string, unknown> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000)
  const map: Record<string, Record<string, unknown>> = {
    all:        {},
    enterprise: { customer: { tier: "ENTERPRISE" }, severity: "HIGH" },
    untracked:  { themeId: null },
    last7:      { publishedAt: { gte: sevenDaysAgo } },
    unassigned: { assigneeId: null, status: "NEW" },
    negative:   { sentiment: { lt: -0.3 } },
  }
  return map[view] ?? {}
}

async function resolveClerkUserId(): Promise<string | null> {
  if (process.env.SKIP_AUTH === "true") return DEV_CLERK_USER_ID
  const { userId } = await auth()
  return userId
}

async function getFeedbackData(workspaceId: string, where: Record<string, unknown>): Promise<FeedbackRow[]> {
  const repo = createRepo(prisma, workspaceId)
  const items = await repo.feedbackItem.findMany({
    where,
    include: {
      customer: true,
      theme: true,
      assignee: true,
      connector: true,
      linkedTickets: true,
    },
    orderBy: { ingestedAt: "desc" },
    take: 200,
  } as Parameters<typeof repo.feedbackItem.findMany>[0])
  return items as unknown as FeedbackRow[]
}

async function getViewCounts(workspaceId: string) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000)
  const [total, enterprise, untracked, last7, unassigned, negative] = await Promise.all([
    prisma.feedbackItem.count({ where: { workspaceId } }),
    prisma.feedbackItem.count({ where: { workspaceId, customer: { tier: "ENTERPRISE" }, severity: "HIGH" } }),
    prisma.feedbackItem.count({ where: { workspaceId, themeId: null } }),
    prisma.feedbackItem.count({ where: { workspaceId, publishedAt: { gte: sevenDaysAgo } } }),
    prisma.feedbackItem.count({ where: { workspaceId, assigneeId: null, status: "NEW" } }),
    prisma.feedbackItem.count({ where: { workspaceId, sentiment: { lt: -0.3 } } }),
  ])
  return { all: total, enterprise, untracked, last7, unassigned, negative }
}

interface PageProps {
  searchParams: Promise<{ view?: string }>
}

export default async function FeedbackPage({ searchParams }: PageProps) {
  const userId = await resolveClerkUserId()
  if (!userId) redirect("/sign-in")

  const { view = "all" } = await searchParams

  const member = await prisma.workspaceMember.findFirst({ where: { clerkUserId: userId } })
  if (!member) redirect("/sign-in")

  const [feedbackData, counts, members, linearConnector] = await Promise.all([
    getFeedbackData(member.workspaceId, getViewWhere(view)),
    getViewCounts(member.workspaceId),
    prisma.workspaceMember.findMany({
      where: { workspaceId: member.workspaceId },
      select: { id: true, name: true, email: true },
    }),
    prisma.connector.findFirst({
      where: { workspaceId: member.workspaceId, type: "LINEAR", enabled: true },
      select: { id: true },
    }),
  ])

  const countMap: Record<string, number> = {
    all:        counts.all,
    enterprise: counts.enterprise,
    untracked:  counts.untracked,
    last7:      counts.last7,
    unassigned: counts.unassigned,
    negative:   counts.negative,
  }

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">Feedback</h1>
      </div>

      {/* Smart view tabs */}
      <div className="flex items-center gap-0.5 border-b border-border px-4 overflow-x-auto">
        {SYSTEM_VIEWS.map(({ id, label }) => (
          <a
            key={id}
            href={`/dashboard/feedback?view=${id}`}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors ${
              view === id
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
              {countMap[id] ?? 0}
            </span>
          </a>
        ))}
      </div>

      {/* Table — client component receives server-fetched data */}
      <div className="flex-1 overflow-auto">
        <FeedbackTable
          data={feedbackData}
          workspaceId={member.workspaceId}
          members={members}
          apiBase={apiBase}
          hasLinear={!!linearConnector}
        />
      </div>
    </div>
  )
}
