export function siteUrl(): string {
  return (process.env.SITE_URL || "https://ai4s.local").replace(/\/+$/, "")
}
