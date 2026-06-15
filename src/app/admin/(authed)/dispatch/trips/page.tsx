import type { Metadata } from "next";
import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { NewTripButton } from "./NewTripButton";

export const metadata: Metadata = {
  title: "Trips",
  robots: { index: false, follow: false },
};

/**
 * Dispatch → Trips. Group loads into trips (an OTR run, out & back) and
 * track profitability. Active trips up top, closed trips below.
 */

type TripRow = {
  id: string;
  name: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};
type LoadAgg = {
  trip_id: string | null;
  rate: number | string | null;
  fuel_cost: number | string | null;
  factoring_fee: number | string | null;
  misc_cost: number | string | null;
  loaded_miles: number | null;
  status: string;
};

function num(v: number | string | null): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function usd(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const GRID = "minmax(0,1.6fr) 110px 70px 90px 130px minmax(0,1fr)";

export default async function TripsPage() {
  const sb = createServiceRoleClient();
  const [{ data: tripRows }, { data: loadRows }] = await Promise.all([
    sb
      .from("trips")
      .select("id, name, status, notes, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .returns<TripRow[]>(),
    sb
      .from("loads")
      .select("trip_id, rate, fuel_cost, factoring_fee, misc_cost, loaded_miles, status")
      .is("deleted_at", null)
      .not("trip_id", "is", null)
      .returns<LoadAgg[]>(),
  ]);

  const agg = new Map<
    string,
    { loads: number; gross: number; net: number; miles: number }
  >();
  for (const l of loadRows ?? []) {
    if (!l.trip_id) continue;
    const a = agg.get(l.trip_id) ?? { loads: 0, gross: 0, net: 0, miles: 0 };
    a.loads += 1;
    if (l.status !== "cancelled") {
      a.gross += num(l.rate);
      a.net +=
        num(l.rate) - num(l.fuel_cost) - num(l.factoring_fee) - num(l.misc_cost);
      a.miles += l.loaded_miles ?? 0;
    }
    agg.set(l.trip_id, a);
  }

  const trips = (tripRows ?? []).map((t) => ({
    id: t.id,
    name: t.name?.trim() || "Untitled trip",
    status: t.status,
    notes: t.notes?.trim() || null,
    created: fmtDate(t.created_at),
    ...(agg.get(t.id) ?? { loads: 0, gross: 0, net: 0, miles: 0 }),
  }));

  const active = trips.filter((t) => t.status !== "closed");
  const closed = trips.filter((t) => t.status === "closed");

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-indigo-600">
              Dispatch
            </p>
            <h1 className="mt-1 text-[22px] font-semibold leading-none tracking-tight text-fg">
              Trips
            </h1>
            <p className="mt-1.5 text-[13px] text-fg-muted">
              Group loads into trips and track performance.
            </p>
          </div>
          <NewTripButton />
        </header>

        {trips.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-card px-4 py-10 text-center font-mono text-[12px] text-fg-subtle">
            No trips yet — hit “New Trip”, or just type a trip name when adding a
            load and it’ll appear here.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-line bg-card shadow-md">
            <div
              className="grid items-center gap-2 bg-bar px-3.5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-bar-fg"
              style={{ gridTemplateColumns: GRID }}
            >
              <span>Trip name</span>
              <span>Status</span>
              <span className="text-right">Loads</span>
              <span className="text-right">Gross</span>
              <span className="text-right">Net profit</span>
              <span>Notes</span>
            </div>

            <SectionLabel label="All trips" count={`${trips.length} trips`} />
            {active.map((t) => (
              <TripRowItem key={t.id} trip={t} />
            ))}

            {closed.length > 0 ? (
              <>
                <SectionLabel label="Closed trips" />
                {closed.map((t) => (
                  <TripRowItem key={t.id} trip={t} />
                ))}
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
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
}: {
  trip: {
    id: string;
    name: string;
    status: string;
    notes: string | null;
    loads: number;
    gross: number;
    net: number;
  };
}) {
  return (
    <Link
      href={`/admin/dispatch/trips/${trip.id}`}
      prefetch={false}
      className="grid items-center gap-2 border-b border-line px-3.5 py-2.5 text-[13px] transition-colors last:border-b-0 hover:bg-elevated"
      style={{ gridTemplateColumns: GRID }}
    >
      <span className="truncate font-semibold text-fg">{trip.name}</span>
      <span>
        <StatusPill status={trip.status} />
      </span>
      <span className="text-right tabular-nums text-fg-muted">{trip.loads}</span>
      <span className="text-right font-semibold tabular-nums text-green-700">
        {usd(trip.gross)}
      </span>
      <span className="text-right font-bold tabular-nums text-green-700">
        {usd(trip.net)}
      </span>
      <span className="truncate text-fg-subtle">{trip.notes ?? "—"}</span>
    </Link>
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
