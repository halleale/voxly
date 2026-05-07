import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { prisma } from "@voxly/db"
import { Sidebar } from "@/components/layout/sidebar"

const DEV_CLERK_USER_ID = "seed_owner"

async function resolveClerkUserId(): Promise<string | null> {
  if (process.env.SKIP_AUTH === "true") return DEV_CLERK_USER_ID
  const { userId } = await auth()
  return userId
}

async function getWorkspace(clerkUserId: string) {
  const member = await prisma.workspaceMember.findFirst({
    where: { clerkUserId },
    include: {
      workspace: {
        include: {
          connectors: { where: { enabled: true }, orderBy: { itemCount: "desc" } },
        },
      },
    },
  })
  return member?.workspace ?? null
}

async function getInboxCount(workspaceId: string) {
  return prisma.ingestionQueue.count({
    where: { connector: { workspaceId }, status: "UNCERTAIN" },
  })
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const userId = await resolveClerkUserId()
  if (!userId) redirect("/sign-in")

  const workspace = await getWorkspace(userId as string)

  if (!workspace) {
    redirect("/onboarding")
  }

  const inboxCount = await getInboxCount(workspace.id)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar connectors={workspace.connectors} inboxCount={inboxCount} />
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  )
}
