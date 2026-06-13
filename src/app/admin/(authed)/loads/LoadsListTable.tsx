"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { LeadStatus } from "@/lib/dispatch/status";
import type { UrgencyChip } from "@/lib/dispatch/urgency";
import {
  compareByAttentionThenDate,
  LOAD_DISPLAY_STATUS_CLASSES,
  LOAD_DISPLAY_STATUS_LABELS,
  LOAD_DISPLAY_STATUS_RAIL,
  type LoadDisplayStatus,
} from "@/lib/dispatch/loads-view";

/**
 * Dispatch Loads work-queue table — V0.
 *
 * Dense, dark-themed table view modeled after a brokerage TMS. Status
 * and Flags are surfaced as separate concerns: status is the colored
 * pill + rail; flags are the urgency chip indicators in their own
 * column. Default sort is attention-first (alert severity at top),
 * then by most recent touch.
 *
 * Row click navigates to the existing /admin/quotes/[id] workspace —
 * the eventual right-side drawer is not built in V0.
 */

export type LoadListRow = {
  id: string;
  pickup: string | null;
  delivery: string | null;
  customerName: string;
  commodity: string;
  lead_status: LeadStatus;
  displayStatus: LoadDisplayStatus;
  created_at: string;
  lead_status_updated_at: string | null;
  urgencyChips: UrgencyChip[];
  topUrgency: UrgencyChip | null;
  nextActionVerb: string;
  nextActionSubtitle: string;
  rateDisplay: string | null;
};

type FilterChip = "all" | "attention" | LoadDisplayStatus;
type SortKey = "attention" | "date" | "rate";
type SortDir = "asc" | "desc";

const FILTER_BUTTONS: ReadonlyArray<{
  key: FilterChip;
  label: string;
}> = [
  { key: "all", label: "All" },
  { key: "attention", label: "Attention" },
  { key: "quoted", label: "Quoted" },
  { key: "booked", label: "Booked" },
  { key: "scheduled", label: "Scheduled" },
  { key: "at_pickup", label: "At pickup" },
  { key: "in_transit", label: "In transit" },
  { key: "delivered", label: "Delivered" },
];

const GRID_TEMPLATE =
  "4px 22px 78px minmax(0,1.2fr) minmax(0,0.9fr) 92px minmax(0,1.3fr) 18px";

