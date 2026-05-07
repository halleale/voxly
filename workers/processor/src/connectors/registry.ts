import type { ConnectorAdapter } from "@voxly/connectors"
import { SlackAdapter, IntercomAdapter, HubSpotAdapter } from "@voxly/connectors"

// Registry maps SourceType enum values to their adapter instance
export const REGISTRY: Partial<Record<string, ConnectorAdapter>> = {
  SLACK: new SlackAdapter(),
  INTERCOM: new IntercomAdapter(),
  HUBSPOT: new HubSpotAdapter(),
}
