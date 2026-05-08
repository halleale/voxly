"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Ticket } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"

interface JiraSetupProps {
  oauthCode?: string
  oauthError?: string
}

export function JiraSetup({ oauthCode, oauthError }: JiraSetupProps) {
  const router = useRouter()

  useEffect(() => {
    if (!oauthCode) return
    fetch("/api/connectors/jira/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: oauthCode }),
    })
      .then((r) => r.json())
      .then(() => router.push("/dashboard/connectors"))
      .catch(console.error)
  }, [oauthCode, router])

  const clientId = process.env.NEXT_PUBLIC_JIRA_CLIENT_ID ?? ""
  const redirectUri =
    typeof window !== "undefined"
      ? `${window.location.origin}/dashboard/connectors/setup/jira`
      : ""

  const authUrl =
    `https://auth.atlassian.com/authorize` +
    `?audience=api.atlassian.com` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&scope=${encodeURIComponent("read:jira-user read:jira-work write:jira-work offline_access")}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&prompt=consent`

  if (oauthCode) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Connecting Jira…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 border border-blue-200">
          <Ticket className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h2 className="font-semibold">Connect Jira</h2>
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
          <li>• Create Jira issues pre-filled with customer context and ARR</li>
          <li>• Append additional feedback as comments on existing issues</li>
          <li>• Sync issue status back to the feedback table bi-directionally</li>
        </ul>
        <p className="text-xs text-muted-foreground pt-1">
          Voxly only creates and comments on issues — it never modifies or deletes existing issues.
        </p>
      </div>

      <a href={authUrl} className={buttonVariants({ className: "w-full" })}>Connect with Atlassian</a>
    </div>
  )
}
