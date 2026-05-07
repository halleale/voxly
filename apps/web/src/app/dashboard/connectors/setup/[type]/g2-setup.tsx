"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Star } from "lucide-react"
import { Button } from "@/components/ui/button"

interface G2SetupProps {
  oauthError?: string
}

export function G2Setup({ oauthError }: G2SetupProps) {
  const router = useRouter()
  const [apiToken, setApiToken] = useState("")
  const [productId, setProductId] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(oauthError ?? null)

  async function handleConnect() {
    if (!apiToken || !productId) {
      setError("API token and product ID are required")
      return
    }
    setSaving(true)
    setError(null)

    try {
      const res = await fetch("/api/connectors/g2/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiToken, productId }),
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
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 border border-orange-200">
          <Star className="h-5 w-5 text-orange-600" />
        </div>
        <div>
          <h2 className="font-semibold">Connect G2</h2>
          <p className="text-sm text-muted-foreground">G2 product reviews — polled daily</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
        <p className="font-medium">What Voxly will do:</p>
        <ul className="space-y-1 text-muted-foreground">
          <li>• Pull new reviews daily via the G2 Vendor API</li>
          <li>• Extract verbatim text from review title + body</li>
          <li>• Score sentiment from review content (star rating used as signal)</li>
        </ul>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">G2 API token</label>
          <input
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono"
            placeholder="From G2 Vendor → Settings → API"
            type="password"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">G2 product ID</label>
          <input
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono"
            placeholder="e.g. a1b2c3d4-..."
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Found in your G2 product URL: g2.com/products/&#123;slug&#125;/reviews
          </p>
        </div>

        <Button className="w-full" onClick={handleConnect} disabled={saving}>
          {saving ? "Connecting…" : "Connect G2"}
        </Button>
      </div>
    </div>
  )
}
