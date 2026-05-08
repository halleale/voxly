# Voxly — Architecture & Implementation Plan

## Final Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Monorepo | Turborepo | Shared types across frontend/backend, one repo, one CI pipeline |
| Frontend | Next.js 14 (App Router) | SSR for initial load, API routes for lightweight endpoints |
| Table | TanStack Table v8 | Headless, virtualized, handles sorting/filtering/selection |
| Workflow Builder | React Flow | Battle-tested DAG canvas, extensible node system |
| Components | Shadcn/ui + Tailwind | Unstyled primitives you can brand, fast iteration |
| Client State | Zustand | Lightweight — table selection, panel state, bulk actions |
| Backend | Fastify (Node.js/TypeScript) | Separate process from Next.js; needed for background workers |
| Queue | BullMQ + Redis | Ingestion jobs, AI pipeline, workflow execution, polling schedulers |
| Database | PostgreSQL + pgvector | Relational for structured data, pgvector for embeddings |
| AI — Embeddings | text-embedding-3-small | Cheap ($0.02/1M tokens), 1536 dimensions, strong quality |
| AI — Classification | gpt-4o-mini | Relevance filtering, sentiment scoring, severity, summaries |
| AI — Extraction/Naming | gpt-4o | Theme naming, Gong extraction only |
| Auth | Clerk | Multi-tenancy, org management, SSO-ready for enterprise |
| Deploy | Railway | Next.js + Fastify + Redis + Postgres + worker — zero DevOps overhead |

Full TypeScript across the stack. AI work is entirely via OpenAI API.

## Repository Structure

```
voxly/
├── apps/
│   ├── web/                    # Next.js 14 — frontend + lightweight API routes
│   └── api/                    # Fastify — core API, webhook receivers, long-running ops
├── packages/
│   ├── db/                     # Prisma schema, migrations, typed client
│   ├── queue/                  # BullMQ queue definitions + job types
│   ├── ai/                     # OpenAI wrappers (embed, classify, extract, summarize)
│   ├── connectors/             # ConnectorAdapter interface + all source implementations
│   └── types/                  # Shared TypeScript types (FeedbackItem, Connector, etc.)
└── workers/
    └── processor/              # BullMQ worker process — ingestion, AI pipeline, workflows
```

## Pricing Model

**Per-feedback-item**, not per seat. Value scales with feedback processed, not headcount.

### Cost basis per approved item

| Step | Model | Cost |
|---|---|---|
| Embedding (classifier) | text-embedding-3-small | ~$0.000002 |
| Classification | gpt-4o-mini | ~$0.0001 |
| Sentiment | gpt-4o-mini | ~$0.0001 |
| Severity | gpt-4o-mini | ~$0.0001 |
| Summary | gpt-4o-mini | ~$0.0003 |
| **Total** | | **~$0.0006–$0.001** |

Summaries use gpt-4o-mini (not gpt-4o) — quality is sufficient for 1-2 sentence PM summaries and reduces cost 10–30x vs gpt-4o. gpt-4o is reserved for Gong extraction and theme naming only.

### Pricing tiers

| Tier | Items/month | Cost to us | Price | Margin |
|---|---|---|---|---|
| Free | 300 | ~$0.10–0.30 | $0 | loss leader |
| Starter | 2,000 | ~$0.60–2.00 | $19/mo | ~10x |
| Growth | 10,000 | ~$3–10 | $59/mo | ~6–20x |
| Scale | 50,000 | ~$15–50 | $199/mo | ~4–13x |
| Enterprise | Custom | — | Custom | negotiated |

"Feedback item" = one approved, processed piece of feedback (one Intercom message, one Slack thread, one CSV row). Items rejected by the relevance pipeline don't count toward quota.

### Schema fields required
- `Workspace.feedbackQuota: Int` — monthly item limit for this plan
- `Workspace.feedbackUsedThisMonth: Int` — counter, reset by monthly cron
- `Workspace.planTier: Enum` — free | starter | growth | scale | enterprise
- Ingestion gate: check quota before processing; return 402 with upgrade prompt when exceeded

