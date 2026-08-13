import { readItems } from "@/lib/store"
import { siteUrl } from "@/lib/site-url"

export const dynamic = "force-dynamic"

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

export async function GET() {
  const base = siteUrl()
  const items = (await readItems())
    .filter((it) => it.aiSelected)
    .slice(0, 50)

  const channel = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>AI4S — AI 热门精选</title>
    <link>${base}/</link>
    <description>AI4S 每日精选 AI 行业动态：模型发布、产品发布、行业事件、论文、教程与观点。</description>
    <language>zh-CN</language>
    <atom:link href="${base}/api/feed" rel="self" type="application/rss+xml" />
    <ttl>30</ttl>
${items
  .map(
    (it) => `    <item>
      <title><![CDATA[${it.titleZh}]]></title>
      <link>${escapeXml(`${base}/items/${encodeURIComponent(it.id)}`)}</link>
      <guid isPermaLink="false">${escapeXml(it.id)}</guid>
      <pubDate>${new Date(it.publishedAt).toUTCString()}</pubDate>
      <description><![CDATA[<p>${escapeXml(it.summaryZh)}</p>
<p>🔗 <a href="${escapeXml(it.url)}">阅读原文</a></p>
<p>来源：${escapeXml(it.source.name)} · 分类：${escapeXml(it.category)}${it.aiSelectedReason ? ` · ${escapeXml(it.aiSelectedReason)}` : ""}</p>]]></description>
    </item>`
  )
  .join("\n")}
  </channel>
</rss>`

  return new Response(channel, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
    },
  })
}
