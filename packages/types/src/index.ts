// ─── Enums ────────────────────────────────────────────────────────────────────

export enum SourceType {
  SLACK = "SLACK",
  INTERCOM = "INTERCOM",
  ZENDESK = "ZENDESK",
  G2 = "G2",
  TRUSTRADIUS = "TRUSTRADIUS",
  GONG = "GONG",
  CANNY = "CANNY",
  HN = "HN",
  REDDIT = "REDDIT",
  HUBSPOT = "HUBSPOT",
  SALESFORCE = "SALESFORCE",
  API = "API",
}

export enum FeedbackStatus {
  NEW = "NEW",
  ASSIGNED = "ASSIGNED",
  RESOLVED = "RESOLVED",
  ARCHIVED = "ARCHIVED",
}

export enum Severity {
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
}

export enum CustomerTier {
  ENTERPRISE = "ENTERPRISE",
  GROWTH = "GROWTH",
  STARTER = "STARTER",
}

export enum MemberRole {
  OWNER = "OWNER",
  ADMIN = "ADMIN",
  MEMBER = "MEMBER",
  VIEWER = "VIEWER",
}

export enum ConnectorStatus {
  ACTIVE = "ACTIVE",
  ERROR = "ERROR",
  PAUSED = "PAUSED",
  PENDING_AUTH = "PENDING_AUTH",
}

export enum IngestionStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  UNCERTAIN = "UNCERTAIN",
}

export enum WorkflowRunStatus {
  RUNNING = "RUNNING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  SKIPPED = "SKIPPED",
}

export enum TicketProvider {
  LINEAR = "LINEAR",
  JIRA = "JIRA",
}

// ─── Connector interfaces ─────────────────────────────────────────────────────

export interface ConnectorConfig {
  /** Encrypted at the application layer before persistence */
  accessToken?: string
  refreshToken?: string
  webhookSecret?: string
  /** Source-specific settings (channel allowlist, keyword list, etc.) */
  settings?: Record<string, unknown>
}

/** The canonical form every connector normalizes its raw payload to */
export interface NormalizedFeedback {
  externalId: string
  externalUrl?: string
  verbatimText: string
  authorName?: string
  authorEmail?: string
  authorUrl?: string
  sourceType: SourceType
  publishedAt: Date
  rawPayload: unknown
  /** Gong transcripts produce multiple items from one call */
  speakerRole?: "customer" | "rep"
}

// ─── Filter / sort types (used in views.filters_json) ─────────────────────────

export type FilterOperator =
  | "eq"
  | "neq"
  | "in"
  | "nin"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "is_null"
  | "is_not_null"

export interface FilterClause {
  field: string
  operator: FilterOperator
  value?: unknown
}

export interface FilterSet {
  version: 1
  logic: "AND" | "OR"
  clauses: FilterClause[]
}

export interface SortClause {
  field: string
  direction: "asc" | "desc"
}

// ─── Workflow graph types (stored in workflows.graph_json) ────────────────────

export type TriggerType = "new_feedback" | "theme_spike" | "schedule"
export type ActionType = "assign" | "slack_post" | "create_ticket" | "webhook"
export type FilterNodeOp = "AND" | "OR"

export interface WorkflowGraph {
  nodes: WorkflowNode[]
  /** React Flow edge format */
  edges: Array<{ id: string; source: string; target: string }>
}

export type WorkflowNode =
  | { id: string; type: "trigger"; position: { x: number; y: number }; data: { trigger: TriggerType; config: Record<string, unknown> } }
  | { id: string; type: "filter"; position: { x: number; y: number }; data: { logic: FilterNodeOp; clauses: FilterClause[] } }
  | { id: string; type: "enrich"; position: { x: number; y: number }; data: { enrichments: Array<"crm" | "sentiment" | "severity"> } }
  | { id: string; type: "action"; position: { x: number; y: number }; data: { action: ActionType; config: Record<string, unknown> } }

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface PaginationParams {
  page?: number
  pageSize?: number
}
