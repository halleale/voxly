-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM (
  'FEEDBACK_STATUS_CHANGED',
  'FEEDBACK_ASSIGNED',
  'FEEDBACK_ARCHIVED',
  'CONNECTOR_CREATED',
  'CONNECTOR_UPDATED',
  'CONNECTOR_DELETED',
  'WORKFLOW_CREATED',
  'WORKFLOW_UPDATED',
  'WORKFLOW_DELETED',
  'WORKFLOW_ACTIVATED',
  'TICKET_LINKED',
  'INBOX_APPROVED',
  'INBOX_REJECTED',
  'MEMBER_INVITED',
  'MEMBER_ROLE_CHANGED',
  'MEMBER_REMOVED',
  'WORKSPACE_UPDATED',
  'API_KEY_ROTATED',
  'THEME_EXPORTED'
);

-- CreateTable
CREATE TABLE "audit_logs" (
  "id"           TEXT         NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" TEXT         NOT NULL,
  "actor_id"     TEXT         NOT NULL,
  "actor_email"  TEXT,
  "action"       "AuditAction" NOT NULL,
  "entity_type"  TEXT         NOT NULL,
  "entity_id"    TEXT,
  "metadata"     JSONB,
  "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_workspace_id_created_at_idx" ON "audit_logs" ("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_workspace_id_entity_type_idx" ON "audit_logs" ("workspace_id", "entity_type");

-- AddForeignKey
ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;
