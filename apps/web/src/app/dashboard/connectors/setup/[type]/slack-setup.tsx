"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Slack, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"

interface SlackSetupProps {
  oauthCode?: string
  oauthError?: string
}

const SLACK_SCOPES = [
  "channels:history",
  "channels:read",
  "groups:history",
  "groups:read",
  "users:read",
  "users:read.email",
].join(",")

export function SlackSetup({ oauthCode, oauthError }: SlackSetupProps) {
  const router = useRouter()

  // If we have an OAuth code, exchange it via API route
  useEffect(() => {
    if (!oauthCode) return
    fetch("/api/connectors/slack/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: oauthCode }),
    })
      .then((r) => r.json())
      .then(() => router.push("/dashboard/connectors"))
      .catch(console.error)
  }, [oauthCode, router])

  const clientId = process.env.NEXT_PUBLIC_SLACK_CLIENT_ID ?? ""
  const redirectUri = typeof window !== "undefined"
    ? `${window.location.origin}/dashboard/connectors/setup/slack`
    : ""
  const slackAuthUrl =
    `https://slack.com/oauth/v2/authorize?client_id=${clientId}` +
    `&scope=${SLACK_SCOPES}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`

  if (oauthCode) {
    return (
      <SetupShell title="Connecting Slack...">
        <p className="text-sm text-muted-foreground">
          Exchanging authorization code…
        </p>
      </SetupShell>
    )
  }

  if (oauthError) {
    return (
      <SetupShell title="Slack connection failed">
        <p className="text-sm text-destructive">
          OAuth error: {oauthError}. Please try again.
        </p>
        <Button className="mt-4" onClick={() => router.push("/dashboard/connectors")}>
          Back to sources
        </Button>
      </SetupShell>
    )
  }

  return (
    <SetupShell title="Connect Slack">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Connect your Slack workspace to ingest feedback from customer channels.
          After connecting, you can choose which channels Voxly should monitor.
        </p>

        <div className="rounded-lg bg-muted/50 border border-border p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Required permissions
          </p>
          {[
            "Read messages from channels",
            "List channels in your workspace",
            "Look up user profiles (name + email)",
          ].map((perm) => (
            <div key={perm} className="flex items-center gap-2 text-sm">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              {perm}
            </div>
          ))}
        </div>

        <a href={slackAuthUrl} className="block">
          <Button className="w-full gap-2">
            <Slack className="h-4 w-4" />
            Connect with Slack
            <ExternalLink className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </a>
      </div>
    </SetupShell>
  )
}

function SetupShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
      <div className="flex-1 flex items-start justify-center p-6">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  )
}
