import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { prisma } from "@voxly/db"
import { Sidebar } from "@/components/layout/sidebar"

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
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")

  const workspace = await getWorkspace(userId)

  // First login: workspace not yet created. Redirect to onboarding.
  // In Chunk 1 with seed data, the seed member clerkUserId is "seed_owner".
  // Real users hit this path until we implement workspace creation (Chunk 3).
  if (!workspace) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Setting up your workspace… (no workspace found for this user)
        </p>
      </div>
    )
  }

  const inboxCount = await getInboxCount(workspace.id)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar connectors={workspace.connectors} inboxCount={inboxCount} />
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  )
}
