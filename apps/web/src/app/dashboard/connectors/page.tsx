import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { prisma } from "@voxly/db"
import { ConnectorList } from "./connector-list"

const DEV_CLERK_USER_ID = "seed_owner"

async function resolveClerkUserId(): Promise<string | null> {
  if (process.env.SKIP_AUTH === "true") return DEV_CLERK_USER_ID
  const { userId } = await auth()
  return userId
}

export default async function ConnectorsPage() {
  const userId = await resolveClerkUserId()
  if (!userId) redirect("/sign-in")

  const member = await prisma.workspaceMember.findFirst({ where: { clerkUserId: userId } })
  if (!member) redirect("/sign-in")

  const connectors = await prisma.connector.findMany({
    where: { workspaceId: member.workspaceId },
    orderBy: { createdAt: "asc" },
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">Sources</h1>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <ConnectorList workspaceId={member.workspaceId} connectors={connectors} />
      </div>
    </div>
  )
}
