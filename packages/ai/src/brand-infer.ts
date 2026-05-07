import { getOpenAI } from "./client"

export interface BrandProfile {
  brandName: string
  keywords: string[]
}

// Extracts key text signals from a homepage's HTML without a full DOM parser.
function extractMetaSignals(html: string, domain: string): string {
  const snippets: string[] = []

  const pick = (pattern: RegExp) => {
    const m = html.match(pattern)
    if (m?.[1]) snippets.push(m[1].trim())
  }

  pick(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']{1,120})["']/i)
  pick(/<meta[^>]+content=["']([^"']{1,120})["'][^>]+property=["']og:site_name["']/i)
  pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{1,120})["']/i)
  pick(/<meta[^>]+content=["']([^"']{1,120})["'][^>]+property=["']og:title["']/i)
  pick(/<title[^>]*>([^<]{1,120})<\/title>/i)
  pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})["']/i)
  pick(/<meta[^>]+content=["']([^"']{1,300})["'][^>]+name=["']description["']/i)

  // Grab top-level nav link text as product name hints (first 20 matches)
  const navPattern = /<a[^>]+href=["'][/][^"']*["'][^>]*>([^<]{2,40})<\/a>/gi
  let m: RegExpExecArray | null
  let navCount = 0
  while ((m = navPattern.exec(html)) !== null && navCount < 20) {
    const text = m[1].trim()
    if (text && !/sign.?in|log.?in|sign.?up|register|contact|blog|docs|pricing/i.test(text)) {
      snippets.push(text)
      navCount++
    }
  }

  snippets.push(`Domain: ${domain}`)
  return snippets.join("\n")
}

const SYSTEM_PROMPT = `You are a brand analyst. Given signals extracted from a company's homepage, return a JSON object with:
- "brandName": the primary brand/company name (string)
- "keywords": an array of 4-12 strings people would use when discussing this brand online — include the brand name itself, product names, common abbreviations, and technology nicknames. Keep each keyword short (1-4 words). No duplicates, no generic words like "software" or "platform".

Respond with raw JSON only, no markdown fences.`

export async function inferBrandProfile(website: string): Promise<BrandProfile> {
  // Normalise the URL
  const url = website.startsWith("http") ? website : `https://${website}`
  const domain = new URL(url).hostname.replace(/^www\./, "")

  let signals = `Domain: ${domain}`
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Voxly-BrandBot/1.0 (feedback intelligence; +https://voxly.io)" },
    })
    clearTimeout(timeout)
    if (res.ok) {
      // Read at most 200 KB to avoid huge pages
      const reader = res.body?.getReader()
      if (reader) {
        const chunks: Uint8Array[] = []
        let total = 0
        while (total < 200_000) {
          const { done, value } = await reader.read()
          if (done || !value) break
          chunks.push(value)
          total += value.length
        }
        reader.cancel()
        const html = new TextDecoder().decode(
          chunks.reduce((a, b) => {
            const merged = new Uint8Array(a.length + b.length)
            merged.set(a)
            merged.set(b, a.length)
            return merged
          }, new Uint8Array(0))
        )
        signals = extractMetaSignals(html, domain)
      }
    }
  } catch {
    // Scrape failed — fall back to domain-only signals; LLM will still produce a reasonable result
  }

  const client = getOpenAI()
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Homepage signals:\n${signals}` },
    ],
    max_tokens: 300,
    temperature: 0.2,
    response_format: { type: "json_object" },
  })

  try {
    const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}")
    const brandName: string =
      typeof parsed.brandName === "string" && parsed.brandName ? parsed.brandName : domain
    const keywords: string[] = Array.isArray(parsed.keywords)
      ? parsed.keywords.filter((k: unknown) => typeof k === "string" && k.length > 0).slice(0, 12)
      : [brandName]
    return { brandName, keywords }
  } catch {
    return { brandName: domain, keywords: [domain] }
  }
}
