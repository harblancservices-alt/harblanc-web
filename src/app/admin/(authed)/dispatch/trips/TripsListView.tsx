"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StatusTag } from "@/components/ui/StatusTag";
import { softDeleteTrips } from "./actions";

/**
 * Trips list — one performance card per trip. The server page does the data
 * fetch + aggregation (via computeTripFinancials, the same rollup the trip
 * detail page uses) and hands the computed rows down; nothing here does money
 * math, it only labels and lays out what it's given.
 *
 * Card anatomy: the trip name + status tag, the date span and load count as
 * chips, then a shrink-wrapped Revenue · Net · Margin stat group and a margin
 * bar drawing the same percentage. Net leads on size and weight alone — no
 * filled tile, no accent rail; the only color is data (a losing trip reads
 * red, a thin margin amber).
 *
 * Tap a card to open the trip. The Delete button enters an explicit
 * selection mode (tap cards to select → Delete selected / Cancel), the same
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

export function TripsListView({ trips }: { trips: TripListItem[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Selection only exists inside an explicit delete mode. Default off: cards
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

  return (
    // The trip column is centred and capped rather than filling the page's
    // max-w-5xl: a trip card is a fixed amount of content, and stretching it
    // across a desktop page strands the stat group against the left edge.
    // Mobile is unaffected — w-full wins until the cap is reachable.
    <div className="mx-auto w-full max-w-2xl">
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
          <span className="font-mono text-[12px] font-bold text-ink">
            {selected.size} selected
          </span>
          <span className="font-mono text-[11px] text-ink-3">
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

      <div className="space-y-4">
        <TripSection
          label="Active trips"
          count={active.length}
          ongoingCount={ongoingCount}
          trips={active}
          selectMode={selectMode}
          selected={selected}
          onOpen={(id) => router.push(`/admin/dispatch/trips/${id}`)}
          onToggle={toggleSelected}
          emptyHint="No active trips."
        />
        {closed.length > 0 ? (
          <TripSection
            label="Closed trips"
            count={closed.length}
            trips={closed}
            selectMode={selectMode}
            selected={selected}
            onOpen={(id) => router.push(`/admin/dispatch/trips/${id}`)}
            onToggle={toggleSelected}
          />
        ) : null}
      </div>
    </div>
  );
}

function TripSection({
  label,
  count,
  ongoingCount,
  trips,
  selectMode,
  selected,
  onOpen,
  onToggle,
  emptyHint,
}: {
  label: string;
  count: number;
  /** Active trips with no end date — shown as "· N ongoing" beside the count. */
  ongoingCount?: number;
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
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg-muted">
          {label}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-fg-subtle">
          · {count}
        </span>
        {ongoingCount ? (
          <span className="rounded border border-warn/40 bg-warn-bg px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums text-warn">
            {ongoingCount} ongoing
          </span>
        ) : null}
      </div>
      {trips.length === 0 ? (
        emptyHint ? (
          <div className="rounded-md border border-line bg-card px-3 py-6 text-center font-mono text-[12px] text-ink-3 shadow-e1">
            {emptyHint}
          </div>
        ) : null
      ) : (
        <div className="space-y-2">
          {trips.map((t) => (
            <TripCard
              key={t.id}
              trip={t}
              selectMode={selectMode}
              isSel={selectMode && selected.has(t.id)}
              onOpen={onOpen}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function TripCard({
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
  const barColor =
    tone === "bad" ? "bg-bad" : tone === "warn" ? "bg-warn" : "bg-ok";
  // Clamped so a loss doesn't draw a negative bar and a >100% margin (only
  // reachable if costs land negative) doesn't overflow the track.
  const barPct =
    trip.profitPct == null ? 0 : Math.min(100, Math.max(0, trip.profitPct));

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
        "flex cursor-pointer items-stretch overflow-hidden rounded-lg border shadow-e2 transition-shadow hover:shadow-e3 active:bg-inset " +
        (isSel ? "border-bad bg-bad-bg" : "border-line-strong bg-card")
      }
    >
      {/* Selection indicator — only in delete mode. The whole card toggles, so
          this is a visual checkbox, not a separate hit target. */}
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

      {/* Content */}
      <div className="min-w-0 flex-1 p-3">
        {/* Identity — name leads, status tag holds the right edge. */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 truncate text-[15px] font-semibold leading-tight text-fg">
            {trip.name}
          </div>
          <StatusPill status={trip.status} />
        </div>

        {/* Dates + load count as chips — these are how you tell one trip from
            another at a glance, so they get a surface and weight instead of
            dissolving into faint meta text. Dates comes first (start date&
            time, or the "Jun 24 → Jul 3" range once an end is set), an amber
            "Ongoing · no end" chip follows for a trip with no end, then the
            load count. The span's duration ("9 days") sits on its own line
            beneath rather than crowding the chip row. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="rounded border border-line-strong bg-inset px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-fg shadow-e1">
            {trip.datesPrimary}
          </span>
          {trip.ongoing ? (
            <span className="rounded border border-warn/40 bg-warn-bg px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.04em] text-warn shadow-e1">
              Ongoing · no end
            </span>
          ) : null}
          <span className="rounded border border-steel/40 bg-steel-bg px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums text-steel shadow-e1">
            {trip.loads} load{trip.loads === 1 ? "" : "s"}
          </span>
        </div>
        {trip.datesDuration ? (
          <div className="mt-1 font-mono text-[10px] text-fg-subtle">
            {trip.datesDuration}
          </div>
        ) : null}

        {/* Labeled stat group — shrink-wrapped (w-fit) so Revenue · Net ·
            Margin sit tight together and read as one unit, rather than being
            strung across the card by an equal-thirds grid. */}
        <div className="mt-2 flex">
          <div className="flex w-fit items-stretch overflow-hidden rounded-md border border-line-strong bg-inset shadow-e1">
            <Stat label="Revenue" value={usd(trip.gross)} />
            <Stat label="Net" value={usd(trip.net)} tone={tone} strong divider />
            <Stat
              label="Margin"
              value={
                trip.profitPct != null ? `${Math.round(trip.profitPct)}%` : "—"
              }
              tone={tone}
              divider
            />
          </div>
        </div>

        {trip.notes ? (
          <div className="mt-2 truncate font-mono text-[11px] text-fg-subtle">
            {trip.notes}
          </div>
        ) : null}

        {/* Margin bar — the Margin percentage, drawn. */}
        <div
          aria-hidden
          className="mt-2 h-1 w-full overflow-hidden rounded-full border border-line-strong bg-inset"
        >
          <div className={"h-full " + barColor} style={{ width: `${barPct}%` }} />
        </div>
      </div>
    </div>
  );
}

/**
 * One labeled cell of the card's stat group. `strong` is the Net cell — it
 * out-weighs its neighbours on size alone (17px vs 14px), no filled box.
 * `tone` colors the value: a losing trip's Net and Margin read red.
 *
 * `divider` draws the separator as an explicit left border rather than a
 * `divide-x-*` utility on the parent — this Tailwind build emits the divide
 * COLOR but not the divide WIDTH, so divide-x silently renders nothing.
 */
function Stat({
  label,
  value,
  tone = "default",
  strong = false,
  divider = false,
}: {
  label: string;
  value: string;
  tone?: MarginTone | "default";
  strong?: boolean;
  divider?: boolean;
}) {
  const valueColor =
    tone === "ok"
      ? "text-ok"
      : tone === "warn"
        ? "text-warn"
        : tone === "bad"
          ? "text-bad"
          : "text-fg";
  return (
    <div
      className={
        "px-2.5 py-1.5 " +
        (divider ? "border-l border-line-strong" : "")
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
