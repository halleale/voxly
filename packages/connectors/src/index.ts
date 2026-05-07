export type { ConnectorAdapter } from "./adapter"
export { slackConnector, verifySlackSignature } from "./slack"
export { intercomConnector, verifyIntercomSignature } from "./intercom"
export { hubspotConnector, fetchHubSpotCompanies } from "./hubspot"
export type { NormalizedCustomer } from "./hubspot"
export { stage1HardFilter, stage2SourceFilter } from "./filters"
export type { FilterResult } from "./filters"

import type { ConnectorAdapter } from "./adapter"
import { slackConnector } from "./slack"
import { intercomConnector } from "./intercom"
import { hubspotConnector } from "./hubspot"
import { SourceType } from "@voxly/types"

/** Registry: look up a connector adapter by source type. */
export const connectorRegistry: Record<string, ConnectorAdapter> = {
  [SourceType.SLACK]:    slackConnector,
  [SourceType.INTERCOM]: intercomConnector,
  [SourceType.HUBSPOT]:  hubspotConnector,
}
