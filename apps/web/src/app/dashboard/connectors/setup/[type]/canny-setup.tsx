"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"

interface CannySetupProps {
  oauthError?: string
}

export function CannySetup({ oauthError }: CannySetupProps) {
  const router = useRouter()
  const [apiKey, setApiKey] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(oauthError ?? null)

  async function handleConnect() {
    if (!apiKey) {
      setError("API key is required")
      return
    }
    setSaving(true)
    setError(null)

    try {
      const res = await fetch("/api/connectors/canny/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
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
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 border border-indigo-200">
          <MessageSquare className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <h2 className="font-semibold">Connect Canny</h2>
          <p className="text-sm text-muted-foreground">Feature requests and votes</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
        <p className="font-medium">What Voxly ingests:</p>
        <ul className="space-y-1 text-muted-foreground">
          <li>• New feature request posts</li>
          <li>• Comments on posts</li>
          <li>• Vote events (surfaced with the post text)</li>
        </ul>
        <p className="text-xs text-muted-foreground pt-1">
          High vote counts appear in raw payload as a signal for theme prioritization.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Canny API key</label>
          <input
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono"
            placeholder="From Canny Settings → API"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            The API key is also used to verify webhook signatures.
          </p>
        </div>

        <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Webhook URL to add in Canny:</p>
          <p className="font-mono break-all">
            {typeof window !== "undefined" ? window.location.origin : "https://your-app.com"}/api/webhooks/&#123;connectorId&#125;
          </p>
          <p className="pt-1">Events: <code>post.created</code>, <code>vote.created</code>, <code>comment.created</code></p>
        </div>

        <Button className="w-full" onClick={handleConnect} disabled={saving}>
          {saving ? "Connecting…" : "Connect Canny"}
        </Button>
      </div>
    </div>
  )
}