export function LoadsListTable({
  rows,
  counts,
  initialFilter = "all",
}: {
  rows: LoadListRow[];
  counts: { active: number; attention: number };
  /** Initial filter chip, e.g. from a `?filter=attention` URL param. */
  initialFilter?: FilterChip;
}) {
  const [filter, setFilter] = useState<FilterChip>(initialFilter);
  const [sortKey, setSortKey] = useState<SortKey>("attention");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filterCounts = useMemo(() => {
    const out: Record<string, number> = {
      all: rows.length,
      attention: counts.attention,
    };
    for (const r of rows) {
      out[r.displayStatus] = (out[r.displayStatus] ?? 0) + 1;
    }
    return out;
  }, [rows, counts.attention]);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "attention") return rows.filter((r) => r.topUrgency != null);
    return rows.filter((r) => r.displayStatus === filter);
  }, [rows, filter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortKey === "attention") {
      arr.sort(compareByAttentionThenDate);
      if (sortDir === "asc") arr.reverse();
    } else if (sortKey === "date") {
      arr.sort((a, b) => {
        const at =
          new Date(a.lead_status_updated_at ?? a.created_at).getTime() || 0;
        const bt =
          new Date(b.lead_status_updated_at ?? b.created_at).getTime() || 0;
        return sortDir === "desc" ? bt - at : at - bt;
      });
    } else if (sortKey === "rate") {
      arr.sort((a, b) => {
        const ar = parseRate(a.rateDisplay);
        const br = parseRate(b.rateDisplay);
        return sortDir === "desc" ? br - ar : ar - br;
      });
    }
    return arr;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div className="min-h-screen border-t border-zinc-800 bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.24em] text-zinc-500">
              Loads
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <h1 className="text-[22px] font-semibold leading-none tracking-tight text-white tabular-nums">
                {counts.active} active
              </h1>
              {counts.attention > 0 ? (
                <p className="font-mono text-[11px] font-medium text-red-400 tabular-nums">
                  {counts.attention} need attention
                </p>
              ) : (
                <p className="font-mono text-[11px] font-medium text-zinc-500">
                  All clear
                </p>
              )}
            </div>
          </div>
        </header>

        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {FILTER_BUTTONS.map((b) => {
            const count = filterCounts[b.key] ?? 0;
            const active = filter === b.key;
            const isAttention = b.key === "attention";
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => setFilter(b.key)}
                className={filterPillClass(active, isAttention, count)}
              >
                <span>{b.label}</span>
                <span
                  className={
                    "tabular-nums " +
                    countNumberClass(active, isAttention)
                  }
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-900/40">
          <div className="min-w-[640px]">
            <div
              role="row"
              className="grid items-center gap-2 border-b border-zinc-800 bg-zinc-900/60 px-3 py-2 font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-zinc-500"
              style={{ gridTemplateColumns: GRID_TEMPLATE }}
            >
              <div />
              <SortHeader
                label="Flag"
                active={sortKey === "attention"}
                dir={sortDir}
                onClick={() => toggleSort("attention")}
              />
              <div>Status</div>
              <div>Lane / customer</div>
              <div />
              <SortHeader
                label="Rate"
                active={sortKey === "rate"}
                dir={sortDir}
                onClick={() => toggleSort("rate")}
                align="right"
              />
              <SortHeader
                label="Next action"
                active={sortKey === "date"}
                dir={sortDir}
                onClick={() => toggleSort("date")}
              />
              <div />
            </div>

            {sorted.length === 0 ? (
              <div className="px-3 py-8 text-center font-mono text-[11px] text-zinc-500">
                No loads match this filter.
              </div>
            ) : (
              sorted.map((row) => <LoadRow key={row.id} row={row} />)
            )}
          </div>
        </div>

        <p className="mt-3 px-1 font-mono text-[10px] text-zinc-500">
          {sortLabel(sortKey)} Click any row to open the load workspace.
        </p>
      </div>
    </div>
  );
}

function sortLabel(sortKey: SortKey): string {
  if (sortKey === "attention") return "Sorted by attention then date.";
  if (sortKey === "date") return "Sorted by last updated.";
  return "Sorted by rate.";
}

function filterPillClass(
  active: boolean,
  isAttention: boolean,
  count: number,
): string {
  const base =
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.12em] transition-colors ";
  if (active && isAttention) {
    return base + "border-red-500 bg-red-600 text-white";
  }
  if (active) {
    return base + "border-zinc-200 bg-zinc-100 text-zinc-950";
  }
  if (isAttention && count > 0) {
    return (
      base +
      "border-red-900/50 bg-red-950/20 text-red-300 hover:bg-red-950/40"
    );
  }
  return base + "border-zinc-800 bg-transparent text-zinc-400 hover:bg-zinc-900";
}

function countNumberClass(active: boolean, isAttention: boolean): string {
  if (active && isAttention) return "text-red-100";
  if (active) return "text-zinc-600";
  return "text-zinc-500";
}

