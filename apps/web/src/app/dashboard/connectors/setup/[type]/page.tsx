import { notFound, redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { SlackSetup } from "./slack-setup"
import { IntercomSetup } from "./intercom-setup"
import { HubSpotSetup } from "./hubspot-setup"
import { LinearSetup } from "./linear-setup"
import { ZendeskSetup } from "./zendesk-setup"
import { G2Setup } from "./g2-setup"
import { GongSetup } from "./gong-setup"
import { CannySetup } from "./canny-setup"
import { HNSetup } from "./hn-setup"
import { JiraSetup } from "./jira-setup"

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
    case "linear":
      return <LinearSetup oauthCode={query.code} oauthError={query.error} />
    case "zendesk":
      return <ZendeskSetup oauthError={query.error} />
    case "g2":
      return <G2Setup oauthError={query.error} />
    case "gong":
      return <GongSetup oauthError={query.error} />
    case "canny":
      return <CannySetup oauthError={query.error} />
    case "hn":
      return <HNSetup oauthError={query.error} />
    case "jira":
      return <JiraSetup oauthCode={query.code} oauthError={query.error} />
    default:
      notFound()
  }
}
