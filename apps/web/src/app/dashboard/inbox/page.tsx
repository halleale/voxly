export const dynamic = 'force-dynamic'

import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { Inbox } from "lucide-react"
import { prisma } from "@voxly/db"
import { InboxList } from "./inbox-list"

const DEV_CLERK_USER_ID = "seed_owner"

async function resolveClerkUserId(): Promise<string | null> {
  if (process.env.SKIP_AUTH === "true") return DEV_CLERK_USER_ID
  const { userId } = await auth()
  return userId
}

export default async function InboxPage() {
  const userId = await resolveClerkUserId()
  if (!userId) redirect("/sign-in")

  const member = await prisma.workspaceMember.findFirst({
    where: { clerkUserId: userId },
    select: { workspaceId: true },
  })
  if (!member) redirect("/sign-in")

  const items = await prisma.ingestionQueue.findMany({
    where: {
      status: "UNCERTAIN",
      connector: { workspaceId: member.workspaceId },
    },
    include: { connector: { select: { type: true, name: true } } },
    orderBy: { receivedAt: "desc" },
    take: 100,
  })

  const serialized = items.map((item) => {
    const raw = item.rawPayload as Record<string, unknown>
    return {
      id:            item.id,
      externalId:    item.externalId,
      sourceType:    item.sourceType,
      connectorName: item.connector.name,
      verbatimText:  (raw.verbatimText as string | undefined) ?? "",
      authorName:    raw.authorName as string | undefined,
      externalUrl:   raw.externalUrl as string | undefined,
      publishedAt:   raw.publishedAt as string | undefined,
      receivedAt:    item.receivedAt.toISOString(),
    }
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-6 py-4">
        <Inbox className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Inbox</h1>
        {items.length > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
            {items.length}
          </span>
        )}
      </div>

      {/* Subheader */}
      <div className="border-b border-border bg-muted/30 px-6 py-2.5">
        <p className="text-xs text-muted-foreground">
          These items couldn&apos;t be automatically classified as product feedback. Review and
          approve or reject each one. Approved items enter the AI pipeline immediately.
        </p>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="mx-auto max-w-2xl">
          <InboxList initialItems={serialized} />
        </div>
      </div>
    </div>
  )
}
