import type { ReactNode } from "react";

/**
 * V2 "Fleet Ops" page header. Two rows over a 2px line-strong bottom rule:
 *
 *   1. Utility strip — breadcrumb (left) · search field + date + avatar (right).
 *   2. Title row     — eyebrow + 24px title (left) · action buttons (right).
 *
 * Presentational only: every part is an optional slot. The search field is a
 * plain uncontrolled input rendered for layout — wire it up when a page adopts
 * this. No routing, no state, no data here.
 */

type PageHeaderProps = {
  title: ReactNode;
  eyebrow?: ReactNode;
  breadcrumb?: ReactNode;
  /** Right-side utility-strip extras (e.g. a date string). */
  date?: ReactNode;
  avatar?: ReactNode;
  /** Right-aligned action buttons in the title row. */
  actions?: ReactNode;
  /** Show the presentational search field in the utility strip. */
  showSearch?: boolean;
  searchPlaceholder?: string;
  className?: string;
};

export function PageHeader({
  title,
  eyebrow,
  breadcrumb,
  date,
  avatar,
  actions,
  showSearch = false,
  searchPlaceholder = "Search…",
  className,
}: PageHeaderProps) {
  return (
    <header
      className={[
        "border-b-2 border-line-strong pb-3",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Utility strip */}
      <div className="flex min-h-[32px] items-center justify-between gap-3">
        <div className="min-w-0 truncate text-[12px] text-ink-3">
          {breadcrumb}
        </div>
        <div className="flex items-center gap-3">
          {showSearch ? (
            <input
              type="search"
              placeholder={searchPlaceholder}
              className="h-8 w-44 rounded-md border border-line-strong bg-inset px-3 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/40"
            />
          ) : null}
          {date ? (
            <span className="text-[12px] tabular-nums text-ink-2">{date}</span>
          ) : null}
          {avatar ? (
            <span className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-graphite text-[12px] font-bold text-white">
              {avatar}
            </span>
          ) : null}
        </div>
      </div>

      {/* Title row */}
      <div className="mt-3 flex items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? (
            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-accent">
              {eyebrow}
            </div>
          ) : null}
          <h1 className="truncate text-[24px] font-bold leading-tight text-ink">
            {title}
          </h1>
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
