import type { Metadata } from "next";
import SiteHeader from "@/components/site-header";
import LiveRankings from "@/components/live-rankings";
import OpenRouterBoard from "@/components/openrouter-board";
import {
  BENCHMARK_CONFIG,
  readBenchmarks,
  getMetricValue,
  sortByMetric,
} from "@/lib/benchmark";
import { readRankings } from "@/lib/refresh-benchmarks";
import { readOpenRouter } from "@/lib/openrouter-store";
import type { BenchmarkMetric, BenchmarkModel } from "@/lib/types";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI4S — 模型测评榜单",
  description:
    "AI4S 模型测评榜单：多基准加权综合能力分 + 推理/代码/数学/多模态/智能体等能力维度排行，实时聚合四大权威排行榜。",
};

type MetricKey = BenchmarkMetric;

interface BenchmarkProps {
  searchParams: Promise<{ metric?: string }>;
}

const METRICS = Object.keys(BENCHMARK_CONFIG.metrics) as MetricKey[];

function fmtValue(model: BenchmarkModel, metric: MetricKey): string {
  const v = getMetricValue(model, metric);
  if (v == null) return "—";
  if (metric === "price") return `$${v.toFixed(2)}`;
  if (metric === "speed") return String(Math.round(v));
  return v.toFixed(1);
}

function isMetric(s: string): s is MetricKey {
  return (METRICS as string[]).includes(s);
}

export default async function BenchmarkPage({ searchParams }: BenchmarkProps) {
  const { metric: metricParam } = await searchParams;
  const metric: MetricKey = metricParam && isMetric(metricParam) ? metricParam : "overall";

  const snapshot = readBenchmarks();
  const rankings = readRankings();
  const openrouter = readOpenRouter();

  if (!snapshot) {
    return (
      <main className={styles.main}>
        <SiteHeader active="benchmark" />
        <section className={styles.hero}>
          <h1 className={styles.pageTitle}>模型测评榜单</h1>
          <p className={styles.pageSubtitle}>暂无测评数据。</p>
        </section>
      </main>
    );
  }

  const allModels = snapshot.models;
  const ranked = sortByMetric(allModels, metric, 20);
  const meta = BENCHMARK_CONFIG.metrics[metric];

  return (
    <main className={styles.main}>
      <SiteHeader active="benchmark" />

      <section className={styles.hero}>
        <h1 className={styles.pageTitle}>模型测评榜单</h1>
        <p className={styles.pageSubtitle}>
          {meta.label}排行 · {meta.desc} · 数据来源 {snapshot.source} · 采集于{" "}
          {snapshot.capturedAt}
        </p>
      </section>

      <div className={styles.tabs} role="tablist" aria-label="测评维度">
        {METRICS.map((m) => (
          <a
            key={m}
            href={`/benchmark?metric=${m}`}
            role="tab"
            aria-selected={metric === m}
            className={`${styles.tab} ${metric === m ? styles.tabActive : ""}`}
          >
            {BENCHMARK_CONFIG.metrics[m].label}
          </a>
        ))}
      </div>

      <div className={styles.toolbar}>
        <span className={styles.poolInfo}>
          全部 {allModels.length} 个模型参与评分 · 展示 Top 20
        </span>
      </div>

      <ol className={styles.rankList}>
        {ranked.map((model, i) => {
          const rank = i + 1;
          const value = getMetricValue(model, metric);
          const firstVal = ranked[0] ? getMetricValue(ranked[0], metric) : null;
          const maxValue =
            meta.higherIsBetter
              ? firstVal ?? 1
              : ranked[ranked.length - 1]
                ? getMetricValue(ranked[ranked.length - 1], metric) ?? 1
                : 1;
          const width =
            value != null && maxValue != null && maxValue > 0
              ? Math.max(3, Math.round((value / maxValue) * 100))
              : 3;

          return (
            <li key={model.slug} className={styles.rankRow}>
              <span className={`${styles.rank} ${styles[`rank${rank}`]}`}>{rank}</span>

              <div className={styles.modelInfo}>
                <span
                  className={styles.creatorDot}
                  style={{ background: model.color || "var(--accent-cyan)" }}
                  aria-hidden="true"
                />
                <div className={styles.modelNames}>
                  <span className={styles.modelName}>{model.shortName || model.name}</span>
                  <span className={styles.modelMeta}>
                    {model.creator}
                    {model.isReasoning ? " · 推理" : ""}
                    {model.isOpenWeights ? " · 开源" : ""}
                    {model.contextWindow ? ` · ${(model.contextWindow / 1000).toFixed(0)}K 上下文` : ""}
                  </span>
                </div>
              </div>

              <div className={styles.scoreWrap}>
                <div className={styles.scoreTrack}>
                  <div className={styles.scoreBar} style={{ width: `${width}%` }} />
                </div>
              </div>

              <span className={styles.score}>{fmtValue(model, metric)}</span>
            </li>
          );
        })}
      </ol>

      <p className={styles.note}>
        {snapshot.note} 综合能力分由智能指数/推理/代码/数学/多模态/智能体加权计算（权重{" "}
        {JSON.stringify(BENCHMARK_CONFIG.weights)}）。
      </p>

      <LiveRankings rankings={rankings} />

      <OpenRouterBoard snapshot={openrouter} />
    </main>
  );
}
