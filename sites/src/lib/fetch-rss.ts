import { XMLParser } from "fast-xml-parser"
import type { FeedSource } from "./sources"
import type { RawItem } from "./types"

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
})

interface RawRSSItem {
  title?: string | { "#text"?: string }
  link?: string
  pubDate?: string
  published?: string
  updated?: string
  description?: string | { "#text"?: string }
  "content:encoded"?: string | { "#text"?: string }
  summary?: string | { "#text"?: string }
}

function toText(v: unknown): string {
  if (typeof v === "string") return v
  if (v && typeof v === "object" && "#text" in (v as object)) {
    return String((v as { "#text"?: unknown })["#text"] ?? "")
  }
  return ""
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

export async function fetchFeed(source: FeedSource): Promise<RawItem[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)

  try {
    const res = await fetch(source.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const xml = await res.text()
    const data = parser.parse(xml) as {
      rss?: { channel?: { item?: RawRSSItem[] | RawRSSItem } }
      feed?: { entry?: RawRSSItem[] | RawRSSItem }
    }

    let items: RawRSSItem[] = []
    if (data.rss?.channel?.item) {
      items = Array.isArray(data.rss.channel.item)
        ? data.rss.channel.item
        : [data.rss.channel.item]
    } else if (data.feed?.entry) {
      items = Array.isArray(data.feed.entry) ? data.feed.entry : [data.feed.entry]
    }

    const result: RawItem[] = []
    for (const it of items) {
      const link =
        toText(it.link) ||
        (typeof it.link === "object" &&
          "@_href" in it.link &&
          String(it.link["@_href"])) ||
        ""
      const title = toText(it.title)
      if (!link || !title) continue
      const content = stripHtml(
        toText(it["content:encoded"]) || toText(it.description) || toText(it.summary)
      )
      const dateStr = toText(it.pubDate) || toText(it.published) || toText(it.updated)
      result.push({
        url: link,
        title,
        content: content.slice(0, 4000),
        publishedAt: dateStr ? new Date(dateStr).toISOString() : undefined,
        sourceName: source.name,
        sourceKind: source.kind,
      })
    }

    const max = source.maxItems ?? 20
    return result.slice(0, max)
  } finally {
    clearTimeout(timer)
  }
}
