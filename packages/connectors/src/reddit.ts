import type { ConnectorAdapter } from "./adapter"
import type { NormalizedFeedback, ConnectorConfig } from "@voxly/types"
import { SourceType } from "@voxly/types"

interface RedditPost {
  id: string
  name: string
  title: string
  selftext: string
  url: string
  author: string
  created_utc: number
  permalink: string
  subreddit_name_prefixed: string
  score: number
  num_comments: number
}

interface RedditChild {
  kind: "t3"
  data: RedditPost
}

interface RedditSearchResponse {
  data: {
    children: RedditChild[]
    after: string | null
    before: string | null
  }
}

async function searchReddit(
  keywords: string[],
  subreddits: string[],
  since: Date,
): Promise<RedditPost[]> {
  const query = keywords.map((k) => `"${k}"`).join(" OR ")
  const sinceUtc = Math.floor(since.getTime() / 1000)
  const results: RedditPost[] = []

  const bases = subreddits.length > 0
    ? subreddits.map((s) => `https://www.reddit.com/r/${s}/search.json?restrict_sr=1`)
    : ["https://www.reddit.com/search.json"]

  for (const base of bases) {
    let after: string | null = null
    let page = 0

    while (page < 5) {
      const url =
        `${base}` +
        `&q=${encodeURIComponent(query)}` +
        `&sort=new` +
        `&limit=100` +
        (after ? `&after=${after}` : "")

      let res: Response
      try {
        res = await fetch(url, {
          headers: {
            "User-Agent": "voxly-feedback-aggregator/1.0",
            Accept: "application/json",
          },
        })
      } catch {
        break
      }

      if (!res.ok) break

      const data = (await res.json()) as RedditSearchResponse
      const children = data.data.children ?? []

      for (const child of children) {
        const post = child.data
        if (post.created_utc < sinceUtc) continue
        // Only include posts with actual text content (self posts) or a meaningful title
        if (post.selftext || post.title.length > 10) {
          results.push(post)
        }
      }

      // Stop if no more pages or all remaining are older than `since`
      if (!data.data.after || children.length === 0) break
      const oldestInPage = children[children.length - 1]?.data.created_utc ?? 0
      if (oldestInPage < sinceUtc) break

      after = data.data.after
      page++
    }
  }

  return results
}

export const redditConnector: ConnectorAdapter = {
  type: SourceType.REDDIT,

  normalize(raw: unknown, _config: ConnectorConfig): NormalizedFeedback[] {
    const post = raw as RedditPost

    const text = post.selftext?.trim()
      ? `${post.title}\n\n${post.selftext}`.trim()
      : post.title.trim()

    if (!text) return []

    return [
      {
        externalId:   post.name,  // "t3_<id>"
        externalUrl:  `https://www.reddit.com${post.permalink}`,
        verbatimText: text,
        authorName:   post.author,
        authorUrl:    `https://www.reddit.com/user/${post.author}`,
        sourceType:   SourceType.REDDIT,
        publishedAt:  new Date(post.created_utc * 1000),
        rawPayload:   raw,
      },
    ]
  },

  async poll(config: ConnectorConfig, since: Date): Promise<NormalizedFeedback[]> {
    const keywords   = (config.settings?.keywords   as string[] | undefined) ?? []
    const subreddits = (config.settings?.subreddits as string[] | undefined) ?? []

    if (keywords.length === 0) return []

    const posts = await searchReddit(keywords, subreddits, since)
    return posts.flatMap((post) => redditConnector.normalize(post, config))
  },

  async validate(config: ConnectorConfig): Promise<{ valid: boolean; error?: string }> {
    const keywords = (config.settings?.keywords as string[] | undefined) ?? []
    if (keywords.length === 0) {
      return { valid: false, error: "At least one keyword is required for Reddit monitoring" }
    }
    return { valid: true }
  },
}
