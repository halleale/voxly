"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { GitBranch, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"

interface LinearSetupProps {
  oauthCode?: string
  oauthError?: string
}

export function LinearSetup({ oauthCode, oauthError }: LinearSetupProps) {
  const router = useRouter()

  useEffect(() => {
    if (!oauthCode) return
    fetch("/api/connectors/linear/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: oauthCode }),
    })
      .then((r) => r.json())
      .then(() => router.push("/dashboard/connectors"))
      .catch(console.error)
  }, [oauthCode, router])

  const clientId = process.env.NEXT_PUBLIC_LINEAR_CLIENT_ID ?? ""
  const redirectUri =
    typeof window !== "undefined"
      ? `${window.location.origin}/dashboard/connectors/setup/linear`
      : ""

  const authUrl =
    `https://linear.app/oauth/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=issues:create,comments:create,read`

  if (oauthCode) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Connecting Linear…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 border border-violet-200">
          <GitBranch className="h-5 w-5 text-violet-600" />
        </div>
        <div>
          <h2 className="font-semibold">Connect Linear</h2>
          <p className="text-sm text-muted-foreground">Create and link issues from feedback</p>
        </div>
      </div>

      {oauthError && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          OAuth error: {oauthError}
        </div>
      )}

      <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
        <p className="font-medium">What Voxly will do:</p>
        <ul className="space-y-1 text-muted-foreground">
          <li>• Create Linear issues pre-filled with customer context and ARR</li>
          <li>• Append additional feedback as comments on existing issues</li>
          <li>• Show issue status in the feedback table</li>
        </ul>
        <p className="text-xs text-muted-foreground pt-1">
          Voxly only creates and comments on issues — it never modifies or deletes existing issues.
        </p>
      </div>

      <Button asChild className="w-full">
        <a href={authUrl}>
          <ExternalLink className="mr-2 h-4 w-4" />
          Connect Linear
        </a>
      </Button>
    </div>
  )
}
