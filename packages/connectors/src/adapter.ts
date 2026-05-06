import type { ConnectorConfig, NormalizedFeedback, SourceType } from "@voxly/types"

/**
 * Every connector implements this interface.
 * Adding a new source = implementing these methods, no pipeline changes needed.
 */
export interface ConnectorAdapter {
  readonly type: SourceType

  /** Transform a raw source payload into normalized feedback items.
   *  Gong returns N items from one transcript; all other sources return 1. */
  normalize(raw: unknown, config: ConnectorConfig): NormalizedFeedback[]

  /** Register a webhook with the provider on first connector setup. */
  setupWebhook?(connectorId: string, config: ConnectorConfig): Promise<void>

  /** Fetch items published after `since` (polling sources: G2, HN, Reddit). */
  poll?(config: ConnectorConfig, since: Date): Promise<NormalizedFeedback[]>

  /** Validate credentials and config before saving the connector. */
  validate(config: ConnectorConfig): Promise<{ valid: boolean; error?: string }>
}
