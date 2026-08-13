import { readItems } from "@/lib/store"
import { buildAllReports } from "@/lib/daily"
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
  const items = await readItems()
  const itemMap = new Map(items.map((it) => [it.id, it]))
  const reports = (await buildAllReports()).slice(0, 30)

  const channel = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AI4S 日报</title>
    <link>${base}/daily</link>
    <description>AI4S 每日 AI 行业日报：精选动态与头条。</description>
    <language>zh-CN</language>
    <atom:link href="${base}/api/feed/daily" rel="self" type="application/rss+xml" />
    <ttl>60</ttl>
${reports
  .map((r) => {
    const headlines = r.headlineIds
      .map((id) => itemMap.get(id))
      .filter(Boolean)
      .map((it) => `<li>${escapeXml(it!.titleZh)}</li>`)
      .join("")
    return `    <item>
      <title><![CDATA[${escapeXml(r.title)}]]></title>
      <link>${base}/daily</link>
      <guid isPermaLink="false">${escapeXml(r.id)}</guid>
      <pubDate>${new Date(r.publishedAt).toUTCString()}</pubDate>
      <description><![CDATA[<p>${escapeXml(r.summary)}</p><ul>${headlines}</ul>]]></description>
    </item>`
  })
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
