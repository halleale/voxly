"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { HelpCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ZendeskSetupProps {
  oauthError?: string
}

export function ZendeskSetup({ oauthError }: ZendeskSetupProps) {
  const router = useRouter()
  const [subdomain, setSubdomain] = useState("")
  const [apiToken, setApiToken] = useState("")
  const [adminEmail, setAdminEmail] = useState("")
  const [webhookSecret, setWebhookSecret] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(oauthError ?? null)

  async function handleConnect() {
    if (!subdomain || !apiToken || !adminEmail || !webhookSecret) {
      setError("All fields are required")
      return
    }
    setSaving(true)
    setError(null)

    try {
      const res = await fetch("/api/connectors/zendesk/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain, apiToken, adminEmail, webhookSecret }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Connection failed")
      router.push("/dashboard/connectors")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed")
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 border border-green-200">
          <HelpCircle className="h-5 w-5 text-green-600" />
        </div>
        <div>
          <h2 className="font-semibold">Connect Zendesk</h2>
          <p className="text-sm text-muted-foreground">Support tickets and CSAT scores</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Zendesk subdomain</label>
          <div className="flex items-center gap-2">
            <input
              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              placeholder="yourcompany"
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
            />
            <span className="text-sm text-muted-foreground">.zendesk.com</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Admin email</label>
          <input
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            placeholder="admin@yourcompany.com"
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">API token</label>
          <input
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono"
            placeholder="Generated in Zendesk Admin → API"
            type="password"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Webhook signing secret</label>
          <input
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono"
            placeholder="From Zendesk webhook settings"
            type="password"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
          />
        </div>

        <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Webhook URL to add in Zendesk:</p>
          <p className="font-mono break-all">
            {typeof window !== "undefined" ? window.location.origin : "https://your-app.com"}/api/webhooks/&#123;connectorId&#125;
          </p>
          <p className="pt-1">Events: <code>ticket.created</code>, <code>ticket.updated</code></p>
        </div>

        <Button className="w-full" onClick={handleConnect} disabled={saving}>
          {saving ? "Connecting…" : "Connect Zendesk"}
        </Button>
      </div>
    </div>
  )
}
