"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { MonthBucket, PartyStat } from "@/lib/dispatch/performance";
import { usd, rpm, pct } from "@/lib/dispatch/format";

/**
 * The Performance page's data tables — the analytical half of the page.
 *
 * These are the ONLY client components on the page, and they're client-side for
 * exactly one reason: sorting. Everything they display was aggregated on the
 * server by performance.ts (brokerStats / laneStats / monthlyBuckets) out of
 * loads the server had already costed with loadNet. Nothing here computes
 * money — a sort comparator reads the same `net` the server sent, it never
 * re-derives it.
 *
 * MOBILE: a dense numeric table is wider than a phone, and the two escapes from
 * that (dropping columns, or reflowing each row into a stack) both destroy the
 * thing tables are for — column-wise comparison down a list. So the table keeps
 * every column and scrolls sideways inside its card, with the identity column
 * (broker / lane / month) pinned left so a row never becomes anonymous while
 * you're reading its numbers.
 *
 * NUMBERS: right-aligned, mono, tabular-nums. Right alignment is what makes a
 * column of dollars comparable at a glance — the digits line up by place value,
 * so magnitude reads as length.
 */

type Align = "left" | "right";

type Col<T> = {
  key: string;
  label: string;
  align: Align;
  /** Short header for phones, where the full label wastes scarce width. */
  short?: string;
  /**
   * The value this column sorts on. Null means "no answer" (an unpaid broker
   * has no days-to-pay) and always sorts to the bottom, in either direction —
   * a missing figure is not a small one.
   */
  sort: (r: T) => number | string | null;
  render: (r: T) => ReactNode;
  /** Tone class for the cell, e.g. red on a negative net. */
  tone?: (r: T) => string;
};

type Dir = "asc" | "desc";

