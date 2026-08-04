"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StatusTag } from "@/components/ui/StatusTag";
import { softDeleteTrips } from "./actions";

/**
 * Trips list — approved redesign: a KPI strip (Active trips / Gross / Net /
 * Avg profit %) over one dense table per status group (dark header row,
 * zebra body), replacing the old stacked performance cards. The server page
 * does the data fetch + aggregation (via computeTripFinancials, the same
 * rollup the trip detail page uses) and hands the computed rows down;
 * nothing here does money math, it only labels and lays out what it's given.
 *
 * Whole row links to the trip. The Delete button enters an explicit
 * selection mode (tap rows to select → Delete selected / Cancel), the same
 * mode-based pattern the load board uses — no persistent checkboxes.
 */

export type TripListItem = {
  id: string;
  name: string;
  status: string;
  notes: string | null;
  /** No ended_at — the trip is "Ongoing" and stays Active. */
  ongoing: boolean;
  /** Pre-formatted on the server, Central time: start date&time (ongoing) or
   * the "Jun 24 → Jul 3" range (end set). */
  datesPrimary: string;
  /** "9 days" / "5 days, 11 hrs" — only set when ongoing is false. */
  datesDuration: string | null;
  loads: number;
  gross: number;
  net: number;
  spent: number;
  /** net ÷ gross × 100, or null when gross is 0. */
  profitPct: number | null;
  /** loaded + deadhead + personal-conveyance miles, the same total the trip
   * detail page's Miles card shows. */
  totalMiles: number;
  /** "YYYY-MM" the trip started in (Central calendar), for the KPI strip's
   * current-month Gross/Net tiles. */
  monthKey: string;
};

// Sign goes OUTSIDE the dollar sign — a losing trip reads "-$310", not the
// "$-310" a naive "$" + n produces.
function usd(n: number): string {
  const r = Math.round(n);
  return (r < 0 ? "-$" : "$") + Math.abs(r).toLocaleString("en-US");
}

/**
 * Margin tone. A trip that lost money reads red; a thin margin reads amber so
 * it stands out from a healthy run at a glance. Tone only — the underlying
 * numbers are computeTripFinancials', untouched.
 */
type MarginTone = "ok" | "warn" | "bad";
function marginTone(net: number, profitPct: number | null): MarginTone {
  if (net < 0) return "bad";
  if (profitPct != null && profitPct < 15) return "warn";
  return "ok";
}
const TONE_TEXT: Record<MarginTone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
};

// Dark header row, matching the app's other restyled tables — solid
// graphite bar, white uppercase labels. Zebra body underneath, applied to
// the tbody so it wins over each row's own bg regardless of alternating
// count.
const TABLE_HEAD_ROW =
  "bg-bar text-[10.5px] font-bold uppercase tracking-[0.08em] text-bar-fg";
const ZEBRA_ROWS = "[&>tr:nth-child(odd)]:bg-card [&>tr:nth-child(even)]:bg-inset";

