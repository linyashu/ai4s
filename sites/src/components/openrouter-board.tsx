"use client";

import type { OpenRouterSnapshot } from "@/lib/openrouter-store";
import styles from "@/app/benchmark/page.module.css";

interface OpenRouterBoardProps {
  snapshot: OpenRouterSnapshot | null;
}

function fmtTokens(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  return String(n);
}

export default function OpenRouterBoard({ snapshot }: OpenRouterBoardProps) {
  const rows = snapshot?.top ?? [];

  return (
    <section className={styles.liveSection}>
      <h2 className={styles.liveTitle}>OpenRouter 实际使用量排行</h2>
      <p className={styles.liveSub}>
        按 token 消耗量排序，反映真实市场使用热度
        {snapshot ? ` · 数据截至 ${snapshot.capturedAt}` : ""}
      </p>

      {rows.length === 0 ? (
        <div className={styles.liveEmpty}>
          暂无数据。运行 <code className="mono">npm run refresh-openrouter</code> 抓取。
        </div>
      ) : (
        <table className={styles.liveTable}>
          <thead>
            <tr>
              <th>#</th>
              <th>模型</th>
              <th>Token 消耗</th>
              <th>请求数</th>
              <th>提示/补全</th>
              <th>缓存命中</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.slug}>
                <td className={styles.liveMuted}>{i + 1}</td>
                <td>
                  <span className={styles.liveModel}>{r.displayName}</span>
                  <span className={styles.liveOrg}>{r.provider}</span>
                </td>
                <td className={styles.liveScore}>{fmtTokens(r.totalTokens)}</td>
                <td className={styles.liveMuted}>{r.requests.toLocaleString()}</td>
                <td className={styles.liveMuted}>
                  {fmtTokens(r.promptTokens)} / {fmtTokens(r.completionTokens)}
                </td>
                <td className={styles.liveMuted}>
                  {r.totalTokens > 0 ? `${Math.round((r.cachedTokens / r.totalTokens) * 100)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className={styles.liveNote}>
        数据来源：{" "}
        <a
          className={styles.liveSource}
          href="https://openrouter.ai/rankings"
          target="_blank"
          rel="noreferrer"
        >
          OpenRouter Rankings ↗
        </a>
        ，token 消耗反映真实 API 使用热度。
      </p>
    </section>
  );
}
