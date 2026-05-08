export const dynamic = 'force-dynamic'

import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@voxly/db"
import { Zap } from "lucide-react"

const DEV_CLERK_USER_ID = "seed_owner"

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "workspace"
  )
}

async function resolveClerkUserId(): Promise<string | null> {
  if (process.env.SKIP_AUTH === "true") return DEV_CLERK_USER_ID
  const { userId } = await auth()
  return userId
}

async function createWorkspaceAction(formData: FormData) {
  "use server"

  const name = ((formData.get("name") as string) ?? "").trim()
  if (name.length < 2) return

  let uid: string | null
  if (process.env.SKIP_AUTH === "true") {
    uid = DEV_CLERK_USER_ID
  } else {
    const { userId } = await auth()
    uid = userId
  }
  if (!uid) redirect("/sign-in")

  let slug = slugify(name)
  const collision = await prisma.workspace.findUnique({ where: { slug } })
  if (collision) slug = `${slug}-${Date.now().toString(36)}`

  const workspace = await prisma.workspace.create({ data: { name, slug } })
  await prisma.workspaceMember.create({
    data: { workspaceId: workspace.id, clerkUserId: uid, email: "", role: "OWNER" },
  })

  redirect("/dashboard/feedback")
}

export default async function OnboardingPage() {
  const userId = await resolveClerkUserId()
  if (!userId) redirect("/sign-in")

  // Skip onboarding if a workspace already exists for this user
  const existing = await prisma.workspaceMember.findFirst({ where: { clerkUserId: userId } })
  if (existing) redirect("/dashboard/feedback")

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold tracking-tight">Voxly</span>
        </div>

        <h1 className="mb-1 text-xl font-semibold">Create your workspace</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          This is your team&apos;s home in Voxly. You can invite members after setup.
        </p>

        <form action={createWorkspaceAction} className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="name">
              Workspace name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="Acme Corp"
              required
              minLength={2}
              maxLength={80}
              autoFocus
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:ring-offset-2"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Create workspace
          </button>
        </form>
      </div>
    </div>
  )
}
