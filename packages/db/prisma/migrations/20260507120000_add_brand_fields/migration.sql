-- AlterTable
ALTER TABLE "workspaces"
  ADD COLUMN "brand_website"     TEXT,
  ADD COLUMN "brand_name"        TEXT,
  ADD COLUMN "brand_keywords"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "brand_inferred_at" TIMESTAMP(3);
