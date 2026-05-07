-- Add pgvector embedding column to feedback_items
ALTER TABLE "feedback_items" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);
CREATE INDEX IF NOT EXISTS "feedback_items_embedding_idx" ON "feedback_items" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

-- Add centroid vector column to themes
ALTER TABLE "themes" ADD COLUMN IF NOT EXISTS "centroid" vector(1536);

-- Add unique constraint for customers(workspace_id, domain)
ALTER TABLE "customers" ADD CONSTRAINT "customers_workspace_id_domain_key" UNIQUE ("workspace_id", "domain");
