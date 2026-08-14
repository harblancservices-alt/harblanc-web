import Link from "next/link";
import { Button } from "@/components/tms-v2/ui/Button";

/**
 * Compact range picker — replaces the old horizontal pill strip (8 bubbles
 * + a bare custom from/to form) with one styled dropdown, per Brent's ask
 * for a "clean, on-brand" control instead of the native `<select>` look.
 *
 * A plain server-rendered `<details>` disclosure, not a "use client"
 * component — v2-architecture.md's URL-state-only discipline (same as
 * ContextDrawer) means the ONLY thing that needs to be interactive here is
 * open/closed-ness, and `<details>` gives that for free with zero JS. Every
 * option is a real `<Link>` computed server-side from the page's own
 * searchParams (rangeHref in page.tsx) — clicking one navigates and the
 * disclosure naturally re-closes on the resulting server render.
 */
export type RangeMenuOption = { key: string; label: string; href: string; active: boolean };

export function RangeMenu({
  currentLabel,
  options,
  customFrom,
  customTo,
  customActive,
}: {
  currentLabel: string;
  options: RangeMenuOption[];
  customFrom?: string;
  customTo?: string;
  customActive: boolean;
}) {
  return (
    <details className="group relative">
      <summary
        className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-md border border-line-strong bg-card px-3 text-[13px] font-medium text-fg hover:bg-elevated [&::-webkit-details-marker]:hidden"
      >
        <span className="max-w-[220px] truncate">{currentLabel}</span>
        <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-fg-muted transition-transform group-open:rotate-180" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>

      <div className="absolute right-0 z-20 mt-1.5 w-64 rounded-lg border border-line-strong bg-card p-1.5 shadow-e2">
        <div className="flex flex-col">
          {options.map((o) => (
            <Link
              key={o.key}
              href={o.href}
              className={`rounded-md px-2.5 py-1.5 text-[13px] font-medium ${
                o.active ? "bg-accent/10 text-accent" : "text-fg hover:bg-elevated"
              }`}
            >
              {o.label}
            </Link>
          ))}
        </div>

        <div className="my-1.5 border-t border-line" />

        <form action="/tms-v2/performance" method="GET" className="flex flex-col gap-1.5 px-1 pb-1 pt-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Custom range</span>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              name="from"
              defaultValue={customFrom}
              className="h-8 min-w-0 flex-1 rounded-md border border-line-strong bg-card px-2 text-[12px] text-fg"
            />
            <span className="text-[12px] text-fg-muted">–</span>
            <input
              type="date"
              name="to"
              defaultValue={customTo}
              className="h-8 min-w-0 flex-1 rounded-md border border-line-strong bg-card px-2 text-[12px] text-fg"
            />
          </div>
          <Button type="submit" variant={customActive ? "primary" : "secondary"} size="sm" className="w-full">
            Apply custom range
          </Button>
        </form>
      </div>
    </details>
  );
}
