import type { ConnectorAdapter } from "./adapter"
import type { NormalizedFeedback, ConnectorConfig } from "@voxly/types"
import { SourceType } from "@voxly/types"

interface HNSearchHit {
  objectID:   string
  comment_text?: string
  story_title?: string
  title?: string
  url?: string
  story_url?: string
  author:     string
  created_at: string
  _tags:      string[]
}

interface HNSearchResponse {
  hits: HNSearchHit[]
  nbHits: number
  page: number
  nbPages: number
  hitsPerPage: number
}

/**
 * Search Hacker News via the public Algolia API.
 * Returns posts and comments matching the keywords since the given date.
 */
async function searchHN(keywords: string[], since: Date): Promise<HNSearchHit[]> {
  const sinceTs = Math.floor(since.getTime() / 1000)
  const query = keywords.join(" OR ")

  // Search both comments and story types for broader coverage
  const tags = "comment,story"
  let page = 0
  const results: HNSearchHit[] = []

  while (true) {
    const url =
      `https://hn.algolia.com/api/v1/search_by_date` +
      `?query=${encodeURIComponent(query)}` +
      `&tags=${tags}` +
      `&numericFilters=created_at_i>${sinceTs}` +
      `&hitsPerPage=50` +
      `&page=${page}`

    const res = await fetch(url)
    if (!res.ok) break

    const data = (await res.json()) as HNSearchResponse
    if (!data.hits?.length) break

    results.push(...data.hits)

    if (page >= data.nbPages - 1 || page >= 4) break  // cap at 5 pages
    page++
  }

  return results
}

export const hnConnector: ConnectorAdapter = {
  type: SourceType.HN,

  normalize(raw: unknown, _config: ConnectorConfig): NormalizedFeedback[] {
    const hit = raw as HNSearchHit

    const text = (hit.comment_text ?? hit.title ?? "").replace(/<[^>]*>/g, "").trim()
    if (!text) return []

    const externalUrl = hit.url ?? hit.story_url
      ? `https://news.ycombinator.com/item?id=${hit.objectID}`
      : `https://news.ycombinator.com/item?id=${hit.objectID}`

    return [
      {
        externalId:   hit.objectID,
        externalUrl,
        verbatimText: text,
        authorName:   hit.author,
        authorUrl:    `https://news.ycombinator.com/user?id=${hit.author}`,
        sourceType:   SourceType.HN,
        publishedAt:  new Date(hit.created_at),
        rawPayload:   raw,
      },
    ]
  },

  async poll(config: ConnectorConfig, since: Date): Promise<NormalizedFeedback[]> {
    const keywords = (config.settings?.keywords as string[] | undefined) ?? []
    if (keywords.length === 0) return []

    const hits = await searchHN(keywords, since)
    const results: NormalizedFeedback[] = []

    for (const hit of hits) {
      const normalized = hnConnector.normalize(hit, config)
      results.push(...normalized)
    }

    return results
  },

  async validate(config: ConnectorConfig): Promise<{ valid: boolean; error?: string }> {
    const keywords = (config.settings?.keywords as string[] | undefined) ?? []
    if (keywords.length === 0) {
      return { valid: false, error: "At least one keyword is required for HN monitoring" }
    }
    return { valid: true }
  },
}
