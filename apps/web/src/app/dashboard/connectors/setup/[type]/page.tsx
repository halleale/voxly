import { notFound, redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { SlackSetup } from "./slack-setup"
import { IntercomSetup } from "./intercom-setup"
import { HubSpotSetup } from "./hubspot-setup"

const DEV_CLERK_USER_ID = "seed_owner"

async function resolveClerkUserId(): Promise<string | null> {
  if (process.env.SKIP_AUTH === "true") return DEV_CLERK_USER_ID
  const { userId } = await auth()
  return userId
}

interface PageProps {
  params: Promise<{ type: string }>
  searchParams: Promise<{ code?: string; state?: string; error?: string }>
}

export default async function ConnectorSetupPage({ params, searchParams }: PageProps) {
  const userId = await resolveClerkUserId()
  if (!userId) redirect("/sign-in")

  const { type } = await params
  const query = await searchParams

  switch (type) {
    case "slack":
      return <SlackSetup oauthCode={query.code} oauthError={query.error} />
    case "intercom":
      return <IntercomSetup oauthCode={query.code} oauthError={query.error} />
    case "hubspot":
      return <HubSpotSetup oauthCode={query.code} oauthError={query.error} />
    default:
      notFound()
  }
}
