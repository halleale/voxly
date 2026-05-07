"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Building2, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"

interface HubSpotSetupProps {
  oauthCode?: string
  oauthError?: string
}

const HUBSPOT_SCOPES = [
  "crm.objects.companies.read",
  "crm.objects.contacts.read",
].join(" ")

export function HubSpotSetup({ oauthCode, oauthError }: HubSpotSetupProps) {
  const router = useRouter()

  useEffect(() => {
    if (!oauthCode) return
    fetch("/api/connectors/hubspot/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: oauthCode }),
    })
      .then((r) => r.json())
      .then(() => router.push("/dashboard/connectors"))
      .catch(console.error)
  }, [oauthCode, router])

  const clientId = process.env.NEXT_PUBLIC_HUBSPOT_CLIENT_ID ?? ""
  const redirectUri =
    typeof window !== "undefined"
      ? `${window.location.origin}/dashboard/connectors/setup/hubspot`
      : ""

  const authUrl =
    `https://app.hubspot.com/oauth/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(HUBSPOT_SCOPES)}`

  if (oauthCode) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Connecting HubSpot…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 border border-orange-200">
          <Building2 className="h-5 w-5 text-orange-600" />
        </div>
        <div>
          <h2 className="font-semibold">Connect HubSpot CRM</h2>
          <p className="text-sm text-muted-foreground">Sync company ARR and tier data</p>
        </div>
      </div>

      {oauthError && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          OAuth error: {oauthError}
        </div>
      )}

      <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
        <p className="font-medium">What Voxly will sync:</p>
        <ul className="space-y-1 text-muted-foreground">
          <li>• Company names and domains</li>
          <li>• Annual Recurring Revenue (ARR)</li>
          <li>• Auto-assigns Enterprise / Growth / Starter tier</li>
        </ul>
        <p className="text-xs text-muted-foreground pt-1">
          Synced daily. Feedback from matched domains will automatically show customer context.
        </p>
      </div>

      <Button asChild className="w-full">
        <a href={authUrl}>
          <ExternalLink className="mr-2 h-4 w-4" />
          Connect HubSpot
        </a>
      </Button>
    </div>
  )
}
