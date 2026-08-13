import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/site-header";
import ItemCard from "@/components/item-card";
import Pagination from "@/components/pagination";
import { readItems, readVoteCounts } from "@/lib/store";
import { searchItems } from "@/lib/search";
import { CATEGORY_LABELS, type Category } from "@/lib/types";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI4S — 全部 AI 动态",
  description: "AI4S 全部 AI 行业动态，支持全文搜索。",
};

const PAGE_SIZE = 30;

const CATS = Object.entries(CATEGORY_LABELS) as Array<[Category, string]>;

interface AllProps {
  searchParams: Promise<{ q?: string; category?: string; page?: string }>;
}

export default async function AllPage({ searchParams }: AllProps) {
  const { q = "", category, page: pageParam } = await searchParams;
  const activeCat =
    category && category in CATEGORY_LABELS ? (category as Category) : undefined;
  const page = Math.max(1, Number(pageParam) || 1);

  const items = await readItems();
  const voteCounts = await readVoteCounts();
  const results = searchItems(items, { q, category: activeCat });
  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pageItems = results.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const query: Record<string, string> = {};
  if (q) query.q = q;
  if (activeCat) query.category = activeCat;

  return (
    <main className={styles.main}>
      <SiteHeader active="all" />

      <section className={styles.hero}>
        <h1 className={styles.pageTitle}>全部 AI 动态</h1>
        <p className={styles.pageSubtitle}>
          {results.length} 条动态{q && ` · 搜索「${q}」`}
          {results.length > PAGE_SIZE && ` · 第 ${current}/${totalPages} 页`}
        </p>
      </section>

      <form action="/all" method="GET" className={styles.searchForm}>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="搜索标题、摘要、标签、来源…"
          className={styles.searchInput}
          autoComplete="off"
        />
        {activeCat && <input type="hidden" name="category" value={activeCat} />}
        <button type="submit" className={styles.searchBtn}>
          搜索
        </button>
      </form>

      <nav className={styles.catNav}>
        <Link
          href={q ? `/all?q=${encodeURIComponent(q)}` : "/all"}
          className={`${styles.catLink} ${!activeCat ? styles.catActive : ""}`}
        >
          全部
        </Link>
        {CATS.map(([key, label]) => {
          const active = activeCat === key;
          const href = `/all?${q ? `q=${encodeURIComponent(q)}&` : ""}category=${key}`;
          return (
            <Link
              key={key}
              href={href}
              className={`${styles.catLink} ${active ? styles.catActive : ""}`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {pageItems.length === 0 ? (
        <div className={styles.empty}>
          <p>没有匹配的动态。</p>
        </div>
      ) : (
        <>
          <div className={styles.grid}>
            {pageItems.map((item) => (
              <ItemCard key={item.id} item={item} votes={voteCounts.get(item.id) ?? 0} />
            ))}
          </div>
          <Pagination
            current={current}
            total={results.length}
            pageSize={PAGE_SIZE}
            basePath="/all"
            query={query}
          />
        </>
      )}
    </main>
  );
}