function LoadRow({ row }: { row: LoadListRow }) {
  const railColor = LOAD_DISPLAY_STATUS_RAIL[row.displayStatus];
  const pillClasses = LOAD_DISPLAY_STATUS_CLASSES[row.displayStatus];
  const pillLabel = LOAD_DISPLAY_STATUS_LABELS[row.displayStatus];

  const isAlert = row.topUrgency?.severity === "alert";
  const hasAttention = row.topUrgency != null;

  const tintClass = isAlert
    ? "bg-red-950/15 hover:bg-red-950/25"
    : hasAttention
      ? "bg-amber-950/10 hover:bg-amber-950/20"
      : "hover:bg-zinc-900/50";

  const laneLabel = buildLaneLabel(row);
  const ariaLabel = flagAriaLabel(row.urgencyChips);
  const title = flagTitle(row.urgencyChips);
  const subtitleClass = isAlert ? "text-red-300" : "text-amber-300";
  const fallbackSubtitle = timeAgo(
    row.lead_status_updated_at ?? row.created_at,
  );
  const rowHref = "/admin/quotes/" + row.id;

  return (
    <Link
      href={rowHref}
      prefetch={false}
      className={
        "group grid items-center gap-2 border-b border-zinc-900 px-3 py-2 text-[12px] transition-colors " +
        tintClass
      }
      style={{ gridTemplateColumns: GRID_TEMPLATE }}
    >
      <span
        aria-hidden
        className="block w-[4px] self-stretch rounded-sm"
        style={{ backgroundColor: railColor }}
      />

      <span
        className="flex flex-col items-center gap-[3px]"
        aria-label={ariaLabel}
        title={title}
      >
        {row.urgencyChips.slice(0, 3).map((chip) => (
          <FlagDot key={chip.kind} severity={chip.severity} />
        ))}
      </span>

      <span
        className={
          "inline-flex w-fit items-center justify-center rounded-sm border px-1.5 py-[2px] font-mono text-[8.5px] font-medium uppercase tracking-[0.12em] " +
          pillClasses
        }
      >
        {pillLabel}
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[12px] font-medium text-zinc-100">
          {laneLabel}
        </span>
        <span className="block truncate text-[10px] text-zinc-500">
          {row.customerName}
          {row.commodity ? " · " + row.commodity : ""}
        </span>
      </span>

      <span aria-hidden />

      <span
        className={
          "block whitespace-nowrap text-right tabular-nums text-[12px] " +
          (row.rateDisplay ? "text-zinc-100" : "text-zinc-600")
        }
      >
        {row.rateDisplay ?? "—"}
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[12px] font-medium text-zinc-100">
          {row.nextActionVerb}
        </span>
        {row.nextActionSubtitle ? (
          <span className={"block truncate text-[10px] " + subtitleClass}>
            {row.nextActionSubtitle}
          </span>
        ) : (
          <span className="block truncate text-[10px] text-zinc-500">
            {fallbackSubtitle}
          </span>
        )}
      </span>

      <span
        aria-hidden
        className="flex justify-center text-zinc-600 group-hover:text-zinc-400"
      >
        <ChevronRight />
      </span>
    </Link>
  );
}

function buildLaneLabel(row: LoadListRow): string {
  if (row.pickup && row.delivery) {
    return row.pickup + " → " + row.delivery;
  }
  return row.pickup ?? row.delivery ?? "Lane TBD";
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1 font-mono text-[9px] font-medium uppercase tracking-[0.16em] transition-colors " +
        (active ? "text-zinc-200" : "text-zinc-500 hover:text-zinc-300") +
        (align === "right" ? " justify-self-end" : "")
      }
    >
      <span>{label}</span>
      {active ? <SortGlyph dir={dir} /> : null}
    </button>
  );
}

function SortGlyph({ dir }: { dir: SortDir }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {dir === "desc" ? (
        <path d="M12 5v14M5 12l7 7 7-7" />
      ) : (
        <path d="M12 19V5M5 12l7-7 7 7" />
      )}
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function FlagDot({ severity }: { severity: "warn" | "alert" }) {
  const color = severity === "alert" ? "#f87171" : "#fbbf24";
  return (
    <span
      aria-hidden
      className="block h-[6px] w-[6px] rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

function flagAriaLabel(chips: ReadonlyArray<UrgencyChip>): string {
  if (chips.length === 0) return "No attention flags";
  return "Attention: " + chips.map((c) => c.label).join("; ");
}

function flagTitle(chips: ReadonlyArray<UrgencyChip>): string | undefined {
  if (chips.length === 0) return undefined;
  return chips.map((c) => c.label).join("\n");
}

function parseRate(display: string | null): number {
  if (!display) return -1;
  const match = display.match(/\$?([\d,]+)/);
  if (!match) return -1;
  const first = match[1] ?? "";
  const cleaned = first.split(",").join("");
  const parsed = parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : -1;
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diffMs = Date.now() - t;
  if (diffMs < 0) return "just now";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return minutes <= 1 ? "1m ago" : minutes + "m ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h ago";
  const days = Math.floor(hours / 24);
  if (days < 14) return days + "d ago";
  const weeks = Math.floor(days / 7);
  return weeks + "w ago";
}