export function TripsListView({
  trips,
  monthKeyNow,
  monthLabel,
}: {
  trips: TripListItem[];
  /** "YYYY-MM" for the current Central calendar month. */
  monthKeyNow: string;
  /** "Aug" — short month name for the KPI tile labels. */
  monthLabel: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Selection only exists inside an explicit delete mode. Default off: rows
  // open the trip on tap and show no checkboxes.
  const [selectMode, setSelectMode] = useState(false);

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

  const active = trips.filter((t) => t.status !== "closed");
  const closed = trips.filter((t) => t.status === "closed");
  const ongoingCount = active.filter((t) => t.ongoing).length;

  const kpis = useMemo(() => {
    const monthTrips = trips.filter((t) => t.monthKey === monthKeyNow);
    const monthGross = monthTrips.reduce((sum, t) => sum + t.gross, 0);
    const monthNet = monthTrips.reduce((sum, t) => sum + t.net, 0);
    const withMargin = monthTrips.filter((t) => t.profitPct != null);
    const avgProfitPct =
      withMargin.length > 0
        ? withMargin.reduce((sum, t) => sum + (t.profitPct ?? 0), 0) / withMargin.length
        : null;
    return { monthGross, monthNet, avgProfitPct };
  }, [trips, monthKeyNow]);

  function onOpen(id: string) {
    router.push(`/admin/dispatch/trips/${id}`);
  }

  return (
    <div>
      <TripsKpiStrip
        activeCount={active.length}
        ongoingCount={ongoingCount}
        monthLabel={monthLabel}
        monthGross={kpis.monthGross}
        monthNet={kpis.monthNet}
        avgProfitPct={kpis.avgProfitPct}
      />

      {/* Toolbar — Delete enters selection mode. */}
      {!selectMode && trips.length > 0 ? (
        <div className="mb-2 flex items-center justify-end">
          <Button
            variant="destructive"
            type="button"
            onClick={() => setSelectMode(true)}
          >
            Delete
          </Button>
        </div>
      ) : null}

      {/* Delete-selection bar — only while in explicit delete mode. */}
      {selectMode ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-bad/40 bg-bad-bg px-3 py-2">
          <span className="font-mono text-[12px] font-bold text-fg">
            {selected.size} selected
          </span>
          <span className="font-mono text-[11px] text-fg-muted">
            · tap trips to select
          </span>
          <Button
            variant="cancel"
            size="sm"
            type="button"
            onClick={exitSelectMode}
            className="ml-auto"
          >
            Cancel
          </Button>
          <form
            action={softDeleteTrips}
            onSubmit={(e) => {
              if (selected.size === 0) {
                e.preventDefault();
                return;
              }
              if (
                !window.confirm(
                  `Delete ${selected.size} trip${selected.size === 1 ? "" : "s"}? They move to trash and can be restored for 30 days.`,
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
      ) : null}

      <div className="space-y-5">
        <TripTableSection
          label="Active trips"
          count={active.length}
          trips={active}
          selectMode={selectMode}
          selected={selected}
          onOpen={onOpen}
          onToggle={toggleSelected}
          emptyHint="No active trips."
        />
        {closed.length > 0 ? (
          <TripTableSection
            label="Closed trips"
            count={closed.length}
            trips={closed}
            selectMode={selectMode}
            selected={selected}
            onOpen={onOpen}
            onToggle={toggleSelected}
          />
        ) : null}
      </div>
    </div>
  );
}

/* ── KPI strip ────────────────────────────────────────────────────────── */

function TripsKpiStrip({
  activeCount,
  ongoingCount,
  monthLabel,
  monthGross,
  monthNet,
  avgProfitPct,
}: {
  activeCount: number;
  ongoingCount: number;
  monthLabel: string;
  monthGross: number;
  monthNet: number;
  avgProfitPct: number | null;
}) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      <KpiTile
        label="Active Trips"
        value={String(activeCount)}
        sub={
          ongoingCount > 0 ? (
            <span className="mt-1.5 inline-flex w-fit items-center rounded border border-warn/40 bg-warn-bg px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-warn">
              {ongoingCount} ongoing
            </span>
          ) : null
        }
      />
      <KpiTile label={`Gross / ${monthLabel}`} value={usd(monthGross)} />
      <KpiTile
        label={`Net / ${monthLabel}`}
        value={usd(monthNet)}
        dark
      />
      <KpiTile
        label="Avg Profit %"
        value={avgProfitPct != null ? `${Math.round(avgProfitPct)}%` : "—"}
      />
    </div>
  );
}

function KpiTile({
  label,
  value,
  sub,
  dark = false,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  dark?: boolean;
}) {
  return (
    <div
      className={
        "flex flex-col rounded-md p-4 shadow-e1 " +
        (dark ? "bg-graphite" : "border border-line-strong bg-card")
      }
    >
      <span
        className={
          "font-mono text-[10.5px] font-bold uppercase tracking-[0.1em] " +
          (dark ? "text-white/70" : "text-fg")
        }
      >
        {label}
      </span>
      <span
        className={
          "mt-1.5 text-[24px] font-bold leading-none tabular-nums " +
          (dark ? "text-white" : "text-fg")
        }
      >
        {value}
      </span>
      {sub}
    </div>
  );
}

/* ── Table section ────────────────────────────────────────────────────── */

function TripTableSection({
  label,
  count,
  trips,
  selectMode,
  selected,
  onOpen,
  onToggle,
  emptyHint,
}: {
  label: string;
  count: number;
  trips: TripListItem[];
  selectMode: boolean;
  selected: Set<string>;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  emptyHint?: string;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg">
          {label}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-fg-muted">
          · {count}
        </span>
      </div>
      {trips.length === 0 ? (
        emptyHint ? (
          <div className="rounded-md border border-line bg-card px-3 py-6 text-center font-mono text-[12px] text-fg-muted shadow-e1">
            {emptyHint}
          </div>
        ) : null
      ) : (
        <>
          {/* Desktop / wide table — unchanged. */}
          <div className="hidden overflow-hidden rounded-md border border-line-strong bg-card shadow-e1 lg:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-[13px]">
                <thead>
                  <tr className={TABLE_HEAD_ROW}>
                    {selectMode ? <th className="w-9 px-3 py-2.5" /> : null}
                    <th className="px-3 py-2.5 text-left">Trip</th>
                    <th className="px-3 py-2.5 text-left">Dates</th>
                    <th className="px-3 py-2.5 text-right">Loads</th>
                    <th className="px-3 py-2.5 text-right">Miles</th>
                    <th className="px-3 py-2.5 text-right">Gross</th>
                    <th className="px-3 py-2.5 text-right">Net</th>
                    <th className="px-3 py-2.5 text-right">Profit %</th>
                    <th className="px-3 py-2.5 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className={ZEBRA_ROWS}>
                  {trips.map((t) => (
                    <TripRow
                      key={t.id}
                      trip={t}
                      selectMode={selectMode}
                      isSel={selectMode && selected.has(t.id)}
                      onOpen={onOpen}
                      onToggle={onToggle}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile — stacked rows, not a squeezed table. */}
          <div className="divide-y divide-line-strong overflow-hidden rounded-md border border-line-strong bg-card shadow-e1 lg:hidden">
            {trips.map((t) => (
              <TripCardRow
                key={t.id}
                trip={t}
                selectMode={selectMode}
                isSel={selectMode && selected.has(t.id)}
                onOpen={onOpen}
                onToggle={onToggle}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function TripRow({
  trip,
  selectMode,
  isSel,
  onOpen,
  onToggle,
}: {
  trip: TripListItem;
  selectMode: boolean;
  isSel: boolean;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const tone = marginTone(trip.net, trip.profitPct);
  return (
    <tr
      role={selectMode ? "button" : "link"}
      tabIndex={0}
      aria-pressed={selectMode ? isSel : undefined}
      onClick={() => (selectMode ? onToggle(trip.id) : onOpen(trip.id))}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        if (selectMode) onToggle(trip.id);
        else onOpen(trip.id);
      }}
      className={
        "cursor-pointer border-b border-line last:border-b-0 transition-colors hover:bg-elevated " +
        (isSel ? "!bg-bad-bg" : "")
      }
    >
      {selectMode ? (
        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
          <span
            aria-hidden
            onClick={() => onToggle(trip.id)}
            className={
              "flex h-5 w-5 cursor-pointer items-center justify-center rounded border-2 text-[12px] font-bold leading-none " +
              (isSel
                ? "border-bad bg-bad text-white"
                : "border-line-strong text-transparent")
            }
          >
            ✓
          </span>
        </td>
      ) : null}

      <td className="max-w-[220px] px-3 py-2.5">
        <div className="truncate font-bold text-fg">{trip.name}</div>
        {trip.notes ? (
          <div className="truncate text-[11.5px] font-medium text-fg-muted">
            {trip.notes}
          </div>
        ) : null}
      </td>

      <td className="px-3 py-2.5">
        <div className="whitespace-nowrap font-mono text-[12px] font-semibold text-fg">
          {trip.datesPrimary}
        </div>
        {trip.ongoing ? (
          <span className="mt-1 inline-flex w-fit items-center rounded border border-warn/40 bg-warn-bg px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-warn">
            Ongoing · no end
          </span>
        ) : trip.datesDuration ? (
          <div className="mt-0.5 font-mono text-[11px] text-fg-muted">
            {trip.datesDuration}
          </div>
        ) : null}
      </td>

      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-fg">
        {trip.loads}
      </td>

      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-fg">
        {trip.totalMiles.toLocaleString("en-US")}
      </td>

      <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums text-fg">
        {usd(trip.gross)}
      </td>

      <td
        className={
          "px-3 py-2.5 text-right font-mono font-bold tabular-nums " + TONE_TEXT[tone]
        }
      >
        {usd(trip.net)}
      </td>

      <td
        className={
          "px-3 py-2.5 text-right font-mono font-semibold tabular-nums " + TONE_TEXT[tone]
        }
      >
        {trip.profitPct != null ? `${Math.round(trip.profitPct)}%` : "—"}
      </td>

      <td className="px-3 py-2.5">
        <StatusPill status={trip.status} />
      </td>
    </tr>
  );
}

// Mobile row — same data as TripRow, laid out as a stacked card instead of
// table cells: name + status pill on one line, dates/lane under it, then a
// loads·miles meta line with net + margin right-aligned.
function TripCardRow({
  trip,
  selectMode,
  isSel,
  onOpen,
  onToggle,
}: {
  trip: TripListItem;
  selectMode: boolean;
  isSel: boolean;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const tone = marginTone(trip.net, trip.profitPct);
  return (
    <div
      role={selectMode ? "button" : "link"}
      tabIndex={0}
      aria-pressed={selectMode ? isSel : undefined}
      onClick={() => (selectMode ? onToggle(trip.id) : onOpen(trip.id))}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        if (selectMode) onToggle(trip.id);
        else onOpen(trip.id);
      }}
      className={
        "flex cursor-pointer items-start gap-3 px-3 py-3 transition-colors active:bg-elevated " +
        (isSel ? "!bg-bad-bg" : "")
      }
    >
      {selectMode ? (
        <span
          aria-hidden
          onClick={(e) => {
            e.stopPropagation();
            onToggle(trip.id);
          }}
          className={
            "mt-0.5 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded border-2 text-[12px] font-bold leading-none " +
            (isSel
              ? "border-bad bg-bad text-white"
              : "border-line-strong text-transparent")
          }
        >
          ✓
        </span>
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-bold text-fg">{trip.name}</span>
          <StatusPill status={trip.status} />
        </div>

        {trip.notes ? (
          <div className="mt-0.5 truncate text-[11.5px] font-medium text-fg-muted">
            {trip.notes}
          </div>
        ) : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[12px] font-semibold text-fg">
            {trip.datesPrimary}
          </span>
          {trip.ongoing ? (
            <span className="inline-flex w-fit items-center rounded border border-warn/40 bg-warn-bg px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-warn">
              Ongoing · no end
            </span>
          ) : trip.datesDuration ? (
            <span className="font-mono text-[11px] font-semibold text-fg-muted">
              {trip.datesDuration}
            </span>
          ) : null}
        </div>

        <div className="mt-1.5 flex items-end justify-between gap-2">
          <span className="font-mono text-[11.5px] font-semibold text-fg-muted">
            {trip.loads} load{trip.loads === 1 ? "" : "s"} ·{" "}
            {trip.totalMiles.toLocaleString("en-US")} mi
          </span>
          <div className="text-right leading-tight">
            <div
              className={
                "font-mono text-[14px] font-bold tabular-nums " + TONE_TEXT[tone]
              }
            >
              {usd(trip.net)}
            </div>
            <div
              className={
                "font-mono text-[11px] font-semibold tabular-nums " + TONE_TEXT[tone]
              }
            >
              {trip.profitPct != null ? `${Math.round(trip.profitPct)}%` : "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const closed = status === "closed";
  return (
    <StatusTag tone={closed ? "slate" : "green"}>
      {closed ? "Closed" : "Active"}
    </StatusTag>
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
            className="h-3 w-3 animate-spin rounded-full border-2 border-red-600/40 border-t-red-600"
          />
        ) : undefined
      }
    >
      {pending ? "Deleting…" : `Delete ${count}`}
    </Button>
  );
}
