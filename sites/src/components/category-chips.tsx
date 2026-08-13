import Link from "next/link";
import { CATEGORY_LABELS, type Category } from "@/lib/types";
import styles from "./category-chips.module.css";

interface CategoryChipsProps {
  active: Category | "all";
  baseHref?: string;
}

const ORDER: Array<Category> = [
  "ai-models",
  "ai-products",
  "industry",
  "opinion",
  "paper",
  "tip",
];

export default function CategoryChips({
  active,
  baseHref = "/",
}: CategoryChipsProps) {
  return (
    <div
      className={styles.row}
      role="group"
      aria-label="类型筛选"
    >
      <div className={styles.chips}>
        <Link
          href={baseHref}
          aria-current={active === "all" ? "true" : undefined}
          className={`${styles.chip} ${active === "all" ? styles.chipActive : ""}`}
        >
          全部
        </Link>
        {ORDER.map((cat) => (
          <Link
            key={cat}
            href={`${baseHref}?category=${cat}`}
            aria-current={active === cat ? "true" : undefined}
            className={`${styles.chip} ${active === cat ? styles.chipActive : ""}`}
          >
            {CATEGORY_LABELS[cat]}
          </Link>
        ))}
      </div>
    </div>
  );
}
