"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { MessageCircle, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"

interface IntercomSetupProps {
  oauthCode?: string
  oauthError?: string
}

export function IntercomSetup({ oauthCode, oauthError }: IntercomSetupProps) {
  const router = useRouter()

  useEffect(() => {
    if (!oauthCode) return
    fetch("/api/connectors/intercom/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: oauthCode }),
    })
      .then((r) => r.json())
      .then(() => router.push("/dashboard/connectors"))
      .catch(console.error)
  }, [oauthCode, router])

  const clientId = process.env.NEXT_PUBLIC_INTERCOM_CLIENT_ID ?? ""
  const redirectUri = typeof window !== "undefined"
    ? `${window.location.origin}/dashboard/connectors/setup/intercom`
    : ""
  const intercomAuthUrl =
    `https://app.intercom.com/oauth?client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`

  if (oauthCode) {
    return (
      <SetupShell title="Connecting Intercom...">
        <p className="text-sm text-muted-foreground">
          Exchanging authorization code…
        </p>
      </SetupShell>
    )
  }

  if (oauthError) {
    return (
      <SetupShell title="Intercom connection failed">
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
    <SetupShell title="Connect Intercom">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Connect Intercom to ingest support conversations and feedback from
          your customers. Voxly will filter for product feedback automatically.
        </p>

        <div className="rounded-lg bg-muted/50 border border-border p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            What Voxly ingests
          </p>
          {[
            "New conversations created by users",
            "User replies on open conversations",
            "Filters out bot and automated messages",
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 text-sm">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              {item}
            </div>
          ))}
        </div>

        <a href={intercomAuthUrl} className="block">
          <Button className="w-full gap-2">
            <MessageCircle className="h-4 w-4" />
            Connect with Intercom
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
