import type { ConnectorAdapter } from "./adapter"
import type { NormalizedFeedback, ConnectorConfig } from "@voxly/types"
import { SourceType } from "@voxly/types"

interface G2Review {
  id: string
  attributes: {
    title: string
    body: string
    "star-rating": number
    "submitted-at": string
    reviewer?: {
      "job-title"?: string
      "company-size"?: string
    }
    "reviewer-name"?: string
  }
  links?: {
    self?: string
  }
}

interface G2ReviewsResponse {
  data: G2Review[]
  meta: {
    "record-count": number
    "page-count": number
  }
}

/** Map G2 star rating (1-5) to sentiment float (-1.0 to +1.0). */
export function starRatingToSentiment(stars: number): number {
  // 1→-1.0, 2→-0.5, 3→0.0, 4→0.5, 5→1.0
  return (stars - 3) / 2
}

export const g2Connector: ConnectorAdapter = {
  type: SourceType.G2,

  normalize(raw: unknown, _config: ConnectorConfig): NormalizedFeedback[] {
    const review = raw as G2Review
    if (!review?.attributes) return []

    const text = [review.attributes.title, review.attributes.body]
      .filter(Boolean)
      .join("\n\n")
      .trim()

    if (!text) return []

    return [
      {
        externalId:   review.id,
        externalUrl:  review.links?.self,
        verbatimText: text,
        authorName:   review.attributes["reviewer-name"],
        sourceType:   SourceType.G2,
        publishedAt:  new Date(review.attributes["submitted-at"]),
        rawPayload:   raw,
      },
    ]
  },

  async poll(config: ConnectorConfig, since: Date): Promise<NormalizedFeedback[]> {
    const token = config.accessToken
    const productId = config.settings?.productId as string | undefined

    if (!token || !productId) return []

    const sinceIso = since.toISOString().split("T")[0]  // YYYY-MM-DD
    let page = 1
    const results: NormalizedFeedback[] = []

    while (true) {
      const url =
        `https://data.g2.com/api/v1/products/${productId}/reviews` +
        `?page[number]=${page}&page[size]=50` +
        `&filter[submitted-at][gte]=${sinceIso}`

      const res = await fetch(url, {
        headers: {
          Authorization: `Token token="${token}"`,
          "Content-Type": "application/vnd.api+json",
        },
      })

      if (!res.ok) break

      const data = (await res.json()) as G2ReviewsResponse
      if (!data.data?.length) break

      for (const review of data.data) {
        const normalized = g2Connector.normalize(review, config)
        results.push(...normalized)
      }

      if (page >= data.meta["page-count"]) break
      page++
    }

    return results
  },

  async validate(config: ConnectorConfig): Promise<{ valid: boolean; error?: string }> {
    if (!config.accessToken) return { valid: false, error: "Missing G2 API token" }
    if (!config.settings?.productId) return { valid: false, error: "Missing G2 product ID" }
    return { valid: true }
  },
}
