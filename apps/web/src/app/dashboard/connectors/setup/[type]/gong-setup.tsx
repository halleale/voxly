"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Headphones } from "lucide-react"
import { Button } from "@/components/ui/button"

interface GongSetupProps {
  oauthError?: string
}

export function GongSetup({ oauthError }: GongSetupProps) {
  const router = useRouter()
  const [accessToken, setAccessToken] = useState("")
  const [webhookSecret, setWebhookSecret] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(oauthError ?? null)

  async function handleConnect() {
    if (!accessToken || !webhookSecret) {
      setError("Access token and webhook signing key are required")
      return
    }
    setSaving(true)
    setError(null)

    try {
      const res = await fetch("/api/connectors/gong/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, webhookSecret }),
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
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 border border-blue-200">
          <Headphones className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h2 className="font-semibold">Connect Gong</h2>
          <p className="text-sm text-muted-foreground">Customer calls and transcripts</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
        <p className="font-medium">How it works:</p>
        <ul className="space-y-1 text-muted-foreground">
          <li>• Gong notifies Voxly when a call completes via webhook</li>
          <li>• Voxly fetches the full transcript via the Gong Transcript API</li>
          <li>• GPT-4o extracts only customer speech segments as feedback items</li>
          <li>• Rep speech is automatically filtered out</li>
        </ul>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Gong access token</label>
          <input
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono"
            placeholder="From Gong Settings → API"
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Webhook signing key</label>
          <input
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono"
            placeholder="From Gong Settings → Webhooks"
            type="password"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
          />
        </div>

        <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Webhook URL to add in Gong:</p>
          <p className="font-mono break-all">
            {typeof window !== "undefined" ? window.location.origin : "https://your-app.com"}/api/webhooks/&#123;connectorId&#125;
          </p>
          <p className="pt-1">Event type: <code>Call Completed</code></p>
        </div>

        <Button className="w-full" onClick={handleConnect} disabled={saving}>
          {saving ? "Connecting…" : "Connect Gong"}
        </Button>
      </div>
    </div>
  )
}
