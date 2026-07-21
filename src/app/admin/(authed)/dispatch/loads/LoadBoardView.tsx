"use client";

import { useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { softDeleteLoads } from "./actions";
import { AddLoadButton } from "./AddLoadButton";
import { PopoutButton } from "../email-broker/PopoutButton";
import { Button } from "@/components/ui/Button";
import { BoardHeader } from "./board/BoardHeader";
import { OverviewSection } from "./board/OverviewSection";
import { LoadCard } from "./board/LoadCard";
import { BADGE, badgeOf, marginPct, ratePerMile } from "./board/shared";
import { FilterIcon, SearchIcon, TruckIcon } from "./board/icons";

/**
 * Dispatch → Load Board.
 *
 * PRESENTATION ONLY. Every figure on this screen is either handed down by the
 * server page or derived from those rows by the same arithmetic the board has
 * always used — the month slice, the six KPIs, the net-toward-goal math, the
 * per-load margin. Nothing was added to or removed from the data layer.
 *
 * The screen is assembled from four subcomponents in ./board — the navy
 * masthead, the monthly performance card, the six KPI cards, and the load card
 * (which owns the shipment timeline). This file keeps what is genuinely
 * stateful: the month slice, the search text, the status filter, delete mode,
 * and the CSV export of what's currently on screen.
 */

export type LoadRow = {
  id: string;
  loadNumber: string;
  broker: string;
  /** Broker profile id, when the load is linked to one — drives Call Broker. */
  brokerId: string | null;
  equipment: string;
  origin: string;
  destination: string;
  pickup: string;
  delivery: string;
  trip: string;
  rate: number;
  net: number;
  loadedMiles: number | null;
  dhMiles: number;
  /**
   * Calendar month 0–11 the load is attributed to, by close-out date
   * (delivery → pickup → created_at) MINUS 1 day — so a load closed out on the
   * 1st falls into the previous month. Drives the month dropdown.
   */
  month: number;
  status: string;
  paymentStatus: string;
};

export type LoadBoardData = {
  rows: ReadonlyArray<LoadRow>;
  brokerNames: ReadonlyArray<string>;
  activeTrips: ReadonlyArray<string>;
  /**
   * Current calendar month (0–11) in the business timezone (America/Chicago) —
   * the month the dropdown defaults to when the board opens.
   */
  currentMonth: number;
  /**
   * ALL-TIME accounts receivable: the total RATE owed across every
   * delivered-but-unpaid load, regardless of month. Deliberately NOT
   * month-scoped — the A/R card shows the same number on every month view.
   */
  arTotal: number;
  /** Editable goal-bar targets (Settings → Net profit goals). */
  monthlyGoal: number;
  annualGoal: number;
  /**
   * Calendar context for the performance card's pace figures, resolved on the
   * server in America/Chicago so the client can't compute a different "today"
   * during hydration. `daysLeftInMonth` includes today.
   */
  daysLeftInMonth: number;
  daysInMonth: number;
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * The status filter's buckets, keyed to the same badge the cards wear so the
 * chip a load matches is visibly the chip on its card. Additive — the default
 * is "all", which is exactly the behaviour the board had before.
 */
const FILTER_KEYS = [
  "pending",
  "loaded",
  "transit",
  "delivered",
  "paid",
  "cancelled",
] as const;

export function LoadBoardView({ data }: { data: LoadBoardData }) {
  // Month filter — the primary slice, driving the performance card, the KPIs
  // AND the list off one value. Defaults to the CURRENT (business-timezone)
  // month so the board opens on this month's loads + this month's profit.
  const [month, setMonth] = useState<number | "all">(data.currentMonth);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Selection only exists inside an explicit delete mode. Default off: cards
  // open the load on tap and show no checkboxes. The Delete button turns it
  // on; Cancel or a completed delete turns it off and clears the picks.
  const [selectMode, setSelectMode] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  function toggleSelected(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  // Month slice — feeds the summary stats.
  const monthRows = useMemo(
    () =>
      month === "all"
        ? [...data.rows]
        : data.rows.filter((r) => r.month === month),
    [data.rows, month],
  );

  // The list is the month slice further narrowed by the search box and the
  // status chips.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return monthRows.filter((x) => {
      if (status !== "all" && badgeOf(x) !== status) return false;
      if (!q) return true;
      return [x.loadNumber, x.broker, x.origin, x.destination, x.trip]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [monthRows, query, status]);

  // Summary stats recompute for the selected month (the same math the server
  // used, kept here so the cards react to the month dropdown).
  const stats = useMemo(() => {
    const delivered = monthRows.filter((x) => x.status === "delivered");
    const live = monthRows.filter((x) => x.status !== "cancelled");
    const gross = monthRows.reduce((s, x) => s + x.rate, 0);
    const net = monthRows.reduce((s, x) => s + x.net, 0);
    // A/R is intentionally NOT here — it's all-time (data.arTotal), not scoped
    // to the selected month.
    const totalLoadedMiles = live.reduce((s, x) => s + (x.loadedMiles ?? 0), 0);
    return {
      totalLoads: monthRows.length,
      delivered: delivered.length,
      gross,
      net,
      avgNetPerMile: totalLoadedMiles > 0 ? net / totalLoadedMiles : 0,
      avgGrossPerMile: totalLoadedMiles > 0 ? gross / totalLoadedMiles : 0,
    };
  }, [monthRows]);

  // Counts for the status chips — of the MONTH slice, not the filtered list,
  // so picking "Delivered" doesn't make every other chip read 0.
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of monthRows) {
      const k = badgeOf(r);
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [monthRows]);

  /**
   * Download the currently-visible list as CSV — same slice the cards show
   * (month + status + search), same figures, in the order they're rendered.
   */
  function exportCsv() {
    const head = [
      "Load #",
      "Broker",
      "Origin",
      "Destination",
      "Pickup",
      "Delivery",
      "Trip",
      "Equipment",
      "Status",
      "Loaded Miles",
      "Deadhead Miles",
      "Rate",
      "Net",
      "Margin %",
      "RPM",
    ];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [
      head.map(esc).join(","),
      ...rows.map((r) => {
        const pct = marginPct(r);
        const rpm = ratePerMile(r);
        return [
          r.loadNumber,
          r.broker,
          r.origin,
          r.destination,
          r.pickup,
          r.delivery,
          r.trip,
          r.equipment,
          BADGE[badgeOf(r)].label,
          r.loadedMiles != null ? String(r.loadedMiles) : "",
          String(Math.round(r.dhMiles)),
          String(Math.round(r.rate)),
          String(Math.round(r.net)),
          pct != null ? String(Math.round(pct)) : "",
          rpm != null ? rpm.toFixed(2) : "",
        ]
          .map(esc)
          .join(",");
      }),
    ];
    // BOM so Excel opens the UTF-8 correctly; CRLF for the same reason.
    const blob = new Blob(["﻿" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    a.href = url;
    a.download = `load-board-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const isCurrentMonth = month === data.currentMonth;

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <style>{BOARD_KEYFRAMES}</style>
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-5 sm:space-y-5 sm:px-6 sm:py-6 lg:px-8">
        <BoardHeader
          months={MONTHS}
          month={month}
          onMonthChange={setMonth}
          onExport={exportCsv}
          exportCount={rows.length}
        />

        {/* Overview — the monthly performance card and the six KPI cards,
            COLLAPSED BY DEFAULT behind a compact summary strip so the first load
            card is on screen without a scroll. The section owns the collapse
            state; every figure and the A/R drill-down pass straight through.

            A specific month tracks that month's net against the MONTHLY goal;
            "All months" tracks the all-months net against the ANNUAL goal. Both
            targets are editable in Settings. The pace figures only apply to the
            month currently being earned. */}
        <OverviewSection
          net={stats.net}
          goal={month === "all" ? data.annualGoal : data.monthlyGoal}
          label={month === "all" ? "All months" : MONTHS[month]}
          daysLeft={isCurrentMonth ? data.daysLeftInMonth : null}
          daysInMonth={isCurrentMonth ? data.daysInMonth : null}
          arTotal={data.arTotal}
          totalLoads={stats.totalLoads}
          delivered={stats.delivered}
          gross={stats.gross}
          avgNetPerMile={stats.avgNetPerMile}
          avgGrossPerMile={stats.avgGrossPerMile}
        />

        {/* ── Action bar ──────────────────────────────────────────────────
            One toolbar of equal-height controls. The three labelled actions
            share the row as equal thirds via flex-1 (basis 0, so width is
            content-independent and the labels can't skew the split); Delete is
            conditional, and flex-1 lets the remaining two re-split on their own
            where a fixed 3-col grid would strand an empty column. The two
            icon-only controls hold a fixed 40px each. */}
        <div className="flex items-center gap-2">
          <AddLoadButton
            brokerNames={data.brokerNames}
            activeTrips={data.activeTrips}
            className={ACTION_BTN}
          >
            <span className="min-w-0 truncate">+ New Load</span>
          </AddLoadButton>
          <PopoutButton variant="navigate" className={ACTION_BTN}>
            <span className="min-w-0 truncate">Inquiry</span>
          </PopoutButton>
          {!selectMode && rows.length > 0 ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setSelectMode(true)}
              className={ACTION_BTN}
            >
              <span className="min-w-0 truncate">Delete</span>
            </Button>
          ) : null}
          <IconButton
            label="Filter by status"
            active={status !== "all" || filterOpen}
            onClick={() => setFilterOpen((v) => !v)}
            aria-expanded={filterOpen}
          >
            <FilterIcon className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="Search loads"
            onClick={() => searchRef.current?.focus()}
          >
            <SearchIcon className="h-4 w-4" />
          </IconButton>
        </div>

        {/* ── Search ──────────────────────────────────────────────────────
            The same substring match over load #, broker, origin, destination
            and trip the board has always run — restyled, and given the status
            filter as a second control on the same surface. */}
        <div>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-fg-subtle" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search load number, broker, customer, city…"
              className="h-[52px] w-full min-w-0 rounded-2xl border border-line bg-card pl-11 pr-14 text-[14px] text-fg shadow-e2 outline-none transition-shadow placeholder:text-fg-subtle focus:border-accent focus:shadow-e3 focus:ring-2 focus:ring-accent/30"
            />
            <button
              type="button"
              onClick={() => setFilterOpen((v) => !v)}
              aria-expanded={filterOpen}
              aria-label="Filter by status"
              className={
                "absolute right-2.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
                (status !== "all"
                  ? "bg-accent text-white"
                  : "bg-inset text-ink-2 hover:bg-elevated")
              }
            >
              <FilterIcon className="h-4 w-4" />
            </button>
          </div>

          {filterOpen ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 rounded-2xl border border-line bg-card p-2.5 shadow-e1">
              <Chip
                active={status === "all"}
                onClick={() => setStatus("all")}
                label="All"
                count={monthRows.length}
              />
              {FILTER_KEYS.map((k) =>
                (statusCounts[k] ?? 0) > 0 ? (
                  <Chip
                    key={k}
                    active={status === k}
                    onClick={() => setStatus(k)}
                    label={BADGE[k].label}
                    count={statusCounts[k] ?? 0}
                  />
                ) : null,
              )}
            </div>
          ) : null}
        </div>

        {/* ── Delete-selection bar — only while in explicit delete mode. ── */}
        {selectMode && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-bad/40 bg-bad-bg px-3.5 py-3 shadow-e1">
            <span className="text-[13px] font-bold tabular-nums text-ink">
              {selected.size} selected
            </span>
            <span className="text-[12px] text-ink-3">· tap loads to select</span>
            {/* Bulk pick is a property of delete mode. Toggles the whole
                VISIBLE (month + status + search) slice. */}
            <Button
              type="button"
              variant="cancel"
              size="sm"
              onClick={() =>
                setSelected(
                  selected.size === rows.length
                    ? new Set()
                    : new Set(rows.map((r) => r.id)),
                )
              }
            >
              {selected.size === rows.length && rows.length > 0
                ? "Clear all"
                : "Select all"}
            </Button>
            <Button
              type="button"
              variant="cancel"
              size="sm"
              onClick={exitSelectMode}
              className="ml-auto"
            >
              Cancel
            </Button>
            <form
              action={softDeleteLoads}
              onSubmit={(e) => {
                if (selected.size === 0) {
                  e.preventDefault();
                  return;
                }
                if (
                  !window.confirm(
                    `Delete ${selected.size} load${selected.size === 1 ? "" : "s"}? They move to trash and can be restored for 30 days.`,
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

        {/* ── The board ───────────────────────────────────────────────────
            One load card per load. The SAME card renders at every width — one
            column on a phone, 2-up once there's room. items-start is
            deliberate: cards size to their own content rather than stretching
            to the tallest in the row. */}
        {rows.length === 0 ? (
          <EmptyBoard filtered={query.trim().length > 0 || status !== "all"} />
        ) : (
          <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2 xl:gap-4">
            {rows.map((r) => (
              <LoadCard
                key={r.id}
                row={r}
                selectMode={selectMode}
                isSel={selectMode && selected.has(r.id)}
                onToggle={toggleSelected}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

/**
 * The board's three entrance keyframes, declared once here rather than in
 * globals.css so the whole redesign stays inside the load-board files.
 *
 * All three animate FROM an empty state TO the element's resting style, which
 * is already the correct one — a goal bar at its true width, a timeline segment
 * in its true colour. Nothing on this screen depends on an animation completing
 * in order to read correctly, which is the whole point: an earlier draft drove
 * the progress from React state raised in an effect, and in a backgrounded tab
 * (rAF throttled to zero) the bar sat at 0% and every shipment tracker sat grey.
 *
 * Suppressed wholesale under prefers-reduced-motion — with the resting styles
 * already correct, dropping the motion costs nothing but the sweep.
 */
const BOARD_KEYFRAMES = `
@keyframes lb-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes lb-pop { from { transform: scale(0.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes lb-ring { from { stroke-dashoffset: var(--lb-ring-empty); } }
@media (prefers-reduced-motion: reduce) {
  [style*="lb-grow"], [style*="lb-pop"], [style*="lb-ring"] { animation: none !important; }
}
`;

/**
 * The labelled action buttons share the toolbar as equal thirds. flex-1 sets
 * basis 0 so the split is content-independent, and min-w-0 lets a column shrink
 * below its label (a flex item defaults to min-width:auto, which would push the
 * row wider than the page and give the board a horizontal scroll).
 *
 * The compact type below `sm` is what keeps three labels plus two icon buttons
 * on one line at 360px and at the larger Display UI-scale settings. From `sm`
 * there is room, so the buttons return to their designed size. Height is
 * pinned to 40px to match the icon buttons beside them.
 */
const ACTION_BTN =
  "h-[40px]! flex-1 min-w-0 rounded-xl! px-1.5! text-[11px]! sm:px-3.5! sm:text-[12.5px]!";

function IconButton({
  label,
  active = false,
  onClick,
  children,
  ...rest
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<"button">, "className" | "children">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={
        "inline-flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-xl border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
        // Fixed white/ink rather than bg-card: these sit beside buttons that
        // are themselves fixed-surface, and text-ink on a themed card flips to
        // ~1.7:1 under admin-dark.
        (active
          ? "border-graphite bg-graphite text-white"
          : "border-line-strong bg-white text-ink hover:bg-inset")
      }
      {...rest}
    >
      {children}
    </button>
  );
}

function Chip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "inline-flex h-[30px] items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
        // Both states are fixed-color surfaces so the chips read the same on
        // either admin theme.
        (active ? "bg-graphite text-white" : "bg-inset text-ink-2 hover:bg-[#e4e9ed]")
      }
    >
      {label}
      <span className="tabular-nums opacity-60">{count}</span>
    </button>
  );
}

function EmptyBoard({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-card px-6 py-14 text-center shadow-e1">
      <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-inset text-ink-3">
        <TruckIcon className="h-5 w-5" />
      </span>
      <div className="mt-3.5 text-[15px] font-semibold text-fg">
        {filtered ? "No loads match" : "No loads yet"}
      </div>
      <p className="mx-auto mt-1.5 max-w-xs text-[13px] leading-relaxed text-fg-muted">
        {filtered
          ? "Clear the search or the status filter to see the rest of the month."
          : "Hit “+ New Load” to start tracking freight on this board."}
      </p>
    </div>
  );
}

// Submit button for the bulk-delete form. useFormStatus disables it and shows
// progress while the soft-delete server action is in flight, so the delete
// can't be double-fired.
function BulkDeleteButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <Button
      variant="destructive"
      size="sm"
      type="submit"
      disabled={pending || count === 0}
      aria-busy={pending}
      leftIcon={
        pending ? (
          <span
            aria-hidden
            className="h-3 w-3 animate-spin rounded-full border-2 border-red-600/30 border-t-red-600"
          />
        ) : undefined
      }
    >
      {pending ? "Deleting…" : "Delete Selected"}
    </Button>
  );
}
