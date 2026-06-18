"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
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

type SortKey = "attention" | "date" | "rate";
type SortDir = "asc" | "desc";

const GRID_TEMPLATE =
  "30px 4px 36px 84px minmax(0,1.2fr) minmax(0,0.5fr) 108px minmax(0,1.3fr) 18px";

export function LoadsListTable({
  rows,
  counts,
  pipeline,
}: {
  rows: LoadListRow[];
  counts: { active: number; attention: number };
  /** Server-rendered quote pipeline, shown at the top of the page. */
  pipeline?: ReactNode;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("attention");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Selection only exists inside an explicit delete mode (mirrors the Load
  // Board). Default off: tapping a load opens it, no checkboxes shown.
  const [selectMode, setSelectMode] = useState(false);

  const sorted = useMemo(() => {
    const arr = [...rows];
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
  }, [rows, sortKey, sortDir]);

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

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
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
          {!selectMode && sorted.length > 0 ? (
            <button
              type="button"
              onClick={() => setSelectMode(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-card px-3.5 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
            >
              Delete
            </button>
          ) : null}
        </header>

        {/* Delete-selection bar — only while in explicit delete mode. */}
        {selectMode && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2">
            <span className="font-mono text-[12px] font-bold text-fg">
              {selected.size} selected
            </span>
            <span className="font-mono text-[11px] text-fg-subtle">
              · tap loads to select
            </span>
            <button
              type="button"
              onClick={exitSelectMode}
              className="ml-auto rounded-md border border-line-strong bg-card px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
            >
              Cancel
            </button>
            <form
              action={softDeleteQuotes}
              onSubmit={(e) => {
                if (selected.size === 0) {
                  e.preventDefault();
                  return;
                }
                if (
                  !window.confirm(
                    `Delete ${selected.size} quote${selected.size === 1 ? "" : "s"}? They move to trash and can be restored for 30 days.`,
                  )
                ) {
                  e.preventDefault();
                } else {
                  exitSelectMode();
                }
              }}
            >
              {[...selected].map((id) => (
                <input key={id} type="hidden" name="ids" value={id} />
              ))}
              <BulkDeleteButton count={selected.size} />
            </form>
          </div>
        )}

        {/* Table (tablet / desktop) — matches the Load Board's md+ table */}
        <div className="hidden overflow-x-auto rounded-md border border-line bg-card shadow-md md:block">
          <div className="min-w-[640px]">
            <div
              role="row"
              className="grid items-center gap-2 bg-bar px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-bar-fg"
              style={{ gridTemplateColumns: GRID_TEMPLATE }}
            >
              <div className="flex items-center justify-center">
                {selectMode ? (
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    aria-label="Select all loads"
                    className="h-3.5 w-3.5 cursor-pointer accent-red-600"
                  />
                ) : null}
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
                No active loads.
              </div>
            ) : (
              sorted.map((row) => (
                <LoadRow
                  key={row.id}
                  row={row}
                  selectMode={selectMode}
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
              No active loads.
            </div>
          ) : (
            sorted.map((row) => (
              <LoadCard
                key={row.id}
                row={row}
                selectMode={selectMode}
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

// Submit button for the bulk-delete form. useFormStatus disables it and shows
// progress while the soft-delete server action is in flight, so the delete
// can't be double-fired. (Mirrors the Load Board.)
function BulkDeleteButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || count === 0}
      aria-busy={pending}
      className="inline-flex items-center gap-1.5 rounded-md border-2 border-red-700 bg-red-600 px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <>
          <span
            aria-hidden
            className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white"
          />
          Deleting…
        </>
      ) : (
        "Delete Selected"
      )}
    </button>
  );
}

function LoadRow({
  row,
  selectMode,
  selected,
  onToggle,
  onOpen,
}: {
  row: LoadListRow;
  selectMode: boolean;
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
      aria-pressed={selectMode ? selected : undefined}
      onClick={() => {
        if (selectMode) onToggle();
        else onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (selectMode) onToggle();
        else onOpen();
      }}
      className={
        "group grid cursor-pointer items-center gap-2 border-b border-line px-3 py-2.5 text-[14px] transition-colors " +
        tintClass
      }
      style={{ gridTemplateColumns: GRID_TEMPLATE }}
    >
      {/* Checkbox only in delete mode — visual mirror of the row's selected
          state (the whole row toggles). */}
      <span className="flex items-center justify-center">
        {selectMode ? (
          <input
            type="checkbox"
            readOnly
            aria-hidden
            tabIndex={-1}
            checked={selected}
            className="pointer-events-none h-3.5 w-3.5 accent-red-600"
          />
        ) : null}
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
  selectMode,
  selected,
  onToggle,
  onOpen,
}: {
  row: LoadListRow;
  selectMode: boolean;
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
      aria-pressed={selectMode ? selected : undefined}
      onClick={() => {
        if (selectMode) onToggle();
        else onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (selectMode) onToggle();
        else onOpen();
      }}
      className={
        "cursor-pointer rounded-md border p-3 shadow-sm transition-colors active:bg-elevated " +
        cardTint
      }
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-start gap-2.5">
          {selectMode ? (
            <input
              type="checkbox"
              readOnly
              aria-hidden
              tabIndex={-1}
              checked={selected}
              className="pointer-events-none mt-0.5 h-4 w-4 shrink-0 accent-red-600"
            />
          ) : null}
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
