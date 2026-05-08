import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { prisma } from "@voxly/db"
import { AnalyticsDashboard } from "./analytics-dashboard"

const DEV_CLERK_USER_ID = "seed_owner"

async function resolveClerkUserId(): Promise<string | null> {
  if (process.env.SKIP_AUTH === "true") return DEV_CLERK_USER_ID
  const { userId } = await auth()
  return userId
}

export default async function AnalyticsPage() {
  const userId = await resolveClerkUserId()
  if (!userId) redirect("/sign-in")

  const member = await prisma.workspaceMember.findFirst({
    where: { clerkUserId: userId },
    select: { workspaceId: true },
  })

  if (!member) redirect("/onboarding")

  return <AnalyticsDashboard workspaceId={member.workspaceId} />
}
