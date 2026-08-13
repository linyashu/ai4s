import type { Metadata } from "next";
import SiteHeader from "@/components/site-header";
import { readGitHubTrending } from "@/lib/github-store";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI4S — GitHub AI 周热榜",
  description: "AI4S GitHub AI 周热榜：近 7 天创建的 AI/LLM/Agent 热门仓库，按 stars 排序。",
};

function fmtStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "今天";
  if (days < 7) return `${days} 天前`;
  return `${Math.floor(days / 7)} 周前`;
}

export default async function GitHubPage() {
  const snapshot = readGitHubTrending();
  const repos = snapshot?.repos ?? [];

  let overview = "";
  let intros = new Map<string, string>();
  if (snapshot?.summaryZh) {
    try {
      const parsed = JSON.parse(snapshot.summaryZh) as {
        overview?: string;
        items?: Array<{ fullName: string; introZh: string }>;
      };
      overview = parsed.overview ?? "";
      intros = new Map((parsed.items ?? []).map((it) => [it.fullName, it.introZh]));
    } catch {
      overview = snapshot.summaryZh;
    }
  }

  return (
    <main className={styles.main}>
      <SiteHeader active="github" />

      <section className={styles.hero}>
        <h1 className={styles.pageTitle}>GitHub AI 周热榜</h1>
        <p className={styles.pageSubtitle}>
          近 {snapshot?.days ?? 7} 天创建的 AI 热门仓库 Top {repos.length}
          {snapshot ? ` · 更新于 ${new Date(snapshot.updatedAt).toLocaleString("zh-CN")}` : ""}
        </p>
      </section>

      {repos.length === 0 ? (
        <div className={styles.empty}>
          <p>暂无数据。运行 <code className="mono">npm run refresh-github</code> 抓取。</p>
        </div>
      ) : (
        <>
          {overview && (
            <div className={styles.overview}>
              <span className={styles.overviewLabel}>本周趋势</span>
              <p className={styles.overviewText}>{overview}</p>
            </div>
          )}

          <ol className={styles.repoList}>
          {repos.map((repo, i) => {
            const rank = i + 1;
            return (
              <li key={repo.id} className={styles.repoRow}>
                <span className={`${styles.rank} ${styles[`rank${rank}`]}`}>{rank}</span>

                <div className={styles.repoContent}>
                  <a
                    href={repo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.repoName}
                  >
                    {repo.fullName}
                  </a>

                  {repo.description && (
                    <p className={styles.repoDesc}>{repo.description}</p>
                  )}

                  {intros.get(repo.fullName) && (
                    <p className={styles.repoIntro}>
                      <span className={styles.introLabel}>简介</span>
                      {intros.get(repo.fullName)}
                    </p>
                  )}

                  <div className={styles.repoMeta}>
                    {repo.language && (
                      <span className={styles.lang}>
                        <span className={styles.langDot} aria-hidden="true" />
                        {repo.language}
                      </span>
                    )}
                    <span className={styles.stars}>★ {fmtStars(repo.stars)}</span>
                    <span className={styles.forks}>⑂ {fmtStars(repo.forks)}</span>
                    {repo.topics.slice(0, 3).map((t) => (
                      <span key={t} className={styles.topic}>
                        {t}
                      </span>
                    ))}
                    <span className={styles.created}>创建于 {timeAgo(repo.createdAt)}</span>
                  </div>
                </div>

                <span className={styles.starBadge}>★ {fmtStars(repo.stars)}</span>
              </li>
            );
          })}
          </ol>
          </>
        )}

      <p className={styles.note}>
        数据来源：GitHub Search API（topic:ai / llm / agent / mcp 等），近 7 天创建，按 stars
        排序。中文简介由 AI 生成。
      </p>
    </main>
  );
}
