"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { softDeleteLoads } from "./actions";
import { AddLoadButton } from "./AddLoadButton";
import { PopoutButton } from "../email-broker/PopoutButton";
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
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
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

        {/* KPI strip — each metric is its OWN raised card, the same chrome the
            trip cards carry (rounded-lg, border-line-strong, e2), separated by
            real gaps rather than being cells inside one box. Two across on a
            phone so a six-figure Gross isn't squeezed into a third of a 360px
            screen; six across once there's room. Net profit leads on size and
            weight alone — no filled tile, no accent rail. */}
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {/* A/R is all-time (same on every month) and links to the full
              Accounts Receivable page where loads get marked paid. Pinned
              leftmost per Brent's request. */}
          <Kpi
            label="A/R · all"
            value={usd(data.arTotal)}
            tone={data.arTotal > 0 ? "red" : "muted"}
            href="/admin/dispatch/receivables"
          />
          {/* Plain counts, not money — they read ink. A delivered load isn't
              "good money", it's just a tally, so it gets no green. */}
          <Kpi label="Total loads" value={String(stats.totalLoads)} tone="ink" />
          <Kpi label="Delivered" value={String(stats.delivered)} tone="ink" />
          <Kpi label="Gross" value={usd(stats.gross)} tone="green" />
          {/* Net profit is the strip's headline: same card surface as its
              neighbours, just a bigger number. A losing month reads red — the
              only color here is data. */}
          <Kpi
            label="Net profit"
            value={usd(stats.net)}
            tone={stats.net < 0 ? "red" : "green"}
            strong
          />
          <div className={KPI_CARD}>
            <div className="truncate font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-ink-3">
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

        {/* Toolbar — buttons on top, search underneath. The old filter pills
            were removed; the month dropdown above is the filter now. Inquiry
            and Add load are the board's two CTAs and carry the raised accent
            treatment; Delete stays outlined so it never reads like one of
            them.

            The three buttons share the row as equal thirds via flex-1 (basis
            0, so width is content-independent and the labels can't skew the
            split). Delete is conditional — flex-1 lets the remaining two
            re-split evenly on their own, which a fixed 3-col grid would not:
            it would strand an empty column. The row is capped on desktop so
            three buttons don't stretch to ~380px each across the max-w-6xl
            page. */}
        <div className="mb-2 space-y-2">
          <div className="flex max-w-2xl items-center gap-2">
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
            <PopoutButton variant="primary-raised" className={ACTION_BTN}>
              <span className="min-w-0 truncate">Inquiry</span>
            </PopoutButton>
            <AddLoadButton
              brokerNames={data.brokerNames}
              activeTrips={data.activeTrips}
              className={ACTION_BTN}
            >
              <span className="min-w-0 truncate">+ Add load</span>
            </AddLoadButton>
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search load #, broker, origin, destination…"
            className="h-[34px] w-full min-w-0 rounded-md border border-line-strong bg-card px-3 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/40"
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
            {/* Select-all moved here from the old table header, which the card
                grid replaced — the bulk pick is a property of delete mode, not
                of a table. Toggles the whole VISIBLE (month + search) slice. */}
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

        {/* The board — one load card per load, the trip cards' anatomy. The
            desktop table this replaced is gone entirely: the SAME card renders
            at every width, one column on a phone and a 2-up / 3-up grid once
            there's room, so the board reads like the rest of the app instead
            of a spreadsheet. items-start is deliberate — cards size to their
            own content rather than stretching to the tallest in the row. */}
        {rows.length === 0 ? (
          <div className="rounded-lg border border-line-strong bg-card px-3 py-8 text-center font-mono text-[13px] text-fg-subtle shadow-e1">
            {query.trim()
              ? "No loads match that search."
              : "No loads yet. Hit “Add load” to start tracking."}
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-2 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((r) => (
              <LoadCard
                key={r.id}
                row={r}
                selectMode={selectMode}
                isSel={selectMode && selected.has(r.id)}
                onOpen={(id) => router.push(`/admin/dispatch/loads/${id}`)}
                onToggle={toggleSelected}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

/**
 * One load, as a card — the trip cards' anatomy applied to a load: broker +
 * status pill, the lane, identity chips, one grouped Rate · Net · Margin stat
 * module, and the margin drawn as a bar. Net is the canonical per-load net the
 * server computed (loadNet), handed down as `row.net`; nothing here does money
 * math beyond the margin ratio.
 *
 * This is the ONLY load renderer — the board draws it at every width, so a
 * desktop load and a phone load are the same object, not two designs to keep
 * in sync.
 */
function LoadCard({
  row: r,
  selectMode,
  isSel,
  onOpen,
  onToggle,
}: {
  row: LoadRow;
  selectMode: boolean;
  isSel: boolean;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  // Net ÷ Rate, drawn twice: as the Margin cell and as the bar.
  const pct = marginPct(r);
  const tone: StatTone = r.net < 0 ? "bad" : "ok";
  return (
    <div
      role={selectMode ? "button" : "link"}
      tabIndex={0}
      aria-pressed={selectMode ? isSel : undefined}
      onClick={() => (selectMode ? onToggle(r.id) : onOpen(r.id))}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (selectMode) onToggle(r.id);
        else onOpen(r.id);
      }}
      className={
        "flex cursor-pointer items-stretch overflow-hidden rounded-lg border shadow-e2 transition-shadow hover:shadow-e3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:bg-inset " +
        (isSel ? "border-bad bg-bad-bg" : "border-line-strong bg-card")
      }
    >
      {/* Selection indicator — only in delete mode. The whole card toggles, so
          this is a visual checkbox, not a hit target. */}
      {selectMode ? (
        <div
          aria-hidden
          className={
            "flex w-12 shrink-0 items-center justify-center border-r transition-colors " +
            (isSel ? "border-bad/40 bg-bad-bg" : "border-line bg-card")
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

      <div className="min-w-0 flex-1 p-3">
        {/* Identity — broker leads, status pill holds the right edge. */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 truncate text-[15px] font-semibold leading-tight text-fg">
            {r.broker}
          </div>
          <StatusTag tone={STATUS_TONE[r.status] ?? "slate"}>
            {STATUS_LABEL[r.status] ?? r.status}
          </StatusTag>
        </div>

        {/* The lane — what the load IS, so it sits directly under the name
            rather than among the chips. */}
        <div className="mt-0.5 truncate text-[12.5px] text-fg-muted">
          {r.origin} <span className="text-fg-subtle">→</span> {r.destination}
        </div>

        {/* Identity chips — load #, the pickup→delivery span, the miles, and
            the trip (the last of the old table's columns that isn't already
            on the card). Neutral for the dates, steel for the counts. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="rounded border border-steel/40 bg-steel-bg px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums text-steel shadow-e1">
            #{r.loadNumber}
          </span>
          <span className="rounded border border-line-strong bg-inset px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-fg shadow-e1">
            {r.pickup} <span className="text-fg-subtle">→</span> {r.delivery}
          </span>
          {r.loadedMiles != null ? (
            <span className="rounded border border-steel/40 bg-steel-bg px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums text-steel shadow-e1">
              {r.loadedMiles.toLocaleString()} mi
            </span>
          ) : null}
          {r.trip ? (
            <span className="max-w-full truncate rounded border border-line-strong bg-inset px-1.5 py-0.5 font-mono text-[11px] font-semibold text-fg-muted shadow-e1">
              {r.trip}
            </span>
          ) : null}
        </div>

        {/* Grouped stat module — Rate · Net · Margin as equal thirds of one
            inset panel. Rate is a plain figure and reads ink; Net and Margin
            are the earnings, so they carry the green. */}
        <div className="mt-2 grid grid-cols-3 overflow-hidden rounded-md border border-line-strong bg-inset shadow-e1">
          <LoadStat label="Rate" value={usd(r.rate)} />
          <LoadStat label="Net" value={usd(r.net)} tone={tone} strong divider />
          <LoadStat
            label="Margin"
            value={pct != null ? `${Math.round(pct)}%` : "—"}
            tone={tone}
            divider
          />
        </div>

        {r.paymentStatus === "paid" ? (
          <div className="mt-2 text-right font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-ok">
            Paid
          </div>
        ) : null}

        {/* Margin bar — the Margin percentage, drawn. */}
        <div
          aria-hidden
          className="mt-2 h-1 w-full overflow-hidden rounded-full border border-line-strong bg-inset"
        >
          <div
            className={"h-full " + (tone === "bad" ? "bg-bad" : "bg-ok")}
            style={{
              width: `${pct == null ? 0 : Math.min(100, Math.max(0, pct))}%`,
            }}
          />
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

/**
 * The three action buttons share one row as equal thirds. flex-1 sets basis 0
 * so the split is content-independent, and min-w-0 lets a column shrink below
 * its label (a flex item defaults to min-width:auto, which would otherwise
 * push the row wider than the page and give the board a horizontal scroll).
 *
 * The middle button is labelled "Inquiry", not "Load Inquiry": at the designed
 * 13px/px-3.5 the longer label measured 133px against an equal third of 104px
 * on a 360px phone, so it always rendered as "LOAD INQUI…". The short label
 * fits, and the compact type below `sm` keeps headroom for the longest
 * remaining label ("+ Add load") at the smallest phone width and at the larger
 * Display UI-scale settings. From `sm` the row has room, so the buttons return
 * to the exact designed size. Variants (outlined Delete, accent-raised
 * Inquiry/Add) are untouched.
 */
const ACTION_BTN =
  "flex-1 min-w-0 px-1.5! text-[11px]! sm:px-3.5! sm:text-[13px]!";

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
    <div className="mb-2 rounded-lg border border-line-strong bg-card px-3.5 py-3 shadow-e2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-ink-3">
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

/**
 * The KPI tiles' shared surface — the trip cards' chrome exactly, so each
 * metric reads as its own depth card rather than a cell in a box. Kept as a
 * const because the Avg/mi tile is written inline (it stacks two values) and
 * has to stay pixel-identical to its neighbours.
 */
const KPI_CARD =
  "min-w-0 rounded-lg border border-line-strong bg-card px-3 py-2.5 shadow-e2";

/**
 * One KPI tile — its own raised card. `strong` is Net profit: it out-weighs
 * its neighbours on size alone (20/22px vs 18/20px), no filled box and no
 * accent edge. Label styling matches the trip cards' stat labels.
 */
function Kpi({
  label,
  value,
  tone,
  hint,
  href,
  strong = false,
}: {
  label: string;
  value: string;
  // Color is meaning only: green = earnings, red = money owed, muted = a
  // settled/zero figure, ink = a plain count. There is deliberately no
  // decorative tone — a metric that isn't money is ink.
  tone: "green" | "red" | "muted" | "ink";
  hint?: string;
  href?: string;
  strong?: boolean;
}) {
  const color =
    tone === "green"
      ? "text-ok"
      : tone === "red"
        ? "text-bad"
        : tone === "muted"
          ? "text-ink-3"
          : "text-ink";
  const inner = (
    <>
      <div className="truncate font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-ink-3">
        {label}
        {href ? <span aria-hidden className="ml-1 text-ink-3">›</span> : null}
      </div>
      <div
        className={
          "mt-1 truncate font-bold tabular-nums leading-none " +
          (strong ? "text-[20px] sm:text-[22px] " : "text-[18px] sm:text-[20px] ") +
          color
        }
      >
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
        className={KPI_CARD + " block transition-shadow hover:shadow-e3 active:bg-inset"}
      >
        {inner}
      </Link>
    );
  }
  return <div className={KPI_CARD}>{inner}</div>;
}

function usd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return "$" + Math.round(n).toLocaleString("en-US");
}

/**
 * Margin = the canonical per-load net (loadNet, computed on the server and
 * handed down as `net`) over the gross rate. Null on a zero rate, where the
 * ratio is undefined rather than 0%.
 */
function marginPct(r: LoadRow): number | null {
  return r.rate > 0 ? (r.net / r.rate) * 100 : null;
}

type StatTone = "ok" | "bad" | "default";

/**
 * One labeled cell of a load card's stat group — the trip cards' Stat, cell
 * for cell. `strong` is Net: it out-weighs its neighbours on size alone
 * (17px vs 14px), no filled box.
 *
 * `divider` draws the separator as an explicit left border rather than a
 * `divide-x-*` utility on the parent — this Tailwind build emits the divide
 * COLOR but not the divide WIDTH, so divide-x silently renders nothing.
 */
function LoadStat({
  label,
  value,
  tone = "default",
  strong = false,
  divider = false,
}: {
  label: string;
  value: string;
  tone?: StatTone;
  strong?: boolean;
  divider?: boolean;
}) {
  const valueColor =
    tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : "text-fg";
  return (
    <div
      className={
        "min-w-0 px-2.5 py-1.5 " + (divider ? "border-l border-line-strong" : "")
      }
    >
      <div className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-fg-subtle">
        {label}
      </div>
      <div
        className={
          "mt-0.5 truncate font-bold leading-tight tabular-nums " +
          (strong ? "text-[17px] " : "text-[14px] ") +
          valueColor
        }
      >
        {value}
      </div>
    </div>
  );
}

/** Compact axis label: 0 → "$0", 2500 → "$2.5k", 10000 → "$10k", 120000 → "$120k". */
function abbrUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "$0";
  if (n < 1000) return "$" + Math.round(n);
  const k = n / 1000;
  const s = Number.isInteger(k) ? String(k) : k.toFixed(1);
  return "$" + s + "k";
}
