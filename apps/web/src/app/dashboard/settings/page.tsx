import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { prisma } from "@voxly/db"
import { SettingsClient } from "./settings-client"

const DEV_CLERK_USER_ID = "seed_owner"

async function resolveClerkUserId(): Promise<string | null> {
  if (process.env.SKIP_AUTH === "true") return DEV_CLERK_USER_ID
  const { userId } = await auth()
  return userId
}

export default async function SettingsPage() {
  const userId = await resolveClerkUserId()
  if (!userId) redirect("/sign-in")

  const member = await prisma.workspaceMember.findFirst({
    where: { clerkUserId: userId },
    select: { workspaceId: true, role: true },
  })

  if (!member) redirect("/onboarding")

  return <SettingsClient workspaceId={member.workspaceId} memberRole={member.role} />
}
