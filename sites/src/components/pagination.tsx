import Link from "next/link";
import styles from "./pagination.module.css";

interface PaginationProps {
  current: number;
  total: number;
  pageSize: number;
  basePath: string;
  query: Record<string, string>;
}

function buildHref(basePath: string, query: Record<string, string>, page: number) {
  const params = new URLSearchParams(query);
  if (page > 1) params.set("page", String(page));
  else params.delete("page");
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export default function Pagination({ current, total, pageSize, basePath, query }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  const prev = current > 1 ? buildHref(basePath, query, current - 1) : null;
  const next = current < pages ? buildHref(basePath, query, current + 1) : null;

  const windowStart = Math.max(1, Math.min(current - 2, pages - 4));
  const windowEnd = Math.min(pages, windowStart + 4);
  const pageNums: number[] = [];
  for (let i = windowStart; i <= windowEnd; i++) pageNums.push(i);

  return (
    <nav className={styles.pagination} aria-label="分页">
      {prev ? (
        <Link href={prev} className={styles.pageBtn}>
          上一页
        </Link>
      ) : (
        <span className={`${styles.pageBtn} ${styles.disabled}`}>上一页</span>
      )}

      {windowStart > 1 && (
        <>
          <Link href={buildHref(basePath, query, 1)} className={styles.pageBtn}>
            1
          </Link>
          {windowStart > 2 && <span className={styles.ellipsis}>…</span>}
        </>
      )}

      {pageNums.map((p) => (
        <Link
          key={p}
          href={buildHref(basePath, query, p)}
          aria-current={p === current ? "page" : undefined}
          className={`${styles.pageBtn} ${p === current ? styles.active : ""}`}
        >
          {p}
        </Link>
      ))}

      {windowEnd < pages && (
        <>
          {windowEnd < pages - 1 && <span className={styles.ellipsis}>…</span>}
          <Link href={buildHref(basePath, query, pages)} className={styles.pageBtn}>
            {pages}
          </Link>
        </>
      )}

      {next ? (
        <Link href={next} className={styles.pageBtn}>
          下一页
        </Link>
      ) : (
        <span className={`${styles.pageBtn} ${styles.disabled}`}>下一页</span>
      )}
    </nav>
  );
}
