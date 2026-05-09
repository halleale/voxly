-- Add quota tracking fields to workspaces
ALTER TABLE "workspaces"
  ADD COLUMN "feedback_quota" INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN "feedback_used_this_month" INTEGER NOT NULL DEFAULT 0;

-- Add unique constraint on feedback_items to prevent duplicate ingestion
-- NULL externalId rows are excluded from the constraint (NULLs are not equal)
CREATE UNIQUE INDEX "feedback_items_connector_id_external_id_key"
  ON "feedback_items"("connector_id", "external_id")
  WHERE "external_id" IS NOT NULL;
