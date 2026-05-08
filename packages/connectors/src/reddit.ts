import type { ConnectorAdapter } from "./adapter"
import type { NormalizedFeedback, ConnectorConfig } from "@voxly/types"
import { SourceType } from "@voxly/types"

interface RedditPost {
  id: string
  name: string
  title: string
  selftext: string
  author: string
  permalink: string
  url: string
  created_utc: number
  subreddit: string
  score: number
  num_comments: number
  is_self: boolean
}

interface RedditComment {
  id: string
  name: string
  body: string
  author: string
  permalink: string
  created_utc: number
  subreddit: string
  score: number
  link_title?: string
}

interface RedditListingChild<T> {
  kind: string
  data: T
}

interface RedditListing<T> {
  kind: string
  data: {
    children: RedditListingChild<T>[]
    after: string | null
    before: string | null
  }
}

const REDDIT_USER_AGENT = "Voxly/1.0 (feedback aggregator; contact support@voxly.app)"
const MAX_PAGES = 3

async function fetchSubredditNew(
  subreddit: string,
  since: Date,
): Promise<NormalizedFeedback[]> {
  const results: NormalizedFeedback[] = []
  let after: string | null = null

  for (let page = 0; page < MAX_PAGES; page++) {
    const url =
      `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/new.json` +
      `?limit=100${after ? `&after=${after}` : ""}`

    const res = await fetch(url, {
      headers: { "User-Agent": REDDIT_USER_AGENT },
    })

    if (!res.ok) break

    const listing = (await res.json()) as RedditListing<RedditPost>
    const children = listing.data.children

    if (children.length === 0) break

    for (const child of children) {
      const post = child.data
      if (post.created_utc < since.getTime() / 1000) {
        // Posts are newest-first; once we're past `since`, stop paging
        return results
      }

      if (post.author === "[deleted]" || post.author === "AutoModerator") continue

      const text = post.is_self && post.selftext
        ? `${post.title}\n\n${post.selftext}`.trim()
        : post.title

      if (text.length < 10) continue

      results.push({
        externalId:   `post:${post.id}`,
        externalUrl:  `https://www.reddit.com${post.permalink}`,
        verbatimText: text,
        authorName:   `u/${post.author}`,
        authorUrl:    `https://www.reddit.com/user/${post.author}`,
        sourceType:   SourceType.REDDIT,
        publishedAt:  new Date(post.created_utc * 1000),
        rawPayload:   post,
      })
    }

    after = listing.data.after
    if (!after) break

    // Respect rate limits: ~1 req/sec for public API
    await new Promise((r) => setTimeout(r, 1100))
  }

  return results
}

async function searchSubreddit(
  subreddit: string,
  keywords: string[],
  since: Date,
): Promise<NormalizedFeedback[]> {
  const query = keywords.map((k) => `"${k}"`).join(" OR ")
  const results: NormalizedFeedback[] = []

  const url =
    `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search.json` +
    `?q=${encodeURIComponent(query)}&sort=new&restrict_sr=1&limit=100` +
    `&t=week`

  const res = await fetch(url, {
    headers: { "User-Agent": REDDIT_USER_AGENT },
  })

  if (!res.ok) return results

  const listing = (await res.json()) as RedditListing<RedditPost>

  for (const child of listing.data.children) {
    const post = child.data
    if (post.created_utc < since.getTime() / 1000) continue
    if (post.author === "[deleted]" || post.author === "AutoModerator") continue

    const text = post.is_self && post.selftext
      ? `${post.title}\n\n${post.selftext}`.trim()
      : post.title

    if (text.length < 10) continue

    results.push({
      externalId:   `search:${post.id}`,
      externalUrl:  `https://www.reddit.com${post.permalink}`,
      verbatimText: text,
      authorName:   `u/${post.author}`,
      authorUrl:    `https://www.reddit.com/user/${post.author}`,
      sourceType:   SourceType.REDDIT,
      publishedAt:  new Date(post.created_utc * 1000),
      rawPayload:   post,
    })
  }

  return results
}

export const redditConnector: ConnectorAdapter = {
  type: SourceType.REDDIT,

  normalize(raw: unknown, _config: ConnectorConfig): NormalizedFeedback[] {
    // Raw items are already NormalizedFeedback from poll()
    return [raw as NormalizedFeedback]
  },

  async poll(config: ConnectorConfig, since: Date): Promise<NormalizedFeedback[]> {
    const subreddits = (config.settings?.subreddits as string[] | undefined) ?? []
    const keywords = (config.settings?.keywords as string[] | undefined) ?? []

    if (subreddits.length === 0) return []

    const all: NormalizedFeedback[] = []

    for (const subreddit of subreddits) {
      // Fetch newest posts from subreddit
      const posts = await fetchSubredditNew(subreddit, since)
      all.push(...posts)

      // Also keyword-search for cross-subreddit mentions if keywords provided
      if (keywords.length > 0) {
        await new Promise((r) => setTimeout(r, 1100))
        const searched = await searchSubreddit(subreddit, keywords, since)
        // Deduplicate by externalId (search may overlap with new posts)
        const existingIds = new Set(all.map((i) => i.externalId))
        all.push(...searched.filter((i) => !existingIds.has(i.externalId)))
      }

      if (subreddits.indexOf(subreddit) < subreddits.length - 1) {
        await new Promise((r) => setTimeout(r, 1100))
      }
    }

    return all
  },

  async validate(config: ConnectorConfig): Promise<{ valid: boolean; error?: string }> {
    const subreddits = (config.settings?.subreddits as string[] | undefined) ?? []

    if (subreddits.length === 0) {
      return { valid: false, error: "At least one subreddit is required" }
    }

    // Check the first subreddit is accessible
    const sub = subreddits[0]!
    try {
      const res = await fetch(`https://www.reddit.com/r/${encodeURIComponent(sub)}/about.json`, {
        headers: { "User-Agent": REDDIT_USER_AGENT },
      })
      if (res.status === 404) return { valid: false, error: `Subreddit r/${sub} not found` }
      if (res.status === 403) return { valid: false, error: `Subreddit r/${sub} is private` }
      if (!res.ok) return { valid: false, error: `Could not access r/${sub} (${res.status})` }
    } catch {
      return { valid: false, error: "Network error checking subreddit" }
    }

    return { valid: true }
  },
}
