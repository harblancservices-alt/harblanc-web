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

      {/* Title row.
          On a phone the title and the action slot each take the full row and
          the actions drop underneath — a month <select> or a "← Load board"
          button sharing a 375px line squeezed the title down to "Load bo…" /
          "Accounts rec…". From `sm` there's room, so they sit side by side
          again exactly as before.

          The title wraps rather than truncating: a header is the one string on
          the page that must always be readable in full, and with the actions
          out of the way there is nothing left to collide with. */}
      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 basis-full sm:basis-auto">
          {eyebrow ? (
            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-accent">
              {eyebrow}
            </div>
          ) : null}
          <h1 className="text-[24px] font-bold leading-tight text-ink">
            {title}
          </h1>
        </div>
        {actions ? (
          <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
