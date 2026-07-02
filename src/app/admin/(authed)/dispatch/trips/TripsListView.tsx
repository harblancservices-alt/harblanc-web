"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StatusTag } from "@/components/ui/StatusTag";
import { softDeleteTrips } from "./actions";

/**
 * Trips list — standardized cards (one per trip) matching the load board /
 * broker / dashboard card conventions. The server page does the data fetch +
 * aggregation and hands the computed rows down.
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

      {/* Content */}
      <div className="min-w-0 flex-1 p-3">
        <div className="flex items-center justify-between gap-2">
          <StatusPill status={trip.status} />
          <span className="font-mono text-[15px] font-bold tabular-nums text-ok">
            {usd(trip.gross)}
          </span>
        </div>

        <div className="mt-1.5 truncate text-[14px] font-semibold text-fg">
          {trip.name}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-fg-subtle">
          <span>
            {trip.loads} load{trip.loads === 1 ? "" : "s"}
          </span>
          <span className="font-bold text-ok">Net {usd(trip.net)}</span>
          {trip.profitPct != null ? (
            <span className="font-bold text-ok">
              {Math.round(trip.profitPct)}%
            </span>
          ) : null}
          {trip.notes ? <span className="truncate">{trip.notes}</span> : null}
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
