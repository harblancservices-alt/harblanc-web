"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { softDeleteLoads } from "./actions";
import { AddLoadButton } from "./AddLoadButton";
import { Button } from "@/components/ui/Button";

export type LoadRow = {
  id: string;
  loadNumber: string;
  broker: string;
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

const STATUS_PILL: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  assigned: "bg-amber-50 text-amber-700",
  loaded: "bg-blue-50 text-blue-700",
  delivered: "bg-green-50 text-green-700",
  cancelled: "bg-elevated text-fg-subtle",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  assigned: "Rolling",
  loaded: "Loaded",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const GRID =
  "30px 92px 90px minmax(0,1.2fr) minmax(0,1.4fr) 60px 60px minmax(0,0.9fr) 88px 64px 56px 96px 96px";

export function LoadBoardView({ data }: { data: LoadBoardData }) {
  const router = useRouter();
  // Month filter — the primary slice, driving the goal bar, KPI stats AND the
  // list off one value. Defaults to the CURRENT (business-timezone) month so the
  // board opens on this month's loads + this month's profit-toward-goal.
  const [month, setMonth] = useState<number | "all">(data.currentMonth);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Selection only exists inside an explicit delete mode. Default off: cards
  // open the load on tap and show no checkboxes. The Delete button turns it
  // on; Cancel or a completed delete turns it off and clears the picks.
  const [selectMode, setSelectMode] = useState(false);
  const [query, setQuery] = useState("");

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

  // The list is the month slice further narrowed by the search box.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return monthRows;
    return monthRows.filter((x) =>
      [x.loadNumber, x.broker, x.origin, x.destination, x.trip]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [monthRows, query]);

  // Summary stats recompute for the selected month (same math the server used,
  // moved here so the cards react to the month dropdown).
  const stats = useMemo(() => {
    const delivered = monthRows.filter((x) => x.status === "delivered");
    const live = monthRows.filter((x) => x.status !== "cancelled");
    const gross = monthRows.reduce((s, x) => s + x.rate, 0);
    const net = monthRows.reduce((s, x) => s + x.net, 0);
    const ar = delivered
      .filter((x) => x.paymentStatus !== "paid")
      .reduce((s, x) => s + x.rate, 0);
    const totalLoadedMiles = live.reduce((s, x) => s + (x.loadedMiles ?? 0), 0);
    return {
      totalLoads: monthRows.length,
      delivered: delivered.length,
      gross,
      net,
      ar,
      avgNetPerMile: totalLoadedMiles > 0 ? net / totalLoadedMiles : 0,
      avgGrossPerMile: totalLoadedMiles > 0 ? gross / totalLoadedMiles : 0,
    };
  }, [monthRows]);

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-indigo-600">
              Dispatch
            </p>
            <h1 className="mt-1 text-[22px] font-semibold leading-none tracking-tight text-fg">
              Load board
            </h1>
          </div>
          {/* Month filter — slices the whole board (stats + list) by month. */}
          <label className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg-subtle">
              Month
            </span>
            <select
              value={month === "all" ? "all" : String(month)}
              onChange={(e) =>
                setMonth(e.target.value === "all" ? "all" : Number(e.target.value))
              }
              className="rounded-md border border-line-strong bg-card px-3 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.08em] text-fg transition-colors focus:border-fg focus:outline-none"
            >
              <option value="all">All months</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </header>

        {/* Profit-toward-goal bar follows the SELECTED month (same net the KPI
            strip + list use). The $10k monthly goal is meaningless across "All
            months", so the bar is hidden there — the combined Net profit KPI
            still shows the total. */}
        {month !== "all" ? (
          <ProfitGoalBar net={stats.net} monthLabel={MONTHS[month]} />
        ) : null}

        {/* KPI strip */}
        <div className="mb-4 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line shadow-sm sm:grid-cols-6">
          <Kpi label="Total loads" value={String(stats.totalLoads)} tone="count" />
          <Kpi
            label="A/R"
            value={usd(stats.ar)}
            tone={stats.ar > 0 ? "red" : "muted"}
          />
          <Kpi label="Delivered" value={String(stats.delivered)} tone="green" />
          <Kpi label="Gross" value={usd(stats.gross)} tone="green" />
          <Kpi label="Net profit" value={usd(stats.net)} tone="green" />
          <div className="min-w-0 bg-card px-3 py-2.5">
            <div className="truncate font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-indigo-600">
              Avg / mi
            </div>
            <div className="mt-1 truncate text-[16px] font-bold tabular-nums leading-none text-green-700 sm:text-[18px]">
              ${stats.avgNetPerMile.toFixed(2)}
              <span className="ml-1 text-[10px] font-medium text-fg-subtle">net</span>
            </div>
            <div className="mt-1 truncate text-[13px] font-bold tabular-nums leading-none text-green-700">
              ${stats.avgGrossPerMile.toFixed(2)}
              <span className="ml-1 text-[10px] font-medium text-fg-subtle">gross</span>
            </div>
          </div>
        </div>

        {/* Toolbar — search + (relocated) Delete + Add Load. The old filter
            pills were removed; the month dropdown above is the filter now. */}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search load #, broker, origin, destination…"
            className="min-w-0 flex-1 rounded-md border border-line bg-card px-3 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-line-strong focus:outline-none sm:max-w-sm"
          />
          {!selectMode && rows.length > 0 ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setSelectMode(true)}
            >
              Delete
            </Button>
          ) : null}
          <AddLoadButton
            brokerNames={data.brokerNames}
            activeTrips={data.activeTrips}
          />
        </div>

        {/* Delete-selection bar — only while in explicit delete mode. */}
        {selectMode && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2">
            <span className="font-mono text-[12px] font-bold text-fg">
              {selected.size} selected
            </span>
            <span className="font-mono text-[11px] text-fg-subtle">
              · tap loads to select
            </span>
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

        {/* Table (desktop) */}
        <div className="hidden overflow-x-auto rounded-md border border-line bg-card shadow-md md:block">
          <div className="min-w-[1040px]">
            <div
              className="grid items-center gap-2 bg-bar px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-bar-fg"
              style={{ gridTemplateColumns: GRID }}
            >
              <span className="flex items-center">
                {selectMode ? (
                  <input
                    type="checkbox"
                    aria-label="Select all loads"
                    checked={rows.length > 0 && selected.size === rows.length}
                    ref={(el) => {
                      if (el)
                        el.indeterminate =
                          selected.size > 0 && selected.size < rows.length;
                    }}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? new Set(rows.map((r) => r.id))
                          : new Set(),
                      )
                    }
                    className="h-3.5 w-3.5 cursor-pointer accent-red-600"
                  />
                ) : null}
              </span>
              <span>Status</span>
              <span>Load #</span>
              <span>Broker</span>
              <span>Origin → Dest</span>
              <span>Pickup</span>
              <span>Delivery</span>
              <span>Trip</span>
              <span className="text-right">Rate</span>
              <span className="text-right">Miles</span>
              <span className="text-right">DH</span>
              <span className="text-right">Net</span>
              <span />
            </div>

            {rows.length === 0 ? (
              <div className="px-3 py-8 text-center font-mono text-[13px] text-fg-subtle">
                No loads yet. Hit “Add load” to start tracking.
              </div>
            ) : (
              rows.map((r, i) => (
                <div
                  key={r.id}
                  role={selectMode ? "button" : "link"}
                  tabIndex={0}
                  aria-pressed={selectMode ? selected.has(r.id) : undefined}
                  onClick={() => {
                    if (selectMode) toggleSelected(r.id);
                    else router.push(`/admin/dispatch/loads/${r.id}`);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    if (selectMode) toggleSelected(r.id);
                    else router.push(`/admin/dispatch/loads/${r.id}`);
                  }}
                  className={
                    "grid cursor-pointer items-center gap-2 px-3 py-2 text-[12.5px] transition-colors " +
                    (selectMode && selected.has(r.id)
                      ? "bg-red-50 hover:bg-red-100 "
                      : "hover:bg-elevated ") +
                    (i === rows.length - 1 ? "" : "border-b border-line")
                  }
                  style={{ gridTemplateColumns: GRID }}
                >
                  {/* Checkbox only in delete mode — visual mirror of the row's
                      selected state (the whole row toggles). */}
                  <span className="flex items-center">
                    {selectMode ? (
                      <input
                        type="checkbox"
                        readOnly
                        aria-hidden
                        tabIndex={-1}
                        checked={selected.has(r.id)}
                        className="pointer-events-none h-4 w-4 accent-red-600"
                      />
                    ) : null}
                  </span>
                  <span>
                    <span
                      className={
                        "inline-block rounded-sm px-1.5 py-[1px] font-mono text-[10px] font-bold uppercase tracking-[0.06em] " +
                        (STATUS_PILL[r.status] ?? "bg-elevated text-fg-subtle")
                      }
                    >
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </span>
                  <span className="truncate font-mono text-fg-muted">
                    {r.loadNumber}
                  </span>
                  <span className="truncate font-semibold text-fg">
                    {r.broker}
                  </span>
                  <span className="truncate text-fg">
                    {r.origin} <span className="text-fg-subtle">→</span>{" "}
                    {r.destination}
                  </span>
                  <span className="text-fg-muted">{r.pickup}</span>
                  <span className="text-fg-muted">{r.delivery}</span>
                  <span className="truncate text-blue-700">{r.trip}</span>
                  <span className="text-right font-bold tabular-nums text-green-700">
                    {usd(r.rate)}
                  </span>
                  <span className="text-right tabular-nums text-fg-muted">
                    {r.loadedMiles != null
                      ? r.loadedMiles.toLocaleString()
                      : "—"}
                  </span>
                  <span className="text-right tabular-nums text-red-600">
                    {r.dhMiles > 0 ? r.dhMiles.toLocaleString() : "—"}
                  </span>
                  <span className="text-right font-bold tabular-nums text-green-700">
                    {usd(r.net)}
                  </span>
                  <span className="flex justify-end">
                    {r.paymentStatus === "paid" ? (
                      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-green-700">
                        Paid
                      </span>
                    ) : null}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Cards (mobile) */}
        <div className="space-y-2 md:hidden">
          {rows.length === 0 ? (
            <div className="rounded-md border border-line bg-card px-3 py-8 text-center font-mono text-[13px] text-fg-subtle">
              No loads yet. Hit “Add load” to start tracking.
            </div>
          ) : (
            rows.map((r) => {
              const isSel = selectMode && selected.has(r.id);
              return (
                <div
                  key={r.id}
                  role={selectMode ? "button" : "link"}
                  tabIndex={0}
                  aria-pressed={selectMode ? selected.has(r.id) : undefined}
                  onClick={() => {
                    if (selectMode) toggleSelected(r.id);
                    else router.push(`/admin/dispatch/loads/${r.id}`);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    if (selectMode) toggleSelected(r.id);
                    else router.push(`/admin/dispatch/loads/${r.id}`);
                  }}
                  className={
                    "flex cursor-pointer items-stretch overflow-hidden rounded-md border shadow-sm transition-colors active:bg-elevated " +
                    (isSel ? "border-red-400 bg-red-50" : "border-line bg-card")
                  }
                >
                  {/* Selection indicator — only in delete mode. The whole card
                      toggles, so this is a visual checkbox, not a hit target. */}
                  {selectMode ? (
                    <div
                      aria-hidden
                      className={
                        "flex w-12 shrink-0 items-center justify-center border-r transition-colors " +
                        (isSel
                          ? "border-red-300 bg-red-100"
                          : "border-line bg-card")
                      }
                    >
                      <span
                        className={
                          "flex h-5 w-5 items-center justify-center rounded border-2 text-[12px] font-bold leading-none " +
                          (isSel
                            ? "border-red-600 bg-red-600 text-white"
                            : "border-line-strong text-transparent")
                        }
                      >
                        ✓
                      </span>
                    </div>
                  ) : null}

                  {/* Content */}
                  <div className="min-w-0 flex-1 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={
                          "inline-block rounded-sm px-1.5 py-[1px] font-mono text-[10px] font-bold uppercase tracking-[0.06em] " +
                          (STATUS_PILL[r.status] ?? "bg-elevated text-fg-subtle")
                        }
                      >
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                      <span className="font-mono text-[15px] font-bold tabular-nums text-green-700">
                        {usd(r.rate)}
                      </span>
                    </div>

                    <div className="mt-1.5 truncate text-[14px] font-semibold text-fg">
                      {r.broker}
                    </div>
                    <div className="truncate text-[12.5px] text-fg-muted">
                      {r.origin} <span className="text-fg-subtle">→</span>{" "}
                      {r.destination}
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-fg-subtle">
                      <span>#{r.loadNumber}</span>
                      <span>
                        {r.pickup} <span className="text-fg-subtle">→</span>{" "}
                        {r.delivery}
                      </span>
                      {r.loadedMiles != null ? (
                        <span>{r.loadedMiles.toLocaleString()} mi</span>
                      ) : null}
                      <span className="font-bold text-green-700">
                        Net {usd(r.net)}
                      </span>
                    </div>

                    {r.paymentStatus === "paid" ? (
                      <div className="mt-2 text-right font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-green-700">
                        Paid
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
}

// Submit button for the bulk-delete form. useFormStatus disables it and
// shows progress while the soft-delete server action is in flight, so the
// delete can't be double-fired.
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

function ProfitGoalBar({ net, monthLabel }: { net: number; monthLabel: string }) {
  const GOAL = 10000;
  const pct = Math.max(0, Math.min(100, (net / GOAL) * 100));
  const reached = net >= GOAL;
  // Inner slash marks at each $2,500 (25/50/75%).
  const marks = [25, 50, 75];
  const labels = ["$0", "$2.5k", "$5k", "$7.5k", "$10k"];
  return (
    <div className="mb-2 rounded-md border border-line bg-card px-3.5 py-3 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-indigo-600">
          Net profit goal · {monthLabel}
        </span>
        <span className="font-mono text-[12px] tabular-nums">
          <span className="font-bold text-green-700">{usd(net)}</span>
          <span className="text-fg-subtle"> / {usd(GOAL)}</span>
          {reached ? (
            <span className="ml-2 rounded bg-green-100 px-1.5 py-[1px] text-[10px] font-bold uppercase tracking-[0.06em] text-green-700">
              Goal!
            </span>
          ) : null}
        </span>
      </div>
      <div className="relative mt-2 h-3.5 overflow-hidden rounded-full bg-elevated">
        <div
          className="h-full rounded-full bg-green-600 transition-all"
          style={{ width: `${pct}%` }}
        />
        {marks.map((m) => (
          <span
            key={m}
            className="absolute top-0 h-full w-[2px] bg-card"
            style={{ left: `${m}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9px] tabular-nums text-fg-subtle">
        {labels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: "count" | "green" | "red" | "muted";
  hint?: string;
}) {
  const color =
    tone === "green"
      ? "text-green-700"
      : tone === "red"
        ? "text-red-700"
        : tone === "muted"
          ? "text-fg-subtle"
          : "text-blue-700";
  return (
    <div className="min-w-0 bg-card px-3 py-2.5">
      <div className="truncate font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-indigo-600">
        {label}
      </div>
      <div className={"mt-1 truncate text-[18px] font-bold tabular-nums leading-none sm:text-[20px] " + color}>
        {value}
      </div>
      {hint ? (
        <div className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.08em] text-amber-700">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function usd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return "$" + Math.round(n).toLocaleString("en-US");
}
