"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { softDeleteQuotes } from "../quotes/actions";
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
  "30px 4px 36px 84px minmax(0,1.2fr) minmax(0,0.5fr) 108px minmax(0,1.3fr) 18px";

export function LoadsListTable({
  rows,
  counts,
  initialFilter = "all",
  pipeline,
}: {
  rows: LoadListRow[];
  counts: { active: number; attention: number };
  /** Initial filter chip, e.g. from a `?filter=attention` URL param. */
  initialFilter?: FilterChip;
  /** Server-rendered quote pipeline, shown at the top of the page. */
  pipeline?: ReactNode;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterChip>(initialFilter);
  const [sortKey, setSortKey] = useState<SortKey>("attention");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  const allVisibleSelected =
    sorted.length > 0 && sorted.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      sorted.length > 0 && sorted.every((r) => prev.has(r.id))
        ? new Set()
        : new Set(sorted.map((r) => r.id)),
    );
  }

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="w-full px-4 py-5 sm:px-6 sm:py-6 lg:px-10">
        {pipeline}
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-indigo-600">
              Loads
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <h1 className="text-[24px] font-semibold leading-none tracking-tight text-fg tabular-nums">
                {counts.active} active
              </h1>
              {counts.attention > 0 ? (
                <p className="font-mono text-[12px] font-semibold text-red-600 tabular-nums">
                  {counts.attention} need attention
                </p>
              ) : (
                <p className="font-mono text-[12px] font-medium text-fg-subtle">
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

        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={toggleAll}
            className="rounded-md border border-line bg-card px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted transition-colors hover:bg-elevated"
          >
            {allVisibleSelected ? "Clear" : "Select all"}
          </button>

          {selected.size > 0 ? (
            <>
              <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
                {selected.size} selected
              </span>
              <form
                action={softDeleteQuotes}
                onSubmit={(e) => {
                  if (
                    !window.confirm(
                      `Delete ${selected.size} quote${selected.size === 1 ? "" : "s"}? They move to trash and can be restored for 30 days.`,
                    )
                  ) {
                    e.preventDefault();
                  } else {
                    setSelected(new Set());
                  }
                }}
              >
                {[...selected].map((id) => (
                  <input key={id} type="hidden" name="ids" value={id} />
                ))}
                <button
                  type="submit"
                  className="rounded-md border border-red-700 bg-red-600 px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-white transition-colors hover:bg-red-700"
                >
                  Delete {selected.size}
                </button>
              </form>
            </>
          ) : null}
        </div>

        {/* Table (tablet / desktop) — matches the Load Board's md+ table */}
        <div className="hidden overflow-x-auto rounded-md border border-line bg-card shadow-md md:block">
          <div className="min-w-[640px]">
            <div
              role="row"
              className="grid items-center gap-2 bg-bar px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-bar-fg"
              style={{ gridTemplateColumns: GRID_TEMPLATE }}
            >
              <div className="flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAll}
                  aria-label="Select all loads"
                  className="h-3.5 w-3.5 cursor-pointer accent-red-600"
                />
              </div>
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
              <div className="px-3 py-8 text-center font-mono text-[13px] text-fg-subtle">
                No loads match this filter.
              </div>
            ) : (
              sorted.map((row) => (
                <LoadRow
                  key={row.id}
                  row={row}
                  selected={selected.has(row.id)}
                  onToggle={() => toggle(row.id)}
                  onOpen={() => router.push("/admin/quotes/" + row.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Cards (mobile) — match the Load Board's card-on-mobile pattern */}
        <div className="space-y-2 md:hidden">
          {sorted.length === 0 ? (
            <div className="rounded-md border border-line bg-card px-3 py-8 text-center font-mono text-[13px] text-fg-subtle">
              No loads match this filter.
            </div>
          ) : (
            sorted.map((row) => (
              <LoadCard
                key={row.id}
                row={row}
                selected={selected.has(row.id)}
                onToggle={() => toggle(row.id)}
                onOpen={() => router.push("/admin/quotes/" + row.id)}
              />
            ))
          )}
        </div>

        <p className="mt-3 px-1 font-mono text-[12px] text-fg-subtle">
          {sortLabel(sortKey)} Tap any load to open the workspace.
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
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ";
  if (active && isAttention) {
    return base + "border-red-600 bg-red-600 text-white";
  }
  if (active) {
    return base + "border-fg bg-bar text-bar-fg";
  }
  if (isAttention && count > 0) {
    return (
      base +
      "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
    );
  }
  return base + "border-line bg-card text-fg shadow-sm hover:bg-elevated";
}

function countNumberClass(active: boolean, isAttention: boolean): string {
  if (active && isAttention) return "text-red-100";
  if (active) return "text-bar-fg/70";
  return "text-fg-subtle";
}

function LoadRow({
  row,
  selected,
  onToggle,
  onOpen,
}: {
  row: LoadListRow;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const railColor = LOAD_DISPLAY_STATUS_RAIL[row.displayStatus];
  const pillClasses = LOAD_DISPLAY_STATUS_CLASSES[row.displayStatus];
  const pillLabel = LOAD_DISPLAY_STATUS_LABELS[row.displayStatus];

  const isAlert = row.topUrgency?.severity === "alert";
  const hasAttention = row.topUrgency != null;

  const tintClass = selected
    ? "bg-red-100 hover:bg-red-100"
    : isAlert
      ? "bg-red-50 hover:bg-red-100"
      : hasAttention
        ? "bg-amber-50 hover:bg-amber-100"
        : "hover:bg-elevated";

  const laneLabel = buildLaneLabel(row);
  const ariaLabel = flagAriaLabel(row.urgencyChips);
  const title = flagTitle(row.urgencyChips);
  const subtitleClass = isAlert ? "text-red-600" : "text-amber-700";
  const fallbackSubtitle = timeAgo(
    row.lead_status_updated_at ?? row.created_at,
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={
        "group grid cursor-pointer items-center gap-2 border-b border-line px-3 py-2.5 text-[14px] transition-colors " +
        tintClass
      }
      style={{ gridTemplateColumns: GRID_TEMPLATE }}
    >
      <span className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={selected}
          aria-label={`Select ${row.customerName}`}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggle}
          className="h-3.5 w-3.5 cursor-pointer accent-red-600"
        />
      </span>

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
          "inline-flex w-fit items-center justify-center rounded-sm border px-1.5 py-[3px] font-mono text-[11px] font-semibold uppercase tracking-[0.12em] " +
          pillClasses
        }
      >
        {pillLabel}
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium text-blue-700">
          {laneLabel}
        </span>
        <span className="block truncate text-[12px] text-fg-subtle">
          {row.customerName}
          {row.commodity ? " · " + row.commodity : ""}
        </span>
      </span>

      <span aria-hidden />

      <span
        className={
          "block whitespace-nowrap text-right tabular-nums font-bold text-[14px] " +
          (row.rateDisplay ? "text-green-700" : "text-fg-subtle")
        }
      >
        {row.rateDisplay ?? "—"}
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium text-fg">
          {row.nextActionVerb}
        </span>
        {row.nextActionSubtitle ? (
          <span className={"block truncate text-[12px] " + subtitleClass}>
            {row.nextActionSubtitle}
          </span>
        ) : (
          <span className="block truncate text-[12px] text-fg-subtle">
            {fallbackSubtitle}
          </span>
        )}
      </span>

      <span
        aria-hidden
        className="flex justify-center text-fg-subtle group-hover:text-fg"
      >
        <ChevronRight />
      </span>
    </div>
  );
}

function LoadCard({
  row,
  selected,
  onToggle,
  onOpen,
}: {
  row: LoadListRow;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const pillClasses = LOAD_DISPLAY_STATUS_CLASSES[row.displayStatus];
  const pillLabel = LOAD_DISPLAY_STATUS_LABELS[row.displayStatus];
  const isAlert = row.topUrgency?.severity === "alert";
  const hasAttention = row.topUrgency != null;

  // Same attention coloring as the table row, plus the selected tint.
  const cardTint = selected
    ? "border-red-400 bg-red-50"
    : isAlert
      ? "border-red-300 bg-red-50"
      : hasAttention
        ? "border-amber-300 bg-amber-50"
        : "border-line bg-card";

  const laneLabel = buildLaneLabel(row);
  const subtitleClass = isAlert ? "text-red-600" : "text-amber-700";
  const fallbackSubtitle = timeAgo(row.lead_status_updated_at ?? row.created_at);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={
        "cursor-pointer rounded-md border p-3 shadow-sm transition-colors active:bg-elevated " +
        cardTint
      }
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-start gap-2.5">
          <input
            type="checkbox"
            checked={selected}
            aria-label={`Select ${row.customerName}`}
            onClick={(e) => e.stopPropagation()}
            onChange={onToggle}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-red-600"
          />
          <span className="min-w-0">
            <span className="block truncate text-[14.5px] font-medium text-blue-700">
              {laneLabel}
            </span>
            <span className="block truncate text-[12px] text-fg-subtle">
              {row.customerName}
              {row.commodity ? " · " + row.commodity : ""}
            </span>
          </span>
        </span>
        <span
          className={
            "shrink-0 whitespace-nowrap text-right text-[15px] font-bold tabular-nums " +
            (row.rateDisplay ? "text-green-700" : "text-fg-subtle")
          }
        >
          {row.rateDisplay ?? "—"}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span
          className={
            "inline-flex shrink-0 items-center rounded-sm border px-1.5 py-[3px] font-mono text-[11px] font-semibold uppercase tracking-[0.12em] " +
            pillClasses
          }
        >
          {pillLabel}
        </span>
        {row.urgencyChips.length > 0 ? (
          <span
            className="flex shrink-0 items-center gap-[3px]"
            aria-label={flagAriaLabel(row.urgencyChips)}
            title={flagTitle(row.urgencyChips)}
          >
            {row.urgencyChips.slice(0, 3).map((chip) => (
              <FlagDot key={chip.kind} severity={chip.severity} />
            ))}
          </span>
        ) : null}

        <span className="ml-auto min-w-0 text-right">
          <span className="block truncate text-[12.5px] font-medium text-fg">
            {row.nextActionVerb}
          </span>
          <span
            className={
              "block truncate text-[11.5px] " +
              (row.nextActionSubtitle ? subtitleClass : "text-fg-subtle")
            }
          >
            {row.nextActionSubtitle || fallbackSubtitle}
          </span>
        </span>
      </div>
    </div>
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
        "inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors " +
        (active ? "text-bar-fg" : "text-bar-fg/70 hover:text-bar-fg") +
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
