"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { softDeleteLoads } from "./actions";
import { AddLoadButton } from "./AddLoadButton";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusTag, type StatusTone } from "@/components/ui/StatusTag";

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
  /**
   * ALL-TIME accounts receivable: the total RATE owed across every
   * delivered-but-unpaid load, regardless of month. Deliberately NOT
   * month-scoped — the A/R card shows the same number on every month view.
   */
  arTotal: number;
  /** Editable goal-bar targets (Settings → Net profit goals). */
  monthlyGoal: number;
  annualGoal: number;
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

const STATUS_TONE: Record<string, StatusTone> = {
  pending: "amber",
  assigned: "amber",
  loaded: "steel",
  delivered: "green",
  cancelled: "slate",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  assigned: "Rolling",
  loaded: "Loaded",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

// 11 columns (Mi + DH removed), re-proportioned to fill the width evenly and
// fit without horizontal scroll on a ~1080px-wide portrait screen (see min-w
// below). The wide Broker/Lane/Trip columns flex + truncate.
const GRID =
  "24px 96px 84px minmax(0,1.5fr) minmax(0,1.8fr) 58px 58px minmax(0,1fr) 92px 92px 56px";

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

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Dispatch"
          title="Load board"
          className="mb-3"
          actions={
            /* Month filter — slices the whole board (stats + list) by month. */
            <label className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-ink-3">
                Month
              </span>
              <select
                value={month === "all" ? "all" : String(month)}
                onChange={(e) =>
                  setMonth(e.target.value === "all" ? "all" : Number(e.target.value))
                }
                className="h-[34px] rounded-md border border-line-strong bg-card px-3 font-mono text-[12px] font-bold uppercase tracking-[0.08em] text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/40"
              >
                <option value="all">All months</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          }
        />

        {/* Profit-toward-goal bar. A specific month tracks that month's net vs
            the MONTHLY goal; "All months" tracks the all-months net vs the
            ANNUAL goal. Both targets are editable in Settings. */}
        <ProfitGoalBar
          net={stats.net}
          goal={month === "all" ? data.annualGoal : data.monthlyGoal}
          label={month === "all" ? "All months" : MONTHS[month]}
        />

        {/* KPI strip — Net profit is the focal (graphite) tile. */}
        <div className="mb-4 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line shadow-e2 sm:grid-cols-6">
          {/* A/R is all-time (same on every month) and links to the full
              Accounts Receivable page where loads get marked paid. Pinned
              leftmost per Brent's request. */}
          <Kpi
            label="A/R · all"
            value={usd(data.arTotal)}
            tone={data.arTotal > 0 ? "red" : "muted"}
            href="/admin/dispatch/receivables"
          />
          <Kpi label="Total loads" value={String(stats.totalLoads)} tone="count" />
          <Kpi label="Delivered" value={String(stats.delivered)} tone="green" />
          <Kpi label="Gross" value={usd(stats.gross)} tone="green" />
          <Kpi label="Net profit" value={usd(stats.net)} tone="focal" />
          <div className="min-w-0 bg-card px-3 py-2.5">
            <div className="truncate font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
              Avg / mi
            </div>
            <div className="mt-1 truncate text-[16px] font-bold tabular-nums leading-none text-ok sm:text-[18px]">
              ${stats.avgNetPerMile.toFixed(2)}
              <span className="ml-1 text-[10px] font-medium text-ink-3">net</span>
            </div>
            <div className="mt-1 truncate text-[13px] font-bold tabular-nums leading-none text-ok">
              ${stats.avgGrossPerMile.toFixed(2)}
              <span className="ml-1 text-[10px] font-medium text-ink-3">gross</span>
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
            className="h-[34px] min-w-0 flex-1 rounded-md border border-line-strong bg-card px-3 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/40 sm:max-w-sm"
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
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-bad/40 bg-bad-bg px-3 py-2">
            <span className="font-mono text-[12px] font-bold text-ink">
              {selected.size} selected
            </span>
            <span className="font-mono text-[11px] text-ink-3">
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
        <div className="hidden overflow-x-auto rounded-md border border-line bg-card shadow-e2 md:block">
          <div className="min-w-[780px]">
            <div
              className="grid items-center gap-1.5 border-b-2 border-line-strong bg-inset px-2 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-ink-3"
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
              <span>Load#</span>
              <span>Broker</span>
              <span>Lane</span>
              <span>PU</span>
              <span>Del</span>
              <span>Trip</span>
              <span className="text-right">Rate</span>
              <span className="text-right">Net</span>
              <span className="text-right">Paid</span>
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
                    "grid cursor-pointer items-center gap-1.5 px-2 py-2 text-[12px] transition-colors " +
                    (selectMode && selected.has(r.id)
                      ? "bg-bad-bg hover:bg-bad-bg "
                      : (i % 2 === 0 ? "bg-card " : "bg-inset ") + "hover:bg-inset ") +
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
                    <StatusTag tone={STATUS_TONE[r.status] ?? "slate"}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </StatusTag>
                  </span>
                  <span className="truncate font-mono text-ink-3">
                    {r.loadNumber}
                  </span>
                  <span className="truncate font-semibold text-ink">
                    {r.broker}
                  </span>
                  <span className="truncate text-ink">
                    {r.origin} <span className="text-ink-3">→</span>{" "}
                    {r.destination}
                  </span>
                  <span className="truncate text-ink-2">{r.pickup}</span>
                  <span className="truncate text-ink-2">{r.delivery}</span>
                  <span className="truncate text-steel">{r.trip}</span>
                  <span className="text-right font-bold tabular-nums text-ok">
                    {usd(r.rate)}
                  </span>
                  <span className="text-right font-bold tabular-nums text-ok">
                    {usd(r.net)}
                  </span>
                  <span className="flex justify-end">
                    {r.paymentStatus === "paid" ? (
                      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-ok">
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
                    "flex cursor-pointer items-stretch overflow-hidden rounded-md border shadow-e1 transition-colors active:bg-inset " +
                    (isSel ? "border-bad bg-bad-bg" : "border-line bg-card")
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
                          ? "border-bad/40 bg-bad-bg"
                          : "border-line bg-card")
                      }
                    >
                      <span
                        className={
                          "flex h-5 w-5 items-center justify-center rounded border-2 text-[12px] font-bold leading-none " +
                          (isSel
                            ? "border-bad bg-bad text-white"
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
                      <StatusTag tone={STATUS_TONE[r.status] ?? "slate"}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </StatusTag>
                      <span className="font-mono text-[15px] font-bold tabular-nums text-ok">
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
                      <span className="font-bold text-ok">
                        Net {usd(r.net)}
                      </span>
                    </div>

                    {r.paymentStatus === "paid" ? (
                      <div className="mt-2 text-right font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-ok">
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

function ProfitGoalBar({
  net,
  goal,
  label,
}: {
  net: number;
  goal: number;
  label: string;
}) {
  const target = goal > 0 ? goal : 10000;
  const pct = Math.max(0, Math.min(100, (net / target) * 100));
  const reached = net >= target;
  // Inner slash marks at each quarter (25/50/75%).
  const marks = [25, 50, 75];
  // Tick labels derived from the goal so the scale matches the target ($10k
  // monthly, $120k annual, or any edited value).
  const labels = [0, 0.25, 0.5, 0.75, 1].map((f) => abbrUsd(target * f));
  return (
    <div className="mb-2 rounded-md border border-line bg-card px-3.5 py-3 shadow-e1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
          Net profit goal · {label}
        </span>
        <span className="font-mono text-[12px] tabular-nums">
          <span className="font-bold text-ok">{usd(net)}</span>
          <span className="text-ink-3"> / {usd(target)}</span>
          {reached ? (
            <span className="ml-2 rounded bg-ok-bg px-1.5 py-[1px] text-[10px] font-bold uppercase tracking-[0.06em] text-ok">
              Goal!
            </span>
          ) : null}
        </span>
      </div>
      <div className="relative mt-2 h-3.5 overflow-hidden rounded-full bg-inset">
        <div
          className="h-full rounded-full bg-ok transition-all"
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
      <div className="mt-1 flex justify-between font-mono text-[9px] tabular-nums text-ink-3">
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
  href,
}: {
  label: string;
  value: string;
  tone: "count" | "green" | "red" | "muted" | "focal";
  hint?: string;
  href?: string;
}) {
  // Focal — the graphite hero cell with a 3px accent left edge.
  if (tone === "focal") {
    return (
      // Softer charcoal-grey than the near-black graphite token (which the side
      // nav + command bar use) — this focal KPI only. Accent edge + white text
      // kept.
      <div className="relative min-w-0 overflow-hidden bg-[#262b33] px-3 py-2.5 pl-4">
        <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-accent" />
        <div className="truncate font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-on-dark-dim">
          {label}
        </div>
        <div className="mt-1 truncate text-[18px] font-bold tabular-nums leading-none text-white sm:text-[20px]">
          {value}
        </div>
      </div>
    );
  }
  const color =
    tone === "green"
      ? "text-ok"
      : tone === "red"
        ? "text-bad"
        : tone === "muted"
          ? "text-ink-3"
          : "text-steel";
  const inner = (
    <>
      <div className="truncate font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
        {label}
        {href ? <span aria-hidden className="ml-1 text-ink-3">›</span> : null}
      </div>
      <div className={"mt-1 truncate text-[18px] font-bold tabular-nums leading-none sm:text-[20px] " + color}>
        {value}
      </div>
      {hint ? (
        <div className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.08em] text-warn">
          {hint}
        </div>
      ) : null}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="min-w-0 bg-card px-3 py-2.5 transition-colors hover:bg-inset"
      >
        {inner}
      </Link>
    );
  }
  return <div className="min-w-0 bg-card px-3 py-2.5">{inner}</div>;
}

function usd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return "$" + Math.round(n).toLocaleString("en-US");
}

/** Compact axis label: 0 → "$0", 2500 → "$2.5k", 10000 → "$10k", 120000 → "$120k". */
function abbrUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "$0";
  if (n < 1000) return "$" + Math.round(n);
  const k = n / 1000;
  const s = Number.isInteger(k) ? String(k) : k.toFixed(1);
  return "$" + s + "k";
}
