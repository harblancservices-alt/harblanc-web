"use client";

import Link from "next/link";
import { useState } from "react";
import { softDeleteTrips } from "./actions";

/**
 * Trips list with quotes-style multi-select delete. The server page does the
 * data fetch + aggregation and hands the computed rows down; selection state
 * and the bulk soft-delete live here.
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

const GRID = "30px minmax(0,1.6fr) 110px 70px 90px 130px minmax(0,1fr)";

function usd(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

export function TripsListTable({ trips }: { trips: TripListItem[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleSelected(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const active = trips.filter((t) => t.status !== "closed");
  const closed = trips.filter((t) => t.status === "closed");
  const allChecked = trips.length > 0 && selected.size === trips.length;

  return (
    <>
      {selected.size > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-3 rounded-md border border-line bg-elevated px-3 py-2">
          <span className="font-mono text-[12px] font-bold text-fg">
            {selected.size} selected
          </span>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted hover:text-fg"
          >
            Clear
          </button>
          <form
            action={softDeleteTrips}
            onSubmit={(e) => {
              if (
                !window.confirm(
                  `Delete ${selected.size} trip${selected.size === 1 ? "" : "s"}? They move to trash and can be restored for 30 days.`,
                )
              ) {
                e.preventDefault();
              } else {
                setSelected(new Set());
              }
            }}
            className="ml-auto"
          >
            {[...selected].map((id) => (
              <input key={id} type="hidden" name="ids" value={id} />
            ))}
            <button
              type="submit"
              className="rounded-md border-2 border-red-700 bg-red-600 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-white hover:bg-red-700"
            >
              Delete {selected.size}
            </button>
          </form>
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-line bg-card shadow-md">
        <div
          className="grid items-center gap-2 bg-bar px-3.5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-bar-fg"
          style={{ gridTemplateColumns: GRID }}
        >
          <span className="flex items-center">
            <input
              type="checkbox"
              aria-label="Select all trips"
              checked={allChecked}
              ref={(el) => {
                if (el)
                  el.indeterminate =
                    selected.size > 0 && selected.size < trips.length;
              }}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? new Set(trips.map((t) => t.id))
                    : new Set(),
                )
              }
              className="h-3.5 w-3.5 cursor-pointer accent-red-600"
            />
          </span>
          <span>Trip name</span>
          <span>Status</span>
          <span className="text-right">Loads</span>
          <span className="text-right">Gross</span>
          <span className="text-right">Net profit</span>
          <span>Notes</span>
        </div>

        <SectionLabel label="All trips" count={`${trips.length} trips`} />
        {active.map((t) => (
          <TripRowItem
            key={t.id}
            trip={t}
            checked={selected.has(t.id)}
            onToggle={() => toggleSelected(t.id)}
          />
        ))}

        {closed.length > 0 ? (
          <>
            <SectionLabel label="Closed trips" />
            {closed.map((t) => (
              <TripRowItem
                key={t.id}
                trip={t}
                checked={selected.has(t.id)}
                onToggle={() => toggleSelected(t.id)}
              />
            ))}
          </>
        ) : null}
      </div>
    </>
  );
}

function SectionLabel({ label, count }: { label: string; count?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line bg-elevated px-3.5 py-1.5">
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg-muted">
        {label}
      </span>
      {count ? (
        <span className="font-mono text-[10px] tabular-nums text-fg-subtle">
          {count}
        </span>
      ) : null}
    </div>
  );
}

function TripRowItem({
  trip,
  checked,
  onToggle,
}: {
  trip: TripListItem;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="grid items-center gap-2 border-b border-line px-3.5 py-2.5 text-[13px] transition-colors last:border-b-0 hover:bg-elevated"
      style={{ gridTemplateColumns: GRID }}
    >
      <span className="flex items-center">
        <input
          type="checkbox"
          aria-label={`Select ${trip.name}`}
          checked={checked}
          onChange={onToggle}
          className="h-3.5 w-3.5 cursor-pointer accent-red-600"
        />
      </span>
      <Link
        href={`/admin/dispatch/trips/${trip.id}`}
        prefetch={false}
        className="contents"
      >
        <span className="truncate font-semibold text-fg">{trip.name}</span>
        <span>
          <StatusPill status={trip.status} />
        </span>
        <span className="text-right tabular-nums text-fg-muted">
          {trip.loads}
        </span>
        <span className="text-right font-semibold tabular-nums text-green-700">
          {usd(trip.gross)}
        </span>
        <span className="text-right font-bold tabular-nums text-green-700">
          {usd(trip.net)}
        </span>
        <span className="truncate text-fg-subtle">{trip.notes ?? "—"}</span>
      </Link>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const closed = status === "closed";
  return (
    <span
      className={
        "rounded px-2 py-[2px] font-mono text-[10px] font-bold uppercase tracking-[0.06em] " +
        (closed
          ? "bg-violet-100 text-violet-700"
          : "bg-green-100 text-green-700")
      }
    >
      {closed ? "Closed" : "Active"}
    </span>
  );
}
