export type { ConnectorAdapter } from "./adapter"
export { slackConnector, verifySlackSignature } from "./slack"
export { intercomConnector, verifyIntercomSignature } from "./intercom"
export { hubspotConnector, fetchHubSpotCompanies } from "./hubspot"
export type { NormalizedCustomer } from "./hubspot"
export {
  linearConnector,
  fetchLinearTeams,
  createLinearIssue,
  addLinearComment,
  buildLinearIssueBody,
} from "./linear"
export type { CreateLinearIssueInput, LinearIssue } from "./linear"
export { zendeskConnector, verifyZendeskSignature } from "./zendesk"
export { g2Connector, starRatingToSentiment } from "./g2"
export { gongConnector, verifyGongSignature } from "./gong"
export { cannyConnector, verifyCannySignature } from "./canny"
export { hnConnector } from "./hn"
export { redditConnector } from "./reddit"
export { salesforceConnector, fetchSalesforceAccounts, exchangeSalesforceCode } from "./salesforce"
export {
  jiraConnector,
  fetchJiraCloudId,
  fetchJiraProjects,
  createJiraIssue,
  addJiraComment,
  fetchJiraIssueStatus,
  buildJiraIssueDescription,
} from "./jira"
export type { CreateJiraIssueInput, JiraIssue, JiraProject } from "./jira"
export { stage1HardFilter, stage2SourceFilter } from "./filters"
export type { FilterResult } from "./filters"

import type { ConnectorAdapter } from "./adapter"
import { slackConnector } from "./slack"
import { intercomConnector } from "./intercom"
import { hubspotConnector } from "./hubspot"
import { linearConnector } from "./linear"
import { zendeskConnector } from "./zendesk"
import { g2Connector } from "./g2"
import { gongConnector } from "./gong"
import { cannyConnector } from "./canny"
import { hnConnector } from "./hn"
import { redditConnector } from "./reddit"
import { salesforceConnector } from "./salesforce"
import { jiraConnector } from "./jira"
import { SourceType } from "@voxly/types"

/** Registry: look up a connector adapter by source type. */
export const connectorRegistry: Record<string, ConnectorAdapter> = {
  [SourceType.SLACK]:       slackConnector,
  [SourceType.INTERCOM]:    intercomConnector,
  [SourceType.HUBSPOT]:     hubspotConnector,
  [SourceType.LINEAR]:      linearConnector,
  [SourceType.ZENDESK]:     zendeskConnector,
  [SourceType.G2]:          g2Connector,
  [SourceType.GONG]:        gongConnector,
  [SourceType.CANNY]:       cannyConnector,
  [SourceType.HN]:          hnConnector,
  [SourceType.REDDIT]:      redditConnector,
  [SourceType.SALESFORCE]:  salesforceConnector,
  [SourceType.JIRA]:        jiraConnector,
}
