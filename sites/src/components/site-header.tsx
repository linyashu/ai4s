import Link from "next/link";
import styles from "./site-header.module.css";

export type MainTab = "feed" | "hot" | "stories" | "daily" | "all" | "benchmark" | "github";

const TABS: Array<{ key: MainTab; href: string; label: string }> = [
  { key: "feed", href: "/", label: "精选" },
  { key: "hot", href: "/hot", label: "热门" },
  { key: "stories", href: "/stories", label: "事件" },
  { key: "benchmark", href: "/benchmark", label: "测评" },
  { key: "github", href: "/github", label: "GitHub" },
  { key: "daily", href: "/daily", label: "日报" },
  { key: "all", href: "/all", label: "全部" },
];

export default function SiteHeader({ active }: { active: MainTab }) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          <span className={styles.logo}>AI4S</span>
          <span className={styles.slogan}>AI 行业动态聚合 · 每日精选</span>
        </Link>

        <div className={styles.right}>
          <a
            className={styles.rss}
            href="/api/feed"
            target="_blank"
            rel="noreferrer"
            aria-label="精选 RSS 订阅"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 11a9 9 0 0 1 9 9" />
              <path d="M4 4a16 16 0 0 1 16 16" />
              <circle cx="5" cy="19" r="1" />
            </svg>
            <span>RSS</span>
          </a>
          <Link href="/all#search" className={styles.search} aria-label="搜索全部动态">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </Link>
        </div>
      </div>

      <nav className={styles.nav} aria-label="主导航">
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