function compare<T>(col: Col<T>, dir: Dir) {
  return (a: T, b: T): number => {
    const x = col.sort(a);
    const y = col.sort(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1; // nulls last regardless of direction
    if (y == null) return -1;
    const c =
      typeof x === "string" || typeof y === "string"
        ? String(x).localeCompare(String(y), "en-US")
        : x - y;
    return dir === "asc" ? c : -c;
  };
}

const HEAD =
  "whitespace-nowrap px-2 py-1.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.1em] text-fg-subtle";
const CELL = "whitespace-nowrap px-2 py-[7px] tabular-nums";
/** The pinned identity column. bg-card, so scrolled-under digits don't bleed. */
const PIN = "sticky left-0 z-10 bg-card";

function DataTable<T>({
  cols,
  rows,
  rowKey,
  initial,
  minWidth,
  showRank = false,
  empty,
}: {
  cols: Col<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  initial: { key: string; dir: Dir };
  /** Below this the table scrolls rather than crushing its columns. */
  minWidth: number;
  showRank?: boolean;
  empty: string;
}) {
  const [sort, setSort] = useState(initial);

  const sorted = useMemo(() => {
    const col = cols.find((c) => c.key === sort.key);
    if (!col) return rows;
    // Copy first: Array.prototype.sort mutates, and `rows` is a prop.
    return [...rows].sort(compare(col, sort.dir));
  }, [cols, rows, sort]);

  if (rows.length === 0) {
    return (
      <div className="px-3.5 py-6 text-center text-[12px] text-fg-muted">
        {empty}
      </div>
    );
  }

  const toggle = (col: Col<T>) => {
    setSort((s) =>
      s.key === col.key
        ? { key: s.key, dir: s.dir === "desc" ? "asc" : "desc" }
        : // First click on a new column sorts the way that column is usually
          // read: biggest-first for numbers, A–Z for names.
          { key: col.key, dir: col.align === "right" ? "desc" : "asc" },
    );
  };

  return (
    <div className="overflow-x-auto">
      <table
        className="w-full border-collapse text-[12px]"
        style={{ minWidth }}
      >
        <thead>
          <tr className="border-b border-line-strong">
            {showRank ? (
              <th scope="col" className={HEAD + " " + PIN + " w-7 text-right"}>
                #
              </th>
            ) : null}
            {cols.map((col, i) => {
              const active = sort.key === col.key;
              const pinned = i === 0 && !showRank;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={
                    active
                      ? sort.dir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  className={
                    HEAD +
                    " " +
                    (i === 0 ? (showRank ? "sticky left-7 z-10 bg-card" : PIN) : "") +
                    (col.align === "right" ? " text-right" : " text-left")
                  }
                >
                  <button
                    type="button"
                    onClick={() => toggle(col)}
                    className={
                      "inline-flex w-full items-center gap-1 rounded-sm transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent " +
                      (col.align === "right" ? "justify-end" : "justify-start") +
                      (active ? " text-fg" : "")
                    }
                  >
                    <span className="sm:hidden">{col.short ?? col.label}</span>
                    <span className="hidden sm:inline">{col.label}</span>
                    {/* The caret is reserved on every header, so sorting never
                        shifts the column widths under the cursor. */}
                    <span
                      aria-hidden
                      className={active ? "text-accent" : "text-transparent"}
                    >
                      {active && sort.dir === "asc" ? "▲" : "▼"}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sorted.map((r, i) => (
            <tr key={rowKey(r)} className="transition-colors hover:bg-canvas">
              {showRank ? (
                <td
                  className={
                    CELL + " " + PIN + " text-right font-mono text-[10px] text-fg-subtle"
                  }
                >
                  {i + 1}
                </td>
              ) : null}
              {cols.map((col, ci) => (
                <td
                  key={col.key}
                  className={
                    CELL +
                    " " +
                    (ci === 0
                      ? (showRank ? "sticky left-7 z-10 bg-card" : PIN) +
                        " max-w-[190px] truncate border-r border-line font-semibold text-fg"
                      : "font-mono " + (col.tone?.(r) ?? "text-fg")) +
                    (col.align === "right" ? " text-right" : " text-left")
                  }
                >
                  {col.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------- tone helpers

/** Money that can go either way — red only when it actually did. */
const moneyTone = (n: number) => (n < 0 ? "text-bad" : "text-fg");
const rateTone = (n: number | null) =>
  n == null ? "text-fg-subtle" : n < 0 ? "text-bad" : "text-fg";
/** The page's existing deadhead threshold — 25% is where it's worth chasing. */
const deadTone = (n: number | null) =>
  n == null ? "text-fg-subtle" : n >= 25 ? "text-warn" : "text-fg";

const miles = (n: number) => Math.round(n).toLocaleString("en-US");

// ------------------------------------------------------------------ tables

/**
 * Brokers, defaulting to total net descending — "who has actually made me the
 * most money", which is the question the page opens with. Every other column
 * re-asks it a different way: net $/mi is rate quality, margin is what survived
 * the run, days-to-pay is how long the money took to arrive.
 */
export function BrokerTable({ rows }: { rows: PartyStat[] }) {
  const cols: Col<PartyStat>[] = [
    {
      key: "name",
      label: "Broker",
      align: "left",
      sort: (r) => r.name.toLowerCase(),
      render: (r) => r.name,
    },
    {
      key: "loads",
      label: "Loads",
      short: "Lds",
      align: "right",
      sort: (r) => r.loads,
      render: (r) => r.loads,
    },
    {
      key: "gross",
      label: "Gross",
      align: "right",
      sort: (r) => r.gross,
      render: (r) => usd(r.gross),
      tone: () => "text-fg-muted",
    },
    {
      key: "net",
      label: "Net",
      align: "right",
      sort: (r) => r.net,
      render: (r) => usd(r.net),
      tone: (r) => moneyTone(r.net) + " font-bold",
    },
    {
      key: "netRpm",
      label: "Net $/mi",
      short: "$/mi",
      align: "right",
      sort: (r) => r.netRpm,
      render: (r) => rpm(r.netRpm),
      tone: (r) => rateTone(r.netRpm),
    },
    {
      key: "margin",
      label: "Margin",
      align: "right",
      sort: (r) => r.marginPct,
      render: (r) => pct(r.marginPct),
      tone: (r) => rateTone(r.marginPct),
    },
    {
      key: "pay",
      label: "Days to pay",
      short: "Pay",
      align: "right",
      sort: (r) => r.payDays,
      // An em-dash means "none of this broker's loads have been paid yet",
      // which must not read as "pays in 0 days".
      render: (r) =>
        r.payDays == null ? (
          <span title="No paid loads yet">—</span>
        ) : (
          `${r.payDays.toFixed(0)}d`
        ),
      tone: (r) =>
        r.payDays == null
          ? "text-fg-subtle"
          : r.payDays >= 35
            ? "text-warn"
            : "text-fg",
    },
  ];

  return (
    <DataTable
      cols={cols}
      rows={rows}
      rowKey={(r) => r.name}
      initial={{ key: "net", dir: "desc" }}
      minWidth={620}
      showRank
      empty="No brokers to rank yet."
    />
  );
}

/**
 * Lanes, defaulting to net $/mi descending — for a lane the rate is the whole
 * question ("is this run worth taking again"), where total net mostly measures
 * how often it happened to come up.
 */
export function LaneTable({ rows }: { rows: PartyStat[] }) {
  const cols: Col<PartyStat>[] = [
    {
      key: "name",
      label: "Lane",
      align: "left",
      sort: (r) => r.name.toLowerCase(),
      render: (r) => r.name,
    },
    {
      key: "loads",
      label: "Loads",
      short: "Lds",
      align: "right",
      sort: (r) => r.loads,
      render: (r) => r.loads,
    },
    {
      key: "miles",
      label: "Miles",
      align: "right",
      sort: (r) => r.loadedMiles,
      render: (r) => miles(r.loadedMiles),
      tone: () => "text-fg-muted",
    },
    {
      key: "net",
      label: "Net",
      align: "right",
      sort: (r) => r.net,
      render: (r) => usd(r.net),
      tone: (r) => moneyTone(r.net),
    },
    {
      key: "netRpm",
      label: "Net $/mi",
      short: "$/mi",
      align: "right",
      sort: (r) => r.netRpm,
      render: (r) => rpm(r.netRpm),
      tone: (r) => rateTone(r.netRpm) + " font-bold",
    },
    {
      key: "margin",
      label: "Margin",
      align: "right",
      sort: (r) => r.marginPct,
      render: (r) => pct(r.marginPct),
      tone: (r) => rateTone(r.marginPct),
    },
  ];

  return (
    <DataTable
      cols={cols}
      rows={rows}
      rowKey={(r) => r.name}
      initial={{ key: "netRpm", dir: "desc" }}
      minWidth={560}
      showRank
      empty="Lanes need loaded miles on a delivered load to rank."
    />
  );
}

/**
 * The month ledger — the scannable history, newest first.
 *
 * Zero-filled months are kept (monthlyBuckets fills them deliberately): a month
 * that ran nothing is a real row with real zeroes, and dropping it would let
 * the two months either side read as consecutive work.
 */
export function LedgerTable({
  rows,
  currentKey,
}: {
  rows: MonthBucket[];
  /** The month the KPI row is scoped to — marked so it reads as in-progress. */
  currentKey: string | null;
}) {
  const cols: Col<MonthBucket>[] = [
    {
      key: "month",
      label: "Month",
      align: "left",
      sort: (r) => r.key,
      render: (r) => (
        <span className="flex items-baseline gap-1.5">
          {r.longLabel}
          {r.key === currentKey ? (
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-accent">
              MTD
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "loads",
      label: "Loads",
      short: "Lds",
      align: "right",
      sort: (r) => r.loads,
      render: (r) => r.loads,
    },
    {
      key: "gross",
      label: "Gross",
      align: "right",
      sort: (r) => r.gross,
      render: (r) => usd(r.gross),
      tone: () => "text-fg-muted",
    },
    {
      key: "net",
      label: "Net",
      align: "right",
      sort: (r) => r.net,
      render: (r) => usd(r.net),
      tone: (r) => moneyTone(r.net) + " font-bold",
    },
    {
      key: "netRpm",
      label: "Net $/mi",
      short: "$/mi",
      align: "right",
      sort: (r) => r.netRpm,
      render: (r) => rpm(r.netRpm),
      tone: (r) => rateTone(r.netRpm),
    },
    {
      key: "deadhead",
      label: "Deadhead",
      short: "DH",
      align: "right",
      sort: (r) => r.deadheadPct,
      render: (r) => pct(r.deadheadPct),
      tone: (r) => deadTone(r.deadheadPct),
    },
    {
      key: "margin",
      label: "Margin",
      align: "right",
      sort: (r) => r.marginPct,
      render: (r) => pct(r.marginPct),
      tone: (r) => rateTone(r.marginPct),
    },
  ];

  return (
    <DataTable
      cols={cols}
      rows={rows}
      rowKey={(r) => r.key}
      initial={{ key: "month", dir: "desc" }}
      minWidth={580}
      empty="No months to list yet."
    />
  );
}
