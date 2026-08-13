import { XMLParser } from "fast-xml-parser"
import type { RawItem } from "./types"
import { GOOGLE_NEWS_QUERIES } from "./sources"

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
})

interface GNewsEntry {
  title?: string
  link?: string
  pubDate?: string
  source?: { "#text"?: string }
}

function toText(v: unknown): string {
  if (typeof v === "string") return v
  if (v && typeof v === "object" && "#text" in (v as object)) {
    return String((v as { "#text"?: unknown })["#text"] ?? "")
  }
  return ""
}

function hostname(url: string): string {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

// 常见域名 → 可读站点名（借鉴 ai4s-daily）
const DOMAIN_NAMES: Record<string, string> = {
  "ithome.com": "IT之家",
  "qbitai.com": "量子位",
  "jiqizhixin.com": "机器之心",
  "leiphone.com": "雷峰网",
  "36kr.com": "36氪",
  "cnbeta.com": "cnBeta",
  "sohu.com": "搜狐",
  "sina.com.cn": "新浪",
  "163.com": "网易",
  "qq.com": "腾讯新闻",
  "ifeng.com": "凤凰网",
  "zhihu.com": "知乎",
  "csdn.net": "CSDN",
  "weibo.com": "微博",
}

export async function fetchGoogleNews(maxItemsPerQuery = 8): Promise<RawItem[]> {
  const results: RawItem[] = []
  for (const src of GOOGLE_NEWS_QUERIES) {
    try {
      const params = new URLSearchParams({
        q: `${src.q} when:1d`,
        hl: "zh-CN",
        gl: "CN",
        ceid: "CN:zh-Hans",
      })
      const res = await fetch(`https://news.google.com/rss/search?${params}`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        cache: "no-store",
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const xml = await res.text()
      const data = parser.parse(xml) as {
        rss?: { channel?: { item?: GNewsEntry[] | GNewsEntry } }
      }
      const items = data.rss?.channel?.item
      if (!items) continue
      const list = Array.isArray(items) ? items : [items]
      let n = 0
      for (const it of list.slice(0, maxItemsPerQuery * 2)) {
        const title = toText(it.title)
        const link = toText(it.link)
        if (!title || !link) continue
        if (n >= maxItemsPerQuery) break
        // Google News 链接带跳转参数，解析真实 URL
        let realUrl = link
        try {
          const u = new URL(link)
          const target = u.searchParams.get("url")
          if (target) realUrl = target
        } catch {
          /* keep original */
        }
        const domain = hostname(realUrl)
        const publisher = DOMAIN_NAMES[domain] || domain || src.name
        results.push({
          url: realUrl,
          title: title,
          content: "",
          publishedAt: toText(it.pubDate)
            ? new Date(toText(it.pubDate)).toISOString()
            : undefined,
          sourceName: `中文·${src.name}（${publisher}）`,
          sourceKind: "rss",
        })
        n++
      }
    } catch (err) {
      console.warn(`[google-news] ${src.name} 抓取失败:`, err instanceof Error ? err.message : err)
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  return results
}
