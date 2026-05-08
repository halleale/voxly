"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"

interface RedditSetupProps {
  oauthError?: string
}

export function RedditSetup({ oauthError }: RedditSetupProps) {
  const router = useRouter()
  const [subreddits, setSubreddits] = useState("")
  const [keywords, setKeywords] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(oauthError ?? null)

  async function handleConnect() {
    const subs = subreddits
      .split(",")
      .map((s) => s.trim().replace(/^r\//, ""))
      .filter(Boolean)

    if (subs.length === 0) {
      setError("At least one subreddit is required")
      return
    }

    const kws = keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean)

    setSaving(true)
    setError(null)

    try {
      const res = await fetch("/api/connectors/reddit/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subreddits: subs, keywords: kws }),
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
          <MessageSquare className="h-5 w-5 text-orange-600" />
        </div>
        <div>
          <h2 className="font-semibold">Connect Reddit</h2>
          <p className="text-sm text-muted-foreground">Monitor subreddits — polled hourly</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
        <p className="font-medium">How it works:</p>
        <ul className="space-y-1 text-muted-foreground">
          <li>• Voxly polls subreddits hourly via Reddit&apos;s public JSON API</li>
          <li>• No Reddit account required for public subreddits</li>
          <li>• Stage 3/4 relevance filtering removes off-topic posts</li>
          <li>• Keywords filter posts that mention your product by name</li>
        </ul>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Subreddits to monitor</label>
          <input
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            placeholder="SaaS, startups, productivity"
            value={subreddits}
            onChange={(e) => setSubreddits(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated, without r/. Example: SaaS, startups, ProductManagement
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Keywords (optional)</label>
          <input
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            placeholder="YourProduct, yourproduct.com"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated. When provided, also searches each subreddit for these keywords.
          </p>
        </div>

        <Button className="w-full" onClick={handleConnect} disabled={saving}>
          {saving ? "Connecting…" : "Connect Reddit"}
        </Button>
      </div>
    </div>
  )
}
