import type { WorkflowGraph } from "@voxly/types"

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  icon: string
  graph: WorkflowGraph
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "enterprise-critical-alert",
    name: "Enterprise Critical Alert",
    description: "Posts to Slack #product-alerts whenever new Enterprise feedback arrives",
    icon: "AlertTriangle",
    graph: {
      nodes: [
        {
          id: "trigger-1",
          type: "trigger",
          position: { x: 200, y: 80 },
          data: { trigger: "new_feedback", config: {} },
        },
        {
          id: "filter-1",
          type: "filter",
          position: { x: 200, y: 220 },
          data: {
            logic: "AND",
            clauses: [{ field: "customer.tier", operator: "eq", value: "ENTERPRISE" }],
          },
        },
        {
          id: "action-1",
          type: "action",
          position: { x: 200, y: 360 },
          data: {
            action: "slack_post",
            config: {
              channel: "#product-alerts",
              template: "Enterprise feedback: {{summary}}",
            },
          },
        },
      ],
      edges: [
        { id: "e1", source: "trigger-1", target: "filter-1" },
        { id: "e2", source: "filter-1", target: "action-1" },
      ],
    },
  },
  {
    id: "bug-auto-triage",
    name: "Bug Auto-Triage",
    description: "Creates a Linear ticket for every high-severity feedback item",
    icon: "Bug",
    graph: {
      nodes: [
        {
          id: "trigger-1",
          type: "trigger",
          position: { x: 200, y: 80 },
          data: { trigger: "new_feedback", config: {} },
        },
        {
          id: "filter-1",
          type: "filter",
          position: { x: 200, y: 220 },
          data: {
            logic: "AND",
            clauses: [{ field: "severity", operator: "eq", value: "HIGH" }],
          },
        },
        {
          id: "action-1",
          type: "action",
          position: { x: 200, y: 360 },
          data: { action: "create_ticket", config: { provider: "linear" } },
        },
      ],
      edges: [
        { id: "e1", source: "trigger-1", target: "filter-1" },
        { id: "e2", source: "filter-1", target: "action-1" },
      ],
    },
  },
  {
    id: "theme-spike-notification",
    name: "Theme Spike Notification",
    description: "Alerts your team in Slack when a feedback theme volume spikes",
    icon: "TrendingUp",
    graph: {
      nodes: [
        {
          id: "trigger-1",
          type: "trigger",
          position: { x: 200, y: 80 },
          data: { trigger: "theme_spike", config: {} },
        },
        {
          id: "action-1",
          type: "action",
          position: { x: 200, y: 220 },
          data: {
            action: "slack_post",
            config: {
              channel: "#product-alerts",
              template: "Theme spike detected: {{summary}}",
            },
          },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "action-1" }],
    },
  },
  {
    id: "cs-escalation-router",
    name: "CS Escalation Router",
    description: "Assigns a CSM whenever an Enterprise customer leaves negative feedback",
    icon: "UserCheck",
    graph: {
      nodes: [
        {
          id: "trigger-1",
          type: "trigger",
          position: { x: 200, y: 80 },
          data: { trigger: "new_feedback", config: {} },
        },
        {
          id: "filter-1",
          type: "filter",
          position: { x: 200, y: 220 },
          data: {
            logic: "AND",
            clauses: [
              { field: "customer.tier", operator: "eq", value: "ENTERPRISE" },
              { field: "sentiment", operator: "lt", value: -0.3 },
            ],
          },
        },
        {
          id: "action-1",
          type: "action",
          position: { x: 200, y: 360 },
          data: { action: "assign", config: { userId: "" } },
        },
      ],
      edges: [
        { id: "e1", source: "trigger-1", target: "filter-1" },
        { id: "e2", source: "filter-1", target: "action-1" },
      ],
    },
  },
  {
    id: "weekly-digest",
    name: "Weekly Digest",
    description: "Posts a weekly summary of top themes to your Slack channel",
    icon: "CalendarDays",
    graph: {
      nodes: [
        {
          id: "trigger-1",
          type: "trigger",
          position: { x: 200, y: 80 },
          data: { trigger: "schedule", config: { cron: "0 9 * * MON" } },
        },
        {
          id: "action-1",
          type: "action",
          position: { x: 200, y: 220 },
          data: {
            action: "slack_post",
            config: {
              channel: "#product-weekly",
              template: "Weekly feedback digest: {{summary}}",
            },
          },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "action-1" }],
    },
  },
]
