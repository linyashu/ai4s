"use client";

import { useState } from "react";
import type { LiveRanking, RankingsSnapshot } from "@/lib/types";
import styles from "@/app/benchmark/page.module.css";

interface LiveRankingsProps {
  rankings: RankingsSnapshot | null;
}

export default function LiveRankings({ rankings }: LiveRankingsProps) {
  const boards = rankings?.leaderboards ?? [];
  const [active, setActive] = useState(boards[0]?.source ?? "");
  const board = boards.find((b) => b.source === active) ?? boards[0];

  return (
    <section className={styles.liveSection}>
      <h2 className={styles.liveTitle}>实时权威排行榜</h2>
      <p className={styles.liveSub}>
        自动聚合 LMArena / LiveBench / Open LLM Leaderboard / OpenCompass 司南
        {rankings
          ? ` · 更新于 ${new Date(rankings.updatedAt).toLocaleString("zh-CN")}`
          : ""}
      </p>

      {boards.length === 0 ? (
        <div className={styles.liveEmpty}>
          暂无实时榜单数据。运行 <code className="mono">npm run refresh-rankings</code>{" "}
          抓取。
        </div>
      ) : (
        <>
          <div className={styles.liveTabs} role="tablist">
            {boards.map((b) => (
              <button
                key={b.source}
                type="button"
                role="tab"
                aria-selected={b.source === board?.source}
                onClick={() => setActive(b.source)}
                className={`${styles.liveTab} ${
                  b.source === board?.source ? styles.liveTabActive : ""
                }`}
              >
                {b.source}
                <span className={styles.liveMuted}> ({b.rows.length})</span>
              </button>
            ))}
          </div>

          {board && <LiveBoard board={board} />}
        </>
      )}
    </section>
  );
}

function LiveBoard({ board }: { board: LiveRanking }) {
  return (
    <>
      <table className={styles.liveTable}>
        <thead>
          <tr>
            <th>#</th>
            <th>模型</th>
            <th>得分</th>
            {board.source === "LMArena" && (
              <>
                <th>投票</th>
                <th>价格</th>
                <th>上下文</th>
              </>
            )}
            {board.source === "LiveBench" && (
              <>
                <th>推理</th>
                <th>编码</th>
                <th>数学</th>
                <th>语言</th>
                <th>价格</th>
              </>
            )}
            {board.source === "Open LLM Leaderboard" && (
              <>
                <th>参数量</th>
                <th>架构</th>
              </>
            )}
            {board.source === "OpenCompass 司南" && (
              <>
                <th>参数量</th>
                <th>推理</th>
                <th>数学</th>
                <th>代码</th>
                <th>智能体</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {board.rows.map((r) => (
            <tr key={`${board.source}-${r.rank}`}>
              <td className={styles.liveMuted}>{r.rank}</td>
              <td>
                <span className={styles.liveModel}>{r.model}</span>
                {r.org && <span className={styles.liveOrg}>{r.org}</span>}
              </td>
              <td className={styles.liveScore}>{r.score}</td>
              {board.source === "LMArena" && (
                <>
                  <td className={styles.liveMuted}>{r.votes}</td>
                  <td className={styles.liveMuted}>{r.price}</td>
                  <td className={styles.liveMuted}>{r.context}</td>
                </>
              )}
              {board.source === "LiveBench" && (
                <>
                  <td className={styles.liveMuted}>{r.categoryScores?.reasoning}</td>
                  <td className={styles.liveMuted}>{r.categoryScores?.coding}</td>
                  <td className={styles.liveMuted}>{r.categoryScores?.math}</td>
                  <td className={styles.liveMuted}>{r.categoryScores?.language}</td>
                  <td className={styles.liveMuted}>{r.price}</td>
                </>
              )}
              {board.source === "Open LLM Leaderboard" && (
                <>
                  <td className={styles.liveMuted}>{r.params}B</td>
                  <td className={styles.liveMuted}>{r.arch}</td>
                </>
              )}
              {board.source === "OpenCompass 司南" && (
                <>
                  <td className={styles.liveMuted}>{r.params}</td>
                  <td className={styles.liveMuted}>{r.categoryScores?.reasoning}</td>
                  <td className={styles.liveMuted}>{r.categoryScores?.math}</td>
                  <td className={styles.liveMuted}>{r.categoryScores?.coding}</td>
                  <td className={styles.liveMuted}>{r.categoryScores?.agent}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.liveNote}>
        {board.note} ·{" "}
        <a
          className={styles.liveSource}
          href={board.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          查看原始来源 ↗
        </a>
      </p>
    </>
  );
}
