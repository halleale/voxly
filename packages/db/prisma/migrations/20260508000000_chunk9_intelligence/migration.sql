-- Chunk 9: Intelligence Layer schema additions

-- IngestionQueue: store stage3 score for borderline rejection surfacing
ALTER TABLE "ingestion_queue" ADD COLUMN "stage3_score" DOUBLE PRECISION;

-- FeedbackItem: track PM-approved borderline items for classifier retraining
ALTER TABLE "feedback_items" ADD COLUMN "pm_approved" BOOLEAN NOT NULL DEFAULT false;

-- Theme: track resolution timestamp for feedback-to-outcome loop
ALTER TABLE "themes" ADD COLUMN "resolved_at" TIMESTAMP(3);

-- ThemeSpikeNotification: deduplicates spike alerts (one per theme per day)
CREATE TABLE "theme_spike_notifications" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "theme_id" TEXT NOT NULL,
    "spike_detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slack_posted" BOOLEAN NOT NULL DEFAULT false,
    "slack_message_ts" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "theme_spike_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "theme_spike_notifications_workspace_id_spike_detected_at_idx"
    ON "theme_spike_notifications"("workspace_id", "spike_detected_at" DESC);

ALTER TABLE "theme_spike_notifications"
    ADD CONSTRAINT "theme_spike_notifications_theme_id_fkey"
    FOREIGN KEY ("theme_id") REFERENCES "themes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- WeeklyBriefing: one row per workspace per week
CREATE TABLE "weekly_briefings" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "week_starting" TIMESTAMP(3) NOT NULL,
    "content_json" JSONB NOT NULL,
    "slack_channel_id" TEXT,
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "weekly_briefings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "weekly_briefings_workspace_id_week_starting_key"
    ON "weekly_briefings"("workspace_id", "week_starting");

CREATE INDEX "weekly_briefings_workspace_id_idx" ON "weekly_briefings"("workspace_id");

ALTER TABLE "weekly_briefings"
    ADD CONSTRAINT "weekly_briefings_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ThemeOutcome: links a theme to a shipped feature/ticket
CREATE TABLE "theme_outcomes" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "theme_id" TEXT NOT NULL,
    "provider" "TicketProvider" NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "ticket_url" TEXT NOT NULL,
    "ticket_title" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "theme_outcomes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "theme_outcomes_workspace_id_idx" ON "theme_outcomes"("workspace_id");
CREATE INDEX "theme_outcomes_theme_id_idx" ON "theme_outcomes"("theme_id");

ALTER TABLE "theme_outcomes"
    ADD CONSTRAINT "theme_outcomes_theme_id_fkey"
    FOREIGN KEY ("theme_id") REFERENCES "themes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
