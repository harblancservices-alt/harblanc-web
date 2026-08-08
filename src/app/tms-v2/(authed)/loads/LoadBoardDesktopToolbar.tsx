"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import type { LoadStatus } from "@/lib/data/loads";
import type { LoadBoardView } from "./MonthDropdown";
import { AddLoadButton } from "./AddLoadButton";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const STATUS_OPTIONS: { value: LoadStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "assigned", label: "Assigned" },
  { value: "loaded", label: "Loaded" },
  { value: "delivered", label: "Delivered" },
  { value: "tonu", label: "TONU" },
];

const CONTROL = "h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg shadow-e1 outline-none transition-colors hover:border-line focus:border-accent focus:ring-2 focus:ring-accent/30";
const NAV_ARROW = "flex h-9 w-8 shrink-0 items-center justify-center rounded-md border border-line-strong bg-card text-fg-muted shadow-e1 transition-colors hover:bg-elevated hover:text-fg";

/**
 * The desktop Load Board's slim toolbar — Brent's approved mockup,
 * 2026-08-08: title left, everything else (period/status/search/Add) in
 * one row on the right. Deliberately NOT the mobile top row's month-only
 * dropdown + delete-trash-icon (LoadBoardTopRow, unchanged, still mobile's
 * own header) — no bulk-select/delete affordance here at all; Brent's
 * mockup column list doesn't call for one and adding it wasn't asked.
 *
 * Every control preserves every OTHER active param (status/q/sort/dir/
 * page reset to 1) via `otherParams`, the same "merge, don't clobber"
 * pattern Performance's own buildHref() uses.
 */
export function LoadBoardDesktopToolbar({
  year,
  view,
  status,
  q,
  brokerNames,
  activeTripNames,
  otherParams,
}: {
  year: number;
  view: LoadBoardView;
  status: LoadStatus | undefined;
  q: string | undefined;
  brokerNames: string[];
  activeTripNames: string[];
  /** Everything besides year/month/view/status/q/page — carried through
   * unchanged by every control below (currently just sort/dir). */
  otherParams: Record<string, string>;
}) {
  const router = useRouter();

  function hrefFor(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams(otherParams);
    const merged: Record<string, string | undefined> = {
      ...(view.mode === "month" ? { year: String(year), month: String(view.month) } : { view: view.mode }),
      status,
      q,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined && v !== "") params.set(k, v);
      else params.delete(k);
    }
    const qs = params.toString();
    return qs ? `/tms-v2/loads?${qs}` : "/tms-v2/loads";
  }

  function shiftMonth(delta: number): { year: number; month: number } {
    const base = view.mode === "month" ? view.month : new Date().getMonth();
    const ord = year * 12 + base + delta;
    return { year: Math.floor(ord / 12), month: ((ord % 12) + 12) % 12 };
  }
  const prev = shiftMonth(-1);
  const next = shiftMonth(1);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
      <h1 className="text-[20px] font-semibold text-fg">Load Board</h1>

      <div className="flex flex-wrap items-center gap-2">
        {/* Period — prev/next arrows + a dropdown, matching the mockup's
            "August 2026 ▾" with flanking chevrons (the mobile MonthDropdown
            has no arrows at all; this is desktop-only chrome). */}
        <div className="flex items-center gap-1">
          <Link href={hrefFor({ year: String(prev.year), month: String(prev.month), view: undefined, page: undefined })} aria-label="Previous month" className={NAV_ARROW}>
            ‹
          </Link>
          <label className="relative inline-block">
            <span className="sr-only">Period</span>
            <select
              value={view.mode === "month" ? `m${view.month}` : view.mode}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "ytd") router.push(hrefFor({ view: "ytd", year: undefined, month: undefined, page: undefined }));
                else if (v === "all") router.push(hrefFor({ view: "all", year: undefined, month: undefined, page: undefined }));
                else router.push(hrefFor({ view: undefined, year: String(year), month: v.slice(1), page: undefined }));
              }}
              className={`${CONTROL} w-[168px] appearance-none pr-7 font-semibold`}
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={`m${i}`}>
                  {m} {year}
                </option>
              ))}
              <option value="ytd">Year to date</option>
              <option value="all">All</option>
            </select>
            <span aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle">
              ▾
            </span>
          </label>
          <Link href={hrefFor({ year: String(next.year), month: String(next.month), view: undefined, page: undefined })} aria-label="Next month" className={NAV_ARROW}>
            ›
          </Link>
        </div>

        {/* Status filter. */}
        <label className="relative inline-block">
          <span className="sr-only">Status</span>
          <select
            value={status ?? ""}
            onChange={(e) => router.push(hrefFor({ status: e.target.value || undefined, page: undefined }))}
            className={`${CONTROL} w-[152px] appearance-none pr-7`}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <span aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle">
            ▾
          </span>
        </label>

        {/* Search. */}
        <form action="/tms-v2/loads" method="GET" className="flex items-center">
          {view.mode === "month" ? (
            <>
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="month" value={view.month} />
            </>
          ) : (
            <input type="hidden" name="view" value={view.mode} />
          )}
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search load #, broker, lane…"
            className={`${CONTROL} w-[220px] placeholder:text-fg-subtle`}
          />
        </form>

        <AddLoadButton brokerNames={brokerNames} activeTripNames={activeTripNames} showFab={false} fullWidth={false} variant="primary" size="sm" label="+ Add load" />
      </div>
    </div>
  );
}