## Core Data Model

```sql
workspaces         (id, name, slug, plan_tier, feedback_quota, feedback_used_this_month, created_at)
connectors         (id, workspace_id, type, name, config_json, enabled, last_polled_at, item_count)
ingestion_queue    (id, connector_id, external_id, raw_payload, source_type, received_at, status)
feedback_items     (id, workspace_id, connector_id,
                    verbatim_text, extracted_summary,
                    author_name, author_email, author_url,
                    source_type, external_id, external_url,
                    embedding vector(1536),
                    theme_id, theme_confidence float,
                    sentiment float, severity,
                    status, assignee_id, customer_id,
                    published_at, ingested_at,
                    relevance_score float, raw_payload jsonb)
customers          (id, workspace_id, name, domain, tier, arr_cents, crm_id, enriched_at)
themes             (id, workspace_id, slug, name, description,
                    item_count, centroid vector(1536), is_spiking bool,
                    created_at, last_active_at)
views              (id, workspace_id, name, color, filters_json, is_system bool, sort_json, position)
linked_tickets     (id, workspace_id, feedback_item_id, provider, ticket_id, ticket_url, ticket_title, ticket_status, synced_at)
workflows          (id, workspace_id, name, is_active, graph_json, last_run_at, run_count)
workflow_runs      (id, workflow_id, feedback_item_id, status, started_at, completed_at, steps_json)
```

## Ingestion + Relevance Pipeline

```
SOURCE EVENT / POLL
        │
        ▼
CONNECTOR LAYER — normalize to NormalizedFeedback[]
        │
        ▼
STAGE 1 — Hard Filters (sync, free)
  ✗ text < 15 words
  ✗ bot author
  ✗ exact duplicate (hash connector_id + external_id)
  ✗ blocklist match ("password reset", "billing", "invoice")
        │
        ▼
STAGE 2 — Source-Specific Rules (sync, free)
  Slack: channel in allowlist
  Zendesk: ticket type in [question, problem], not billing
  Reddit: product keyword match
  G2/Trustradius: always pass
        │
        ▼
STAGE 3 — Embedding Classifier (~$0.000002/item)
  score > 0.85  → PASS
  score 0.65-0.85 → uncertain → Stage 4
  score < 0.65  → REJECT
        │
        ▼
STAGE 4 — LLM Classifier (gpt-4o-mini, ~$0.0001/item)
  feedback      → PASS
  not_feedback  → REJECT
  uncertain     → NEEDS REVIEW (Inbox queue)
        │
        ▼
QUOTA CHECK — feedbackUsedThisMonth < feedbackQuota?
  no  → 402, notify workspace owner
  yes → increment counter, continue
        │
        ▼
AI PIPELINE (BullMQ worker, parallel)
  1. Sentiment score (gpt-4o-mini)
  2. Severity inference (gpt-4o-mini)
  3. Summary generation (gpt-4o-mini)
  4. Embedding → pgvector
  5. Theme assignment (nearest centroid, threshold 0.78)
  6. CRM enrichment
  7. Workflow evaluation
        │
        ▼
feedback_items table
```

## Work Breakdown

### ✅ Chunk 1 — Foundation (complete)
Turborepo monorepo, Prisma schema, Clerk auth, RLS, Fastify API, Next.js shell, seed data.

### ✅ Chunk 2 — Table UI (complete)
TanStack Table, columns, filter panel, bulk selection, smart views, detail panel, sidebar counts.

### ✅ Chunk 3 — Ingestion Pipeline + First Connectors (complete)
BullMQ + Redis, worker process, Stage 1/2 filters, webhook receivers, Slack connector, Intercom connector, connector setup UI.

### ✅ Chunk 4 — Relevance Filtering + AI v1 (complete)
Seed data (200 labeled examples), Stage 3 embedding classifier, Stage 4 LLM classifier, Inbox queue UI, sentiment, severity, AI summary card.

