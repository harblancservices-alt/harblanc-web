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
 * Card anatomy: a health-colored accent rail, the trip name + status tag + the
 * date span / load count, then a labeled Revenue · Net · Margin stat row with
 * Net as the graphite hero tile, and a margin bar drawing the same percentage.
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
  /** Pre-formatted on the server — the loads' delivery span, else "Created …". */
  dateLabel: string;
  loads: number;
  gross: number;
  net: number;
  spent: number;
  /** net ÷ gross × 100, or null when gross is 0. */
  profitPct: number | null;
};

function usd(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
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

  return (
    <>
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
    </>
  );
}

function TripSection({
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
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg-muted">
          {label}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-fg-subtle">
          · {count}
        </span>
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
  const closed = trip.status === "closed";
  const tone = marginTone(trip.net, trip.profitPct);
  // A closed trip's rail goes slate — it's history, not something to act on.
  const edge = closed
    ? "bg-slate"
    : tone === "bad"
      ? "bg-bad"
      : tone === "warn"
        ? "bg-warn"
        : "bg-ok";
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
        "flex cursor-pointer items-stretch overflow-hidden rounded-md border shadow-e1 transition-colors active:bg-inset " +
        (isSel ? "border-bad bg-bad-bg" : "border-line bg-card")
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

      {/* Accent edge — carries the trip's health (or the selected state) as a
          full-height color rail, so a bad trip is spottable while scrolling. */}
      <span
        aria-hidden
        className={"w-[3px] shrink-0 " + (isSel ? "bg-bad" : edge)}
      />

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Identity — name leads, status tag and the date/load meta under it. */}
        <div className="flex items-start justify-between gap-2 px-3 pb-2.5 pt-2.5">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold leading-tight text-fg">
              {trip.name}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-fg-subtle">
              <span>{trip.dateLabel}</span>
              <span aria-hidden>·</span>
              <span className="font-semibold tabular-nums text-fg-muted">
                {trip.loads} load{trip.loads === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <StatusPill status={trip.status} />
        </div>

        {/* Labeled stat row — every number says what it is. Net is the focal
            graphite tile, the same hero treatment the trip detail page gives
            it, so the two pages read as one thing. */}
        <div className="grid grid-cols-3 divide-x divide-line border-t border-line">
          <Stat label="Revenue" value={usd(trip.gross)} />
          <Stat label="Net" value={usd(trip.net)} focal />
          <Stat
            label="Margin"
            value={
              trip.profitPct != null ? `${Math.round(trip.profitPct)}%` : "—"
            }
            tone={tone}
          />
        </div>

        {/* Margin bar — the same percentage as the Margin tile, drawn. */}
        <div
          aria-hidden
          className="h-1 w-full overflow-hidden border-t border-line bg-inset"
        >
          <div
            className={"h-full " + barColor}
            style={{ width: `${barPct}%` }}
          />
        </div>

        {trip.notes ? (
          <div className="truncate border-t border-line px-3 py-1.5 font-mono text-[11px] text-fg-subtle">
            {trip.notes}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One labeled cell of the card's stat row. `focal` is the graphite Net tile
 * (white value on dark, accent top edge); `tone` colors the value otherwise.
 */
function Stat({
  label,
  value,
  tone = "default",
  focal = false,
}: {
  label: string;
  value: string;
  tone?: MarginTone | "default";
  focal?: boolean;
}) {
  if (focal) {
    return (
      <div className="relative overflow-hidden bg-graphite px-3 py-2">
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[2px] bg-accent"
        />
        <div className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-on-dark-dim">
          {label}
        </div>
        <div className="mt-0.5 truncate text-[18px] font-bold leading-tight tabular-nums text-white">
          {value}
        </div>
      </div>
    );
  }
  const valueColor =
    tone === "ok"
      ? "text-ok"
      : tone === "warn"
        ? "text-warn"
        : tone === "bad"
          ? "text-bad"
          : "text-fg";
  return (
    <div className="px-3 py-2">
      <div className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-fg-subtle">
        {label}
      </div>
      <div
        className={
          "mt-0.5 truncate text-[18px] font-bold leading-tight tabular-nums " +
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
