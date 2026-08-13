import type { Metadata } from "next";
import SiteHeader from "@/components/site-header";
import CategoryChips from "@/components/category-chips";
import ItemCard from "@/components/item-card";
import Pagination from "@/components/pagination";
import { readItems } from "@/lib/store";
import { CATEGORY_LABELS, type Category } from "@/lib/types";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI4S — AI 行业动态聚合 · 每日精选",
  description:
    "AI4S 每日精选 AI 行业动态：模型发布、产品发布、行业事件、论文、教程与观点。",
};

const PAGE_SIZE = 30;

interface HomeProps {
  searchParams: Promise<{ category?: string; page?: string }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const { category, page: pageParam } = await searchParams;
  const active: Category | "all" =
    category && category in CATEGORY_LABELS
      ? (category as Category)
      : "all";

  const items = await readItems();
  const filtered =
    active === "all"
      ? items.filter((it) => it.aiSelected)
      : items.filter((it) => it.aiSelected && it.category === active);

  const sorted = [...filtered].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  const page = Math.max(1, Number(pageParam) || 1);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pageItems = sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const query: Record<string, string> = {};
  if (active !== "all") query.category = active;

  const today = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());

  const subtitle =
    active === "all"
      ? `${today} · AI 自动挑选的高价值内容`
      : `${today} · ${CATEGORY_LABELS[active]}类精选`;

  return (
    <main className={styles.main}>
      <SiteHeader active="feed" />

      <section className={styles.hero}>
        <h1 className={styles.pageTitle}>
          {active === "all" ? "精选" : CATEGORY_LABELS[active]}
        </h1>
        <p className={styles.pageSubtitle}>
          {subtitle}
          {sorted.length > PAGE_SIZE && ` · 第 ${current}/${totalPages} 页`}
        </p>
      </section>

      <div className={styles.chips}>
        <CategoryChips active={active} />
      </div>

      {pageItems.length === 0 ? (
        <div className={styles.empty}>
          <p>该分类暂时没有精选内容。</p>
          <p className={styles.emptyHint}>
            运行 <code className="mono">npm run ingest</code> 触发抓取 + AI 加工。
          </p>
        </div>
      ) : (
        <>
          <div className={styles.grid}>
            {pageItems.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
          <Pagination
            current={current}
            total={sorted.length}
            pageSize={PAGE_SIZE}
            basePath="/"
            query={query}
          />
        </>
      )}
    </main>
  );
}
