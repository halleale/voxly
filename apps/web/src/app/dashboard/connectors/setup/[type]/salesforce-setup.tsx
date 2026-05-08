"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

interface SalesforceSetupProps {
  oauthCode?: string
  oauthError?: string
}

export function SalesforceSetup({ oauthCode, oauthError }: SalesforceSetupProps) {
  const router = useRouter()
  const [status, setStatus] = useState<"idle" | "exchanging" | "done" | "error">("idle")
  const [error, setError] = useState(oauthError ?? "")

  useEffect(() => {
    if (!oauthCode) return
    setStatus("exchanging")

    fetch("/api/connectors/salesforce/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: oauthCode }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error((data as { error?: string }).error ?? "Connection failed")
        }
        setStatus("done")
        setTimeout(() => router.push("/dashboard/connectors"), 1500)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setStatus("error")
      })
  }, [oauthCode, router])

  function startOAuth() {
    const clientId = process.env.NEXT_PUBLIC_SALESFORCE_CLIENT_ID ?? ""
    const redirectUri = `${window.location.origin}/dashboard/connectors/setup/salesforce`
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
    })
    window.location.href = `https://login.salesforce.com/services/oauth2/authorize?${params}`
  }

  if (status === "done") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600 text-2xl">
          ✓
        </div>
        <p className="text-sm font-medium text-foreground">Salesforce connected successfully.</p>
      </div>
    )
  }

  if (status === "exchanging") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Connecting your Salesforce account…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-8">
      <div>
        <h1 className="text-lg font-semibold">Connect Salesforce</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sync Account ARR data so Voxly can surface revenue impact for each feedback theme.
        </p>
      </div>

      {(error || status === "error") && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error || "OAuth failed — please try again."}
        </div>
      )}

      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground space-y-2">
        <p className="font-medium text-foreground">What Voxly reads from Salesforce</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Account name and ID</li>
          <li>Annual Revenue (mapped to ARR tier)</li>
          <li>Website / domain (used to match feedback authors)</li>
        </ul>
        <p className="pt-1 text-xs">Voxly never writes to your Salesforce instance.</p>
      </div>

      <button
        onClick={startOAuth}
        className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Connect with Salesforce
      </button>
    </div>
  )
}
