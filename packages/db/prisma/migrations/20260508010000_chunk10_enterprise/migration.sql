-- Chunk 10: Platform & Enterprise schema additions

-- Workspace: WorkOS SSO connection ID for SAML enterprise SSO
ALTER TABLE "workspaces" ADD COLUMN "workos_connection_id" TEXT;

-- AuditLog: immutable record of every user mutation
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_workspace_id_created_at_idx"
    ON "audit_logs"("workspace_id", "created_at" DESC);

ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
