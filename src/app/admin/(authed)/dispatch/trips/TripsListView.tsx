"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
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
          <button
            type="button"
            onClick={() => setSelectMode(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-card px-3.5 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
          >
            Delete
          </button>
        </div>
      ) : null}

      {/* Delete-selection bar — only while in explicit delete mode. */}
      {selectMode ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2">
          <span className="font-mono text-[12px] font-bold text-fg">
            {selected.size} selected
          </span>
          <span className="font-mono text-[11px] text-fg-subtle">
            · tap trips to select
          </span>
          <button
            type="button"
            onClick={exitSelectMode}
            className="ml-auto rounded-md border border-line-strong bg-card px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
          >
            Cancel
          </button>
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
          <div className="rounded-md border border-line bg-card px-3 py-6 text-center font-mono text-[12px] text-fg-subtle shadow-sm">
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
        "flex cursor-pointer items-stretch overflow-hidden rounded-md border shadow-sm transition-colors active:bg-elevated " +
        (isSel ? "border-red-400 bg-red-50" : "border-line bg-card")
      }
    >
      {/* Selection indicator — only in delete mode. The whole card toggles, so
          this is a visual checkbox, not a separate hit target. */}
      {selectMode ? (
        <div
          aria-hidden
          className={
            "flex w-12 shrink-0 items-center justify-center border-r transition-colors " +
            (isSel ? "border-red-300 bg-red-100" : "border-line bg-card")
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
          <StatusPill status={trip.status} />
          <span className="font-mono text-[15px] font-bold tabular-nums text-green-700">
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
          <span className="font-bold text-green-700">Net {usd(trip.net)}</span>
          {trip.notes ? <span className="truncate">{trip.notes}</span> : null}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const closed = status === "closed";
  return (
    <span
      className={
        "inline-block rounded-sm px-1.5 py-[1px] font-mono text-[10px] font-bold uppercase tracking-[0.06em] " +
        (closed ? "bg-violet-100 text-violet-700" : "bg-green-100 text-green-700")
      }
    >
      {closed ? "Closed" : "Active"}
    </span>
  );
}

// Submit button for the bulk-delete form. useFormStatus disables it and shows
// progress while the soft-delete server action is in flight, so the delete
// can't be double-fired.
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
        `Delete ${count}`
      )}
    </button>
  );
}
