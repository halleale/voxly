"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  MessageSquare,
  Tag,
  GitBranch,
  Inbox,
  Settings,
  Slack,
  MessageCircle,
  Star,
  Headphones,
  HelpCircle,
  Building2,
  Zap,
  PlugZap,
  BarChart3,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { Connector } from "@voxly/db"

const SOURCE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  SLACK:     Slack,
  INTERCOM:  MessageCircle,
  HUBSPOT:   Building2,
  LINEAR:    GitBranch,
  G2:        Star,
  ZENDESK:   HelpCircle,
  GONG:      Headphones,
}

const NAV_ITEMS = [
  { label: "Feedback",   href: "/dashboard/feedback",   icon: MessageSquare },
  { label: "Sources",    href: "/dashboard/connectors", icon: PlugZap },
  { label: "Themes",     href: "/dashboard/themes",     icon: Tag },
  { label: "Workflows",  href: "/dashboard/workflows",  icon: GitBranch },
  { label: "Analytics",  href: "/dashboard/analytics",  icon: BarChart3 },
]

interface SidebarProps {
  connectors: (Connector & { _count?: { feedbackItems: number } })[]
  inboxCount: number
}

export function Sidebar({ connectors, inboxCount }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-border bg-card">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 px-4 border-b border-border">
        <Zap className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold tracking-tight">Voxly</span>
      </div>

      {/* Main nav */}
      <nav className="flex flex-col gap-0.5 p-2">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "sidebar-nav-item",
              pathname.startsWith(href) && "active"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}

        {/* Inbox with count badge */}
        <Link
          href="/dashboard/inbox"
          className={cn("sidebar-nav-item", pathname.startsWith("/dashboard/inbox") && "active")}
        >
          <Inbox className="h-4 w-4 shrink-0" />
          Inbox
          {inboxCount > 0 && (
            <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {inboxCount}
            </span>
          )}
        </Link>
      </nav>

      {/* Connectors section */}
      <div className="mt-4 px-3">
        <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Sources
        </p>
        <div className="flex flex-col gap-0.5">
          {connectors.map((connector) => {
            const Icon = SOURCE_ICONS[connector.type] ?? MessageSquare
            return (
              <div
                key={connector.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground"
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{connector.name}</span>
                <span className="ml-auto tabular-nums text-[10px]">{connector.itemCount}</span>
              </div>
            )
          })}
          <Link
            href="/dashboard/connectors"
            className="mt-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            + Add source
          </Link>
        </div>
      </div>

      {/* Settings at bottom */}
      <div className="mt-auto p-2 border-t border-border">
        <Link href="/dashboard/settings" className="sidebar-nav-item">
          <Settings className="h-4 w-4 shrink-0" />
          Settings
        </Link>
      </div>
    </aside>
  )
}
