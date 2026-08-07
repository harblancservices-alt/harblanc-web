"use client";

import { useRouter } from "next/navigation";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type LoadBoardView = { mode: "month"; month: number } | { mode: "ytd" } | { mode: "all" };

/**
 * Load Board's month selector — all 12 months of the resolved year, plus
 * "Year to date" and "All", per Brent's correction (the dropdown was
 * missing both). Selecting an option re-scopes the board: a month scopes
 * the loads list to that calendar month (?year=&month=), "Year to date"
 * scopes it to Jan 1 through today (?view=ytd), "All" scopes it to every
 * load (?view=all) — page.tsx reads whichever of these produced the
 * current view. The goal card reads the same selection to decide which
 * Settings goal ($10k monthly vs $120k annual) applies.
 */
export function MonthDropdown({ year, view }: { year: number; view: LoadBoardView }) {
  const router = useRouter();
  const value = view.mode === "month" ? `m${view.month}` : view.mode;

  function onChange(v: string) {
    if (v === "ytd") router.push("/tms-v2/loads?view=ytd");
    else if (v === "all") router.push("/tms-v2/loads?view=all");
    else router.push(`/tms-v2/loads?year=${year}&month=${v.slice(1)}`);
  }

  return (
    <label className="relative inline-block">
      <span className="sr-only">Month</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-[190px] appearance-none rounded-lg border border-line-strong bg-card py-0 pl-3.5 pr-9 text-[14px] font-semibold text-fg shadow-e1 outline-none transition-colors hover:border-line focus:border-accent focus:ring-2 focus:ring-accent/30"
      >
        {MONTHS.map((m, i) => (
          <option key={m} value={`m${i}`}>
            {m} {year}
          </option>
        ))}
        <option value="ytd">Year to date</option>
        <option value="all">All</option>
      </select>
      <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle">
        ▾
      </span>
    </label>
  );
}
