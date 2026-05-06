import { PrismaClient, SourceType, FeedbackStatus, Severity, CustomerTier, ConnectorStatus } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("🌱 Seeding database...")

  // ─── Workspace ─────────────────────────────────────────────────────────────
  const workspace = await prisma.workspace.upsert({
    where: { slug: "acme" },
    update: {},
    create: { name: "Acme Corp", slug: "acme", plan: "growth" },
  })

  // ─── Workspace owner member (placeholder — real clerkUserId set on first login) ──
  const owner = await prisma.workspaceMember.upsert({
    where: { workspaceId_clerkUserId: { workspaceId: workspace.id, clerkUserId: "seed_owner" } },
    update: {},
    create: {
      workspaceId: workspace.id,
      clerkUserId: "seed_owner",
      email: "pm@acme.com",
      name: "Alex Johnson",
      role: "OWNER",
    },
  })

  const member = await prisma.workspaceMember.upsert({
    where: { workspaceId_clerkUserId: { workspaceId: workspace.id, clerkUserId: "seed_member" } },
    update: {},
    create: {
      workspaceId: workspace.id,
      clerkUserId: "seed_member",
      email: "sam@acme.com",
      name: "Sam Rivera",
      role: "MEMBER",
    },
  })

  // ─── Customers ─────────────────────────────────────────────────────────────
  const customerData = [
    { name: "Tyrell Corp",       domain: "tyrell.com",       tier: CustomerTier.ENTERPRISE, arrCents: 19500000 },
    { name: "Stark Industries",  domain: "stark.com",        tier: CustomerTier.ENTERPRISE, arrCents: 12000000 },
    { name: "Wayne Enterprises", domain: "wayneent.com",     tier: CustomerTier.ENTERPRISE, arrCents: 18000000 },
    { name: "Initech",           domain: "initech.com",      tier: CustomerTier.GROWTH,     arrCents: 4500000  },
    { name: "Umbrella Corp",     domain: "umbrella.com",     tier: CustomerTier.GROWTH,     arrCents: 3800000  },
    { name: "Initrode",          domain: "initrode.com",     tier: CustomerTier.GROWTH,     arrCents: 5200000  },
    { name: "Dunder Mifflin",    domain: "dundermifflin.com",tier: CustomerTier.STARTER,    arrCents: 800000   },
    { name: "Pied Piper",        domain: "piedpiper.com",    tier: CustomerTier.STARTER,    arrCents: 1200000  },
    { name: "Hooli",             domain: "hooli.com",        tier: CustomerTier.STARTER,    arrCents: 1500000  },
    { name: "Globex Corp",       domain: "globex.com",       tier: CustomerTier.GROWTH,     arrCents: 2900000  },
  ]

  const customers = await Promise.all(
    customerData.map((c) =>
      prisma.customer.upsert({
        where: { id: `seed_customer_${c.domain.split(".")[0]}` },
        update: {},
        create: { id: `seed_customer_${c.domain.split(".")[0]}`, workspaceId: workspace.id, ...c },
      })
    )
  )

  const [tyrell, stark, wayne, initech, umbrella, initrode, dunder, pied, hooli, globex] = customers as [
    typeof customers[0], typeof customers[0], typeof customers[0], typeof customers[0],
    typeof customers[0], typeof customers[0], typeof customers[0], typeof customers[0],
    typeof customers[0], typeof customers[0],
  ]

  // ─── Themes ─────────────────────────────────────────────────────────────────
  const themeData = [
    { slug: "mobile-app-sync",       name: "Mobile App Sync",        description: "Issues with data sync between mobile client and server" },
    { slug: "pdf-export-crashes",    name: "PDF Export Crashes",      description: "Application crashes or errors when exporting to PDF" },
    { slug: "onboarding-too-long",   name: "Onboarding Too Long",     description: "Feedback that the onboarding flow is too complex or lengthy" },
    { slug: "search-performance",    name: "Search Performance",      description: "Slow or incorrect search results across the platform" },
    { slug: "bulk-import",           name: "Bulk Import",             description: "Requests and bugs related to importing data in bulk" },
    { slug: "api-rate-limits",       name: "API Rate Limits",         description: "Complaints about API rate limit thresholds being too low" },
    { slug: "dashboard-load-time",   name: "Dashboard Load Time",     description: "Dashboard takes too long to load for large datasets" },
    { slug: "notification-settings", name: "Notification Settings",   description: "Requests for more granular notification control" },
  ]

  const themes = await Promise.all(
    themeData.map((t, i) =>
      prisma.theme.upsert({
        where: { workspaceId_slug: { workspaceId: workspace.id, slug: t.slug } },
        update: {},
        create: { id: `seed_theme_${i}`, workspaceId: workspace.id, ...t, itemCount: 0 },
      })
    )
  )

  const [tMobile, tPdf, tOnboard, tSearch, tBulk, tApi, tDash, tNotif] = themes as [
    typeof themes[0], typeof themes[0], typeof themes[0], typeof themes[0],
    typeof themes[0], typeof themes[0], typeof themes[0], typeof themes[0],
  ]

  // ─── Connectors (stubbed — no real OAuth yet) ───────────────────────────────
  const connectorData = [
    { type: SourceType.SLACK,      name: "Slack #feedback",   status: ConnectorStatus.ACTIVE,       itemCount: 18 },
    { type: SourceType.INTERCOM,   name: "Intercom",          status: ConnectorStatus.ACTIVE,       itemCount: 14 },
    { type: SourceType.G2,         name: "G2 Reviews",        status: ConnectorStatus.ACTIVE,       itemCount: 11 },
    { type: SourceType.ZENDESK,    name: "Zendesk Support",   status: ConnectorStatus.ACTIVE,       itemCount: 9  },
    { type: SourceType.GONG,       name: "Gong Calls",        status: ConnectorStatus.PENDING_AUTH, itemCount: 4  },
  ]

  const connectors = await Promise.all(
    connectorData.map((c, i) =>
      prisma.connector.upsert({
        where: { id: `seed_connector_${i}` },
        update: {},
        create: { id: `seed_connector_${i}`, workspaceId: workspace.id, configJson: {}, ...c },
      })
    )
  )

  const [cSlack, cIntercom, cG2, cZendesk, cGong] = connectors as [
    typeof connectors[0], typeof connectors[0], typeof connectors[0],
    typeof connectors[0], typeof connectors[0],
  ]

  // ─── System views ───────────────────────────────────────────────────────────
  const systemViews = [
    { name: "All feedback",       position: 0, color: "#6366f1", filtersJson: { version: 1, logic: "AND", clauses: [] } },
    { name: "Enterprise critical",position: 1, color: "#ef4444", filtersJson: { version: 1, logic: "AND", clauses: [{ field: "customer.tier", operator: "eq", value: "ENTERPRISE" }, { field: "severity", operator: "eq", value: "HIGH" }] } },
    { name: "Untracked themes",   position: 2, color: "#f59e0b", filtersJson: { version: 1, logic: "AND", clauses: [{ field: "themeId", operator: "is_null" }] } },
    { name: "Last 7 days",        position: 3, color: "#10b981", filtersJson: { version: 1, logic: "AND", clauses: [{ field: "publishedAt", operator: "gte", value: "NOW()-7d" }] } },
    { name: "Unassigned",         position: 4, color: "#8b5cf6", filtersJson: { version: 1, logic: "AND", clauses: [{ field: "assigneeId", operator: "is_null" }, { field: "status", operator: "in", value: ["NEW"] }] } },
    { name: "Negative sentiment", position: 5, color: "#f43f5e", filtersJson: { version: 1, logic: "AND", clauses: [{ field: "sentiment", operator: "lt", value: -0.3 }] } },
  ]

  await Promise.all(
    systemViews.map((v, i) =>
      prisma.view.upsert({
        where: { id: `seed_view_${i}` },
        update: {},
        create: { id: `seed_view_${i}`, workspaceId: workspace.id, isSystem: true, ...v },
      })
    )
  )

  // ─── Feedback items ─────────────────────────────────────────────────────────
  const now = new Date()
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)

  type ItemDef = {
    id: string; connector: typeof cSlack; customer: typeof tyrell
    verbatimText: string; extractedSummary: string
    theme: typeof tMobile | null; sentiment: number; severity: Severity | null
    status: FeedbackStatus; assignee: typeof owner | null; publishedAt: Date
  }

  const itemDefs: ItemDef[] = [
    // ── Mobile App Sync ──────────────────────────────────────────────────────
    { id: "fi_01", connector: cSlack,    customer: tyrell,    verbatimText: "The mobile app keeps dropping my session whenever I switch between projects. It's breaking my workflow constantly.",                                                                         extractedSummary: "Tyrell (Enterprise) reports persistent mobile session drops when switching projects.",                              theme: tMobile, sentiment: -0.8, severity: Severity.HIGH,   status: FeedbackStatus.ASSIGNED, assignee: owner,  publishedAt: daysAgo(1)  },
    { id: "fi_02", connector: cIntercom, customer: stark,     verbatimText: "Mobile sync is completely broken for our iOS users. Data from the afternoon is just not showing up on the web dashboard.",                                                                    extractedSummary: "Stark reports iOS mobile sync failures causing data loss visible on the web dashboard.",                           theme: tMobile, sentiment: -0.9, severity: Severity.HIGH,   status: FeedbackStatus.ASSIGNED, assignee: owner,  publishedAt: daysAgo(2)  },
    { id: "fi_03", connector: cSlack,    customer: initech,   verbatimText: "Hey team — the Android client's background sync seems to stop working after a few hours. Had to kill and reopen the app three times today.",                                                  extractedSummary: "Initech reports Android background sync stopping after extended use, requiring app restarts.",                     theme: tMobile, sentiment: -0.6, severity: Severity.MEDIUM, status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(3)  },
    { id: "fi_04", connector: cG2,       customer: umbrella,  verbatimText: "Love the product overall but real-time sync on mobile is unreliable. Sometimes I see stale data for 20+ minutes.",                                                                            extractedSummary: "Umbrella notes mobile real-time sync lag of 20+ minutes despite overall product satisfaction.",                   theme: tMobile, sentiment: -0.3, severity: Severity.MEDIUM, status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(4)  },
    { id: "fi_05", connector: cZendesk,  customer: pied,      verbatimText: "Every time I try to sync contacts from mobile, the app crashes. This happens 100% of the time on my iPhone 15.",                                                                              extractedSummary: "Pied Piper reports 100% crash rate when syncing contacts from mobile on iPhone 15.",                              theme: tMobile, sentiment: -0.9, severity: Severity.HIGH,   status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(5)  },
    { id: "fi_06", connector: cSlack,    customer: wayne,     verbatimText: "We have enterprise users across 3 time zones and the mobile sync delay creates real confusion. Support tickets keep coming in about this.",                                                   extractedSummary: "Wayne Enterprises reports mobile sync delays causing confusion across multi-timezone enterprise deployments.",     theme: tMobile, sentiment: -0.7, severity: Severity.HIGH,   status: FeedbackStatus.ASSIGNED, assignee: member, publishedAt: daysAgo(6)  },
    { id: "fi_07", connector: cIntercom, customer: hooli,     verbatimText: "Offline mode would be a big help. Right now if I lose connection even briefly the mobile app loses all my unsaved work.",                                                                      extractedSummary: "Hooli requests offline mode to prevent data loss during brief connectivity interruptions.",                       theme: tMobile, sentiment: -0.5, severity: Severity.LOW,   status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(7)  },

    // ── PDF Export Crashes ───────────────────────────────────────────────────
    { id: "fi_08", connector: cSlack,    customer: tyrell,    verbatimText: "PDF export has been broken for a week. Every time we try to export a report with more than 50 rows it just hangs and eventually shows a 500 error.",                                           extractedSummary: "Tyrell reports PDF export hanging and returning 500 errors for reports exceeding 50 rows.",                      theme: tPdf,    sentiment: -0.8, severity: Severity.HIGH,   status: FeedbackStatus.ASSIGNED, assignee: owner,  publishedAt: daysAgo(1)  },
    { id: "fi_09", connector: cG2,       customer: stark,     verbatimText: "Exporting to PDF crashes the browser tab. Chrome shows a 'page unresponsive' message. This is a critical blocker for our weekly board reports.",                                              extractedSummary: "Stark reports PDF export crashing browser tabs in Chrome, blocking board report generation.",                    theme: tPdf,    sentiment: -0.9, severity: Severity.HIGH,   status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(2)  },
    { id: "fi_10", connector: cZendesk,  customer: initrode,  verbatimText: "The PDF export button sometimes does nothing and other times exports a blank file. Very inconsistent behavior.",                                                                               extractedSummary: "Initrode reports inconsistent PDF export — sometimes no action, sometimes blank output.",                        theme: tPdf,    sentiment: -0.6, severity: Severity.MEDIUM, status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(9)  },
    { id: "fi_11", connector: cIntercom, customer: dunder,    verbatimText: "PDF export works for small datasets but completely fails when I include the 'analytics' tab in the export. Error: internal server error.",                                                     extractedSummary: "Dunder Mifflin reports PDF export failing specifically when the analytics tab is included.",                     theme: tPdf,    sentiment: -0.5, severity: Severity.MEDIUM, status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(12) },
    { id: "fi_12", connector: cSlack,    customer: globex,    verbatimText: "Would love a way to schedule PDF exports automatically. Right now I have to do it manually every Monday morning and it takes forever.",                                                        extractedSummary: "Globex requests scheduled PDF export automation to replace manual weekly workflow.",                             theme: tPdf,    sentiment: 0.1,  severity: null,           status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(14) },

    // ── Onboarding Too Long ───────────────────────────────────────────────────
    { id: "fi_13", connector: cG2,       customer: pied,      verbatimText: "Onboarding took us almost 3 weeks. The documentation is scattered and there's no clear 'start here' path for a new admin.",                                                                   extractedSummary: "Pied Piper spent 3 weeks onboarding due to scattered docs and no clear admin start path.",                       theme: tOnboard,sentiment: -0.7, severity: Severity.MEDIUM, status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(8)  },
    { id: "fi_14", connector: cIntercom, customer: hooli,     verbatimText: "The setup wizard has too many steps. I counted 14 screens before I could actually start using the product. Please simplify.",                                                                  extractedSummary: "Hooli counted 14 setup wizard screens before productive use — requests significant simplification.",             theme: tOnboard,sentiment: -0.6, severity: Severity.LOW,   status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(10) },
    { id: "fi_15", connector: cG2,       customer: initech,   verbatimText: "Onboarding checklist is great but the tasks are not ordered logically. I kept running into dependencies that weren't explained.",                                                              extractedSummary: "Initech notes onboarding checklist tasks have undocumented dependencies causing confusion.",                     theme: tOnboard,sentiment: -0.4, severity: Severity.LOW,   status: FeedbackStatus.RESOLVED, assignee: member, publishedAt: daysAgo(15) },
    { id: "fi_16", connector: cSlack,    customer: dunder,    verbatimText: "New team members are really struggling to get started. The first session should walk them through a real workflow, not just feature demos.",                                                   extractedSummary: "Dunder Mifflin requests workflow-based onboarding rather than feature-focused demos.",                           theme: tOnboard,sentiment: -0.5, severity: Severity.MEDIUM, status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(18) },
    { id: "fi_17", connector: cZendesk,  customer: globex,    verbatimText: "We have a complex enterprise setup and there's zero guidance on how to configure permissions for our org structure. Had to file a support ticket.",                                             extractedSummary: "Globex reports no documentation for enterprise permission configuration during onboarding.",                     theme: tOnboard,sentiment: -0.6, severity: Severity.MEDIUM, status: FeedbackStatus.ASSIGNED, assignee: owner,  publishedAt: daysAgo(20) },

    // ── Search Performance ────────────────────────────────────────────────────
    { id: "fi_18", connector: cSlack,    customer: wayne,     verbatimText: "Search across our 200k+ record dataset is painfully slow — 8-12 seconds for a basic keyword search. This was much faster 3 months ago.",                                                      extractedSummary: "Wayne reports 8-12 second search times on a 200k+ record dataset — regression from 3 months ago.",              theme: tSearch, sentiment: -0.8, severity: Severity.HIGH,   status: FeedbackStatus.ASSIGNED, assignee: owner,  publishedAt: daysAgo(2)  },
    { id: "fi_19", connector: cG2,       customer: tyrell,    verbatimText: "Fuzzy search returns way too many false positives. I searched for 'sync' and got results about 'settings' and 'currency' — not helpful.",                                                     extractedSummary: "Tyrell reports fuzzy search returning irrelevant results, reducing filtering usefulness.",                       theme: tSearch, sentiment: -0.5, severity: Severity.MEDIUM, status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(5)  },
    { id: "fi_20", connector: cIntercom, customer: initrode,  verbatimText: "Boolean search operators don't seem to work consistently. AND works, OR doesn't. Spent 30 minutes debugging my search query.",                                                                 extractedSummary: "Initrode reports boolean search operators behaving inconsistently — OR operator not functioning.",               theme: tSearch, sentiment: -0.6, severity: Severity.MEDIUM, status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(7)  },
    { id: "fi_21", connector: cSlack,    customer: umbrella,  verbatimText: "Search doesn't highlight where the match was found in the document. Would be a big quality of life improvement.",                                                                              extractedSummary: "Umbrella requests match highlighting in search results for better navigation.",                                  theme: tSearch, sentiment: 0.0,  severity: null,           status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(11) },

    // ── Bulk Import ───────────────────────────────────────────────────────────
    { id: "fi_22", connector: cZendesk,  customer: stark,     verbatimText: "Bulk import via CSV fails silently for rows with special characters. I imported 5000 records and only found out 300 failed when I checked manually.",                                          extractedSummary: "Stark reports bulk CSV import failing silently on special-character rows — 300 of 5000 records lost.",           theme: tBulk,   sentiment: -0.8, severity: Severity.HIGH,   status: FeedbackStatus.ASSIGNED, assignee: member, publishedAt: daysAgo(3)  },
    { id: "fi_23", connector: cIntercom, customer: wayne,     verbatimText: "We need to be able to map custom CSV columns to our data model during import. Right now the column names have to match exactly, which is impractical for enterprise migrations.",             extractedSummary: "Wayne Enterprises requires custom column mapping in bulk CSV import for enterprise data migration.",             theme: tBulk,   sentiment: -0.5, severity: Severity.MEDIUM, status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(6)  },
    { id: "fi_24", connector: cG2,       customer: initech,   verbatimText: "The bulk import progress bar freezes at 80% every time. Hard to tell if it's actually stuck or just slow.",                                                                                   extractedSummary: "Initech reports bulk import progress bar consistently freezing at 80%, causing uncertainty about job status.",  theme: tBulk,   sentiment: -0.5, severity: Severity.MEDIUM, status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(9)  },
    { id: "fi_25", connector: cSlack,    customer: pied,      verbatimText: "Import validation errors are not specific enough. 'Row 423: invalid format' — which field? What format is expected?",                                                                          extractedSummary: "Pied Piper requests more specific validation error messages in bulk import (field name + expected format).",    theme: tBulk,   sentiment: -0.4, severity: Severity.LOW,   status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(13) },

    // ── API Rate Limits ───────────────────────────────────────────────────────
    { id: "fi_26", connector: cSlack,    customer: tyrell,    verbatimText: "Our integration hits the 1000 req/min limit constantly during business hours. We need at least 10x that for our use case. Happy to pay for it.",                                              extractedSummary: "Tyrell (Enterprise, $195k ARR) hitting 1000 req/min API limit during business hours — requests 10x increase.",  theme: tApi,    sentiment: -0.7, severity: Severity.HIGH,   status: FeedbackStatus.ASSIGNED, assignee: owner,  publishedAt: daysAgo(1)  },
    { id: "fi_27", connector: cIntercom, customer: stark,     verbatimText: "The rate limit headers in the API response are misleading. The X-RateLimit-Remaining header shows 500 but we still get 429s.",                                                                extractedSummary: "Stark reports misleading rate limit headers — X-RateLimit-Remaining shows 500 but 429s still occur.",           theme: tApi,    sentiment: -0.6, severity: Severity.MEDIUM, status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(4)  },
    { id: "fi_28", connector: cZendesk,  customer: initrode,  verbatimText: "Webhook delivery rate limits are too low. We're missing events during peak traffic because our endpoint can't ACK fast enough and you stop retrying.",                                         extractedSummary: "Initrode reports webhook delivery rate limits causing missed events during peak traffic.",                       theme: tApi,    sentiment: -0.6, severity: Severity.MEDIUM, status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(7)  },
    { id: "fi_29", connector: cG2,       customer: umbrella,  verbatimText: "A bulk API endpoint would eliminate most of our rate limit issues. Instead of 50 individual requests we could do one.",                                                                        extractedSummary: "Umbrella requests a bulk API endpoint to reduce per-operation request count.",                                   theme: tApi,    sentiment: -0.2, severity: null,           status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(10) },

    // ── Dashboard Load Time ───────────────────────────────────────────────────
    { id: "fi_30", connector: cSlack,    customer: wayne,     verbatimText: "The main dashboard takes 15 seconds to load when I have more than 5 widgets enabled. This has been getting progressively worse over the past month.",                                          extractedSummary: "Wayne Enterprises reports dashboard loading in 15+ seconds with 5+ widgets — progressive regression over a month.", theme: tDash, sentiment: -0.8, severity: Severity.HIGH,   status: FeedbackStatus.ASSIGNED, assignee: member, publishedAt: daysAgo(2)  },
    { id: "fi_31", connector: cIntercom, customer: tyrell,    verbatimText: "Dashboard TTFB is over 4 seconds. Our operations team checks it constantly throughout the day so this really adds up.",                                                                        extractedSummary: "Tyrell reports 4s+ TTFB on the dashboard, significantly impacting ops team who check it frequently.",           theme: tDash,   sentiment: -0.7, severity: Severity.HIGH,   status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(4)  },
    { id: "fi_32", connector: cG2,       customer: stark,     verbatimText: "Custom dashboards with real-time refresh enabled are unusable. The page just constantly reloads and everything flickers.",                                                                     extractedSummary: "Stark reports real-time refresh on custom dashboards causes continuous reloading and flickering.",               theme: tDash,   sentiment: -0.8, severity: Severity.HIGH,   status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(5)  },
    { id: "fi_33", connector: cZendesk,  customer: initech,   verbatimText: "Loading indicator doesn't appear until 2+ seconds in. I keep clicking things again thinking nothing happened.",                                                                                extractedSummary: "Initech reports 2+ second delay before loading indicator appears, causing unintended repeat clicks.",           theme: tDash,   sentiment: -0.4, severity: Severity.LOW,   status: FeedbackStatus.RESOLVED, assignee: member, publishedAt: daysAgo(20) },
    { id: "fi_34", connector: cSlack,    customer: globex,    verbatimText: "Lazy loading for dashboard widgets would be a huge improvement. Load the shell first, then populate each widget independently.",                                                               extractedSummary: "Globex suggests independent lazy loading per dashboard widget to improve perceived performance.",                theme: tDash,   sentiment: 0.2,  severity: null,           status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(22) },

    // ── Notification Settings ─────────────────────────────────────────────────
    { id: "fi_35", connector: cIntercom, customer: dunder,    verbatimText: "I get notifications for every single comment on tickets I'm only loosely related to. Please add mention-only or 'my items' notification modes.",                                               extractedSummary: "Dunder Mifflin requests mention-only and 'my items' notification filter modes.",                                theme: tNotif,  sentiment: -0.5, severity: Severity.LOW,   status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(8)  },
    { id: "fi_36", connector: cG2,       customer: pied,      verbatimText: "No way to set a 'do not disturb' window. Getting paged at 2am for low priority notifications is not acceptable.",                                                                             extractedSummary: "Pied Piper requests a DND scheduling window to suppress low-priority notifications outside work hours.",        theme: tNotif,  sentiment: -0.7, severity: Severity.MEDIUM, status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(11) },
    { id: "fi_37", connector: cSlack,    customer: hooli,     verbatimText: "Notification digest (daily summary instead of real-time) would reduce the noise a lot for our non-technical stakeholders.",                                                                    extractedSummary: "Hooli requests a daily digest notification option to reduce real-time noise for non-technical stakeholders.",   theme: tNotif,  sentiment: -0.2, severity: null,           status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(14) },
    { id: "fi_38", connector: cZendesk,  customer: umbrella,  verbatimText: "Slack integration for notifications is great but the message format is too verbose. A single line with a link is all I need.",                                                                extractedSummary: "Umbrella requests condensed single-line Slack notification format with link instead of verbose messages.",      theme: tNotif,  sentiment: 0.1,  severity: null,           status: FeedbackStatus.RESOLVED, assignee: owner,  publishedAt: daysAgo(25) },

    // ── Mixed / No Theme ──────────────────────────────────────────────────────
    { id: "fi_39", connector: cSlack,    customer: tyrell,    verbatimText: "Two-factor authentication needs to support hardware keys (FIDO2). Our security policy requires it and right now we can't roll this out company-wide.",                                         extractedSummary: "Tyrell (Enterprise) requires FIDO2 hardware key support for 2FA to meet internal security policy requirements.", theme: null,   sentiment: -0.6, severity: Severity.HIGH,   status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(1)  },
    { id: "fi_40", connector: cG2,       customer: globex,    verbatimText: "Genuinely the best tool we've used for this. The table UI is incredibly intuitive and the team picked it up in one afternoon.",                                                                extractedSummary: "Globex praises the table UI as highly intuitive — team adoption in a single afternoon.",                        theme: null,    sentiment: 0.95, severity: null,           status: FeedbackStatus.ARCHIVED, assignee: null,   publishedAt: daysAgo(12) },
    { id: "fi_41", connector: cIntercom, customer: initrode,  verbatimText: "The audit log is missing some events — specifically, bulk status changes don't show up. This is a compliance issue for us.",                                                                   extractedSummary: "Initrode reports bulk status changes missing from the audit log — flagged as a compliance concern.",            theme: null,    sentiment: -0.8, severity: Severity.HIGH,   status: FeedbackStatus.ASSIGNED, assignee: owner,  publishedAt: daysAgo(3)  },
    { id: "fi_42", connector: cZendesk,  customer: pied,      verbatimText: "SSO with Google Workspace would eliminate a lot of friction for our users. Right now they maintain separate credentials.",                                                                     extractedSummary: "Pied Piper requests Google Workspace SSO integration to eliminate separate credential management.",             theme: null,    sentiment: -0.3, severity: Severity.LOW,   status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(6)  },
    { id: "fi_43", connector: cSlack,    customer: dunder,    verbatimText: "Version history for records would be incredibly useful. Right now if someone makes a bad edit there's no way to revert.",                                                                      extractedSummary: "Dunder Mifflin requests version history and revert capability for record edits.",                               theme: null,    sentiment: -0.4, severity: Severity.MEDIUM, status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(9)  },
    { id: "fi_44", connector: cIntercom, customer: stark,     verbatimText: "Dark mode please. Our team works late and the bright interface is straining on the eyes. Even a simple toggle would help.",                                                                    extractedSummary: "Stark requests dark mode toggle to reduce eye strain during extended evening use.",                             theme: null,    sentiment: -0.1, severity: null,           status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(15) },
    { id: "fi_45", connector: cG2,       customer: wayne,     verbatimText: "Keyboard shortcuts would make power users much more productive. Even just keyboard navigation in the table would help.",                                                                       extractedSummary: "Wayne Enterprises requests keyboard shortcuts and table navigation for power user productivity.",               theme: null,    sentiment: 0.2,  severity: null,           status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(17) },
    { id: "fi_46", connector: cSlack,    customer: umbrella,  verbatimText: "The mobile app doesn't support biometric authentication. Every login requires typing the full password which is really annoying on mobile.",                                                   extractedSummary: "Umbrella requests biometric authentication support for mobile app login.",                                      theme: null,    sentiment: -0.4, severity: Severity.LOW,   status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(19) },
    { id: "fi_47", connector: cZendesk,  customer: initech,   verbatimText: "Conditional logic in forms is a must-have. Right now every user sees every field regardless of whether it's relevant to them.",                                                                extractedSummary: "Initech requires conditional field logic in forms to show only contextually relevant fields.",                  theme: null,    sentiment: -0.5, severity: Severity.MEDIUM, status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(21) },
    { id: "fi_48", connector: cIntercom, customer: hooli,     verbatimText: "Data export to Parquet format would let us feed directly into our data warehouse pipeline without transformation.",                                                                             extractedSummary: "Hooli requests Parquet export format to enable direct data warehouse pipeline integration.",                    theme: null,    sentiment: 0.1,  severity: null,           status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(23) },
    { id: "fi_49", connector: cG2,       customer: globex,    verbatimText: "The kanban view is much better than the list view for our workflow. Any chance of adding swim lanes by assignee?",                                                                             extractedSummary: "Globex requests assignee-based swim lanes in the kanban view.",                                                 theme: null,    sentiment: 0.4,  severity: null,           status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(24) },
    { id: "fi_50", connector: cSlack,    customer: tyrell,    verbatimText: "We need SCIM provisioning for automatic user lifecycle management. Our IT team manages hundreds of seats and manual provisioning doesn't scale.",                                               extractedSummary: "Tyrell requires SCIM provisioning for automated enterprise user lifecycle management at scale.",                theme: null,    sentiment: -0.5, severity: Severity.MEDIUM, status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(2)  },
    { id: "fi_51", connector: cIntercom, customer: stark,     verbatimText: "IP allowlist configuration for our enterprise plan. Security team won't approve the tool without it.",                                                                                         extractedSummary: "Stark (Enterprise) blocked from deployment — security team requires IP allowlist configuration.",               theme: null,    sentiment: -0.7, severity: Severity.HIGH,   status: FeedbackStatus.ASSIGNED, assignee: owner,  publishedAt: daysAgo(4)  },
    { id: "fi_52", connector: cZendesk,  customer: initrode,  verbatimText: "Custom fields on the data model would allow us to track industry-specific attributes without workarounds.",                                                                                    extractedSummary: "Initrode requests custom fields on the data model for industry-specific attribute tracking.",                  theme: null,    sentiment: -0.2, severity: null,           status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(16) },
    { id: "fi_53", connector: cG2,       customer: dunder,    verbatimText: "The product has genuinely saved us hours each week. The automation features especially — we went from 3 hours of manual work to 20 minutes.",                                                  extractedSummary: "Dunder Mifflin reports automation features saving ~2.5 hours per week of manual work.",                        theme: null,    sentiment: 0.95, severity: null,           status: FeedbackStatus.ARCHIVED, assignee: null,   publishedAt: daysAgo(28) },
    { id: "fi_54", connector: cSlack,    customer: pied,      verbatimText: "Zapier integration would let us connect to the 200+ tools in our stack without building custom API integrations.",                                                                             extractedSummary: "Pied Piper requests Zapier integration to enable no-code connections across their tool stack.",                theme: null,    sentiment: 0.2,  severity: null,           status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(26) },
    { id: "fi_55", connector: cIntercom, customer: wayne,     verbatimText: "Multi-currency support is blocking our EMEA expansion. Displaying ARR in USD only doesn't work for our European customers.",                                                                   extractedSummary: "Wayne Enterprises blocked from EMEA expansion — requires multi-currency ARR display support.",                 theme: null,    sentiment: -0.6, severity: Severity.MEDIUM, status: FeedbackStatus.NEW,      assignee: null,   publishedAt: daysAgo(8)  },
    { id: "fi_56", connector: cG2,       customer: globex,    verbatimText: "The timeline view helps our team understand how a customer relationship evolved. Would love to see this more prominently featured.",                                                           extractedSummary: "Globex requests more prominent placement of the customer timeline view.",                                       theme: null,    sentiment: 0.7,  severity: null,           status: FeedbackStatus.ARCHIVED, assignee: null,   publishedAt: daysAgo(30) },
  ]

  await Promise.all(
    itemDefs.map(({ id, connector, customer, theme, assignee, ...rest }) =>
      prisma.feedbackItem.upsert({
        where: { id },
        update: {},
        create: {
          id,
          workspaceId: workspace.id,
          connectorId: connector.id,
          customerId: customer.id,
          themeId: theme?.id ?? null,
          assigneeId: assignee?.id ?? null,
          sourceType: connector.type,
          ...rest,
        },
      })
    )
  )

  // Update theme item counts
  for (const theme of themes) {
    const count = await prisma.feedbackItem.count({ where: { themeId: theme.id } })
    await prisma.theme.update({ where: { id: theme.id }, data: { itemCount: count } })
  }

  // Update connector item counts
  for (const connector of connectors) {
    const count = await prisma.feedbackItem.count({ where: { connectorId: connector.id } })
    await prisma.connector.update({ where: { id: connector.id }, data: { itemCount: count } })
  }

  console.log(`✅ Seeded workspace "${workspace.name}"`)
  console.log(`   ${customers.length} customers`)
  console.log(`   ${themes.length} themes`)
  console.log(`   ${connectors.length} connectors`)
  console.log(`   ${itemDefs.length} feedback items`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
