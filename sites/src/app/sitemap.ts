import type { MetadataRoute } from "next";
import { readItems, readStories } from "@/lib/store";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

const BASE = siteUrl();

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now },
    { url: `${BASE}/hot`, lastModified: now },
    { url: `${BASE}/stories`, lastModified: now },
    { url: `${BASE}/daily`, lastModified: now },
    { url: `${BASE}/all`, lastModified: now },
  ];

  const items = await readItems();
  const itemRoutes: MetadataRoute.Sitemap = items
    .filter((it) => it.aiSelected)
    .slice(0, 500)
    .map((it) => ({
      url: `${BASE}/items/${encodeURIComponent(it.id)}`,
      lastModified: new Date(it.publishedAt),
    }));

  const stories = await readStories();
  const storyRoutes: MetadataRoute.Sitemap = stories.slice(0, 200).map((s) => ({
    url: `${BASE}/stories/${s.id}`,
    lastModified: new Date(s.publishedAt),
  }));

  return [...staticRoutes, ...itemRoutes, ...storyRoutes];
}