### ✅ Chunk 5 — Themes + CRM Enrichment (complete)
pgvector embeddings, real-time theme assignment, nightly HDBSCAN clustering, GPT-4o theme naming, Themes page, HubSpot connector, customer tier badges + ARR, spike detection.

### ✅ Chunk 6 — Action Layer (complete)
Linear connector, create/evidence ticket actions, assign/archive/merge actions, linked issue column, bulk actions, status transitions.

### ✅ Chunk 7 — More Connectors (complete)
Zendesk, G2, Gong, Canny, HN Algolia, Jira, connector health dashboard.

### Chunk 8 — Workflow Builder (Weeks 15–18)

The visual automation layer — Voxly's key differentiator.

**Data model:**
```typescript
interface WorkflowGraph {
  nodes: WorkflowNode[]
  edges: Edge[]  // React Flow edge format
}
type WorkflowNode =
  | { type: 'trigger'; data: TriggerConfig }   // new_feedback | theme_spike | schedule
  | { type: 'filter'; data: FilterConfig }      // field + operator + value
  | { type: 'enrich'; data: EnrichConfig }      // crm | sentiment | severity
  | { type: 'action'; data: ActionConfig }      // assign | slack_post | create_ticket | webhook
```

**Build order:**
1. Workflow CRUD API + data model
2. React Flow canvas — dotted grid, node palette, drag-to-add
3. Node editors (click node → configure in side panel)
4. Workflow execution engine in BullMQ — evaluate as DAG, log each step to `workflow_runs`
5. Filter node evaluation
6. Enrich node
7. Action nodes: Assign, Create Linear ticket, Post to Slack
8. Test run mode — run against a specific item, show per-node pass/fail
9. 5 starter templates (one-click install):
   - Enterprise Critical Alert (new ENT feedback → Slack #product-alerts)
   - Bug Auto-Triage (high severity → Linear ticket + assign PM)
   - Theme Spike Notification (theme spikes → Slack summary)
   - CS Escalation Router (negative ENT sentiment → assign CSM)
   - Weekly Digest (schedule → post theme summary to Slack)
10. Workflow list page with active/paused toggle, last run time, run count

**Done when:** A PM can install "Enterprise Critical Alert", configure their Slack channel, and receive a Slack notification within 60 seconds of an enterprise feedback item arriving.

### ✅ Chunk 9 — Intelligence Layer (complete)
Themes dashboard with time-series, spike alerts, weekly briefing (GPT-4o), Reddit connector, feedback-to-outcome tracking, classifier improvement loop.

### ✅ Chunk 10 — Platform & Enterprise (complete)
Public ingestion API (POST /api/v1/feedback + API key auth), RBAC (OWNER/ADMIN/MEMBER/VIEWER) with requireRole prehandler, audit log (fire-and-forget), WorkOS SAML SSO integration, Salesforce connector (OAuth + CRM sync), Notion export (themes → Notion pages), usage analytics dashboard (connector health, actioned rate, workflow success), settings page (API key management, member roles, SSO info), Analytics nav item.

## Critical Path

Don't start Chunk 3 until the data model is fully migrated. Don't start Chunk 7 until ConnectorAdapter is stable. The first 8 chunks are the critical path — nothing in chunks 9–10 is possible without a working workflow engine.

## Open Questions (resolved)

| Question | Answer |
|---|---|
| Clustering model | OpenAI embeddings + HDBSCAN nightly. GPT-4o-mini real-time. GPT-4o for theme naming only. |
| Multi-label feedback | `theme_id` primary (table) + `secondary_theme_ids[]` (detail panel only). |
| **Pricing** | **Per feedback item. Free (300/mo) → Starter $19 (2k) → Growth $59 (10k) → Scale $199 (50k). gpt-4o-mini for summaries to keep cost ~$0.001/item.** |
| Workflow templates | 5 templates at launch, freeform builder is the "Advanced" path. |
| Moat vs Linear/Jira | They'll never ingest G2, Gong, Reddit, Canny. Multi-source aggregation + workflow engine is structural. |
