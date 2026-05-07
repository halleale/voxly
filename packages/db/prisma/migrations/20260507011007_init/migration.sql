-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('SLACK', 'INTERCOM', 'ZENDESK', 'G2', 'TRUSTRADIUS', 'GONG', 'CANNY', 'HN', 'REDDIT', 'HUBSPOT', 'SALESFORCE', 'API');

-- CreateEnum
CREATE TYPE "ConnectorStatus" AS ENUM ('ACTIVE', 'ERROR', 'PAUSED', 'PENDING_AUTH');

-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'UNCERTAIN');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'ASSIGNED', 'RESOLVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CustomerTier" AS ENUM ('ENTERPRISE', 'GROWTH', 'STARTER');

-- CreateEnum
CREATE TYPE "TicketProvider" AS ENUM ('LINEAR', 'JIRA');

-- CreateEnum
CREATE TYPE "WorkflowRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'starter',
    "api_key_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "clerk_user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connectors" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "name" TEXT NOT NULL,
    "config_json" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "ConnectorStatus" NOT NULL DEFAULT 'PENDING_AUTH',
    "last_polled_at" TIMESTAMP(3),
    "item_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_queue" (
    "id" TEXT NOT NULL,
    "connector_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "source_type" "SourceType" NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "IngestionStatus" NOT NULL DEFAULT 'PENDING',
    "reject_reason" TEXT,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "ingestion_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_items" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "connector_id" TEXT NOT NULL,
    "verbatim_text" TEXT NOT NULL,
    "extracted_summary" TEXT,
    "author_name" TEXT,
    "author_email" TEXT,
    "author_url" TEXT,
    "source_type" "SourceType" NOT NULL,
    "external_id" TEXT,
    "external_url" TEXT,
    "theme_id" TEXT,
    "secondary_theme_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "theme_confidence" DOUBLE PRECISION,
    "sentiment" DOUBLE PRECISION,
    "severity" "Severity",
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "assignee_id" TEXT,
    "customer_id" TEXT,
    "published_at" TIMESTAMP(3),
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "relevance_score" DOUBLE PRECISION,
    "raw_payload" JSONB,

    CONSTRAINT "feedback_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "tier" "CustomerTier" NOT NULL DEFAULT 'STARTER',
    "arr_cents" INTEGER,
    "crm_id" TEXT,
    "enriched_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "themes" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "item_count" INTEGER NOT NULL DEFAULT 0,
    "is_proto" BOOLEAN NOT NULL DEFAULT false,
    "is_spiking" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMP(3),

    CONSTRAINT "themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "views" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "filters_json" JSONB NOT NULL DEFAULT '{}',
    "sort_json" JSONB,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linked_tickets" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "feedback_item_id" TEXT NOT NULL,
    "provider" "TicketProvider" NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "ticket_url" TEXT NOT NULL,
    "ticket_title" TEXT,
    "ticket_status" TEXT,
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "linked_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "graph_json" JSONB NOT NULL DEFAULT '{}',
    "last_run_at" TIMESTAMP(3),
    "run_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_runs" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "feedback_item_id" TEXT,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "steps_json" JSONB,

    CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE INDEX "workspace_members_workspace_id_idx" ON "workspace_members"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspace_id_clerk_user_id_key" ON "workspace_members"("workspace_id", "clerk_user_id");

-- CreateIndex
CREATE INDEX "connectors_workspace_id_idx" ON "connectors"("workspace_id");

-- CreateIndex
CREATE INDEX "connectors_workspace_id_type_idx" ON "connectors"("workspace_id", "type");

-- CreateIndex
CREATE INDEX "ingestion_queue_connector_id_status_idx" ON "ingestion_queue"("connector_id", "status");

-- CreateIndex
CREATE INDEX "ingestion_queue_status_received_at_idx" ON "ingestion_queue"("status", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "ingestion_queue_connector_id_external_id_key" ON "ingestion_queue"("connector_id", "external_id");

-- CreateIndex
CREATE INDEX "feedback_items_workspace_id_ingested_at_idx" ON "feedback_items"("workspace_id", "ingested_at" DESC);

-- CreateIndex
CREATE INDEX "feedback_items_workspace_id_theme_id_idx" ON "feedback_items"("workspace_id", "theme_id");

-- CreateIndex
CREATE INDEX "feedback_items_workspace_id_status_idx" ON "feedback_items"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "feedback_items_workspace_id_sentiment_idx" ON "feedback_items"("workspace_id", "sentiment");

-- CreateIndex
CREATE INDEX "feedback_items_workspace_id_customer_id_idx" ON "feedback_items"("workspace_id", "customer_id");

-- CreateIndex
CREATE INDEX "feedback_items_workspace_id_source_type_idx" ON "feedback_items"("workspace_id", "source_type");

-- CreateIndex
CREATE INDEX "customers_workspace_id_idx" ON "customers"("workspace_id");

-- CreateIndex
CREATE INDEX "customers_workspace_id_tier_idx" ON "customers"("workspace_id", "tier");

-- CreateIndex
CREATE INDEX "themes_workspace_id_idx" ON "themes"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "themes_workspace_id_slug_key" ON "themes"("workspace_id", "slug");

-- CreateIndex
CREATE INDEX "views_workspace_id_position_idx" ON "views"("workspace_id", "position");

-- CreateIndex
CREATE INDEX "linked_tickets_workspace_id_idx" ON "linked_tickets"("workspace_id");

-- CreateIndex
CREATE INDEX "linked_tickets_feedback_item_id_idx" ON "linked_tickets"("feedback_item_id");

-- CreateIndex
CREATE INDEX "workflows_workspace_id_idx" ON "workflows"("workspace_id");

-- CreateIndex
CREATE INDEX "workflow_runs_workflow_id_idx" ON "workflow_runs"("workflow_id");

-- CreateIndex
CREATE INDEX "workflow_runs_feedback_item_id_idx" ON "workflow_runs"("feedback_item_id");

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connectors" ADD CONSTRAINT "connectors_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_queue" ADD CONSTRAINT "ingestion_queue_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "themes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "workspace_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "themes" ADD CONSTRAINT "themes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "views" ADD CONSTRAINT "views_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linked_tickets" ADD CONSTRAINT "linked_tickets_feedback_item_id_fkey" FOREIGN KEY ("feedback_item_id") REFERENCES "feedback_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_feedback_item_id_fkey" FOREIGN KEY ("feedback_item_id") REFERENCES "feedback_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
