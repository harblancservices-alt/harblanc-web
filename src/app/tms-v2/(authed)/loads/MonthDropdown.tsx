"use client";

import { useRouter } from "next/navigation";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * Load Board's month selector — a real dropdown (all 12 months, not just
 * the current one) replacing the previous ← month → arrow pair per Brent's
 * mobile review. Selecting a month re-scopes the board (loads list +
 * period label) to that month, same as the arrows did — this is a UI
 * change only, still driving the same `?year=&month=` query params
 * `parsePeriod()` in page.tsx already reads. No year switcher (legacy's
 * own board dropdown doesn't have one either); `year` stays whatever the
 * page resolved (defaults to the current year).
 */
export function MonthDropdown({ year, month }: { year: number; month: number }) {
  const router = useRouter();

  return (
    <label className="relative inline-block">
      <span className="sr-only">Month</span>
      <select
        value={month}
        onChange={(e) => router.push(`/tms-v2/loads?year=${year}&month=${e.target.value}`)}
        className="h-10 w-[190px] appearance-none rounded-lg border border-line-strong bg-card py-0 pl-3.5 pr-9 text-[14px] font-semibold text-fg shadow-e1 outline-none transition-colors hover:border-line focus:border-accent focus:ring-2 focus:ring-accent/30"
      >
        {MONTHS.map((m, i) => (
          <option key={m} value={i}>
            {m} {year}
          </option>
        ))}
      </select>
      <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle">
        ▾
      </span>
    </label>
  );
}
