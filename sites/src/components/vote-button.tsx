"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./vote-button.module.css";

interface VoteButtonProps {
  itemId: string;
  votes: number;
}

export default function VoteButton({ itemId, votes: initialVotes }: VoteButtonProps) {
  const [votes, setVotes] = useState(initialVotes);
  const [myVote, setMyVote] = useState<1 | -1 | 0>(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(`vote-${itemId}`);
    if (saved === "1" || saved === "-1") {
      const timer = setTimeout(() => setMyVote(Number(saved) as 1 | -1), 0);
      return () => clearTimeout(timer);
    }
  }, [itemId]);

  const vote = useCallback(
    async (value: 1 | -1) => {
      if (busy) return;
      const next = myVote === value ? 0 : value;
      setBusy(true);
      try {
        const res = await fetch("/api/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId, value: next === 0 ? -myVote : value }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { votes?: number };
        setVotes(data.votes ?? votes);
        setMyVote(next);
        if (next === 0) localStorage.removeItem(`vote-${itemId}`);
        else localStorage.setItem(`vote-${itemId}`, String(next));
      } catch {
        // 网络失败静默，不阻塞浏览
      } finally {
        setBusy(false);
      }
    },
    [busy, itemId, myVote, votes]
  );

  return (
    <span className={styles.wrap}>
      <button
        type="button"
        className={`${styles.btn} ${myVote === 1 ? styles.activeUp : ""}`}
        onClick={() => vote(1)}
        aria-label="点赞"
        aria-pressed={myVote === 1}
      >
        ▲ <span className={styles.count}>{votes > 0 ? votes : ""}</span>
      </button>
      <button
        type="button"
        className={`${styles.btn} ${myVote === -1 ? styles.activeDown : ""}`}
        onClick={() => vote(-1)}
        aria-label="点踩"
        aria-pressed={myVote === -1}
      >
        ▼
      </button>
    </span>
  );
}
