import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { setTripStatus, updateTrip, deleteTrip, updateTripOdometer } from "../actions";
import { markLoadPaid } from "../../loads/actions";
import {
  loadDiesel,
  dieselCost,
  loadNet,
  FUEL_DEFAULTS,
  type FuelSettings,
} from "@/lib/dispatch/fuel";

export const metadata: Metadata = {
  title: "Trip",
  robots: { index: false, follow: false },
};

type Trip = {
  id: string;
  name: string;
  status: string;
  notes: string | null;
  created_at: string;
  start_odometer: number | null;
  end_odometer: number | null;
};

type LoadRow = {
  id: string;
  load_number: string | null;
  origin: string | null;
  destination: string | null;
  delivery_date: string | null;
  rate: number | string | null;
  loaded_miles: number | null;
  odo_assigned: number | null;
  odo_loaded: number | null;
  odo_delivered: number | null;
  status: string;
  payment_status: string;
};

function num(v: number | string | null): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function usd(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: iso.length <= 10 ? "UTC" : undefined,
  });
}

const GRID = "100px 96px minmax(0,1.6fr) 96px 72px 96px 92px";

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = createServiceRoleClient();
  const [{ data: trip }, { data: loadRows }, { data: fuelRow }] = await Promise.all([
    sb
      .from("trips")
      .select("id, name, status, notes, created_at, start_odometer, end_odometer")
      .eq("id", id)
      .maybeSingle<Trip>(),
    sb
      .from("loads")
      .select(
        "id, load_number, origin, destination, delivery_date, rate, loaded_miles, odo_assigned, odo_loaded, odo_delivered, status, payment_status",
      )
      .eq("trip_id", id)
      .is("deleted_at", null)
      .order("delivery_date", { ascending: true, nullsFirst: true })
      .returns<LoadRow[]>(),
    sb
      .from("dispatch_settings")
      .select("mpg, diesel_price_per_gallon, factoring_pct")
      .eq("id", true)
      .maybeSingle<{
        mpg: number | string;
        diesel_price_per_gallon: number | string;
        factoring_pct: number | string;
      }>(),
  ]);

  if (!trip) notFound();

  const fuel: FuelSettings = {
    mpg: num(fuelRow?.mpg ?? null) || FUEL_DEFAULTS.mpg,
    ppg: num(fuelRow?.diesel_price_per_gallon ?? null) || FUEL_DEFAULTS.ppg,
    factoringPct: fuelRow?.factoring_pct != null ? num(fuelRow.factoring_pct) : FUEL_DEFAULTS.factoringPct,
  };

  const loads = loadRows ?? [];

  // Manual expenses per load on this trip.
  const { data: tripExp } = await sb
    .from("load_expenses")
    .select("load_id, amount")
    .in("load_id", loads.length ? loads.map((l) => l.id) : ["00000000-0000-0000-0000-000000000000"])
    .is("deleted_at", null)
    .returns<{ load_id: string; amount: number | string }[]>();
  const expByLoad = new Map<string, number>();
  for (const e of tripExp ?? []) {
    expByLoad.set(e.load_id, (expByLoad.get(e.load_id) ?? 0) + num(e.amount));
  }

  const live = loads.filter((l) => l.status !== "cancelled");

  // Per-load deadhead + loaded + diesel, and the load's true net.
  const calc = (l: LoadRow) =>
    loadDiesel(
      {
        odoAssigned: l.odo_assigned,
        odoLoaded: l.odo_loaded,
        odoDelivered: l.odo_delivered,
        estimate: l.loaded_miles,
      },
      fuel,
    );
  const netOf = (l: LoadRow) =>
    loadNet(
      { rate: num(l.rate), diesel: calc(l).diesel, expensesTotal: expByLoad.get(l.id) ?? 0 },
      fuel,
    ).net;

  const gross = live.reduce((s, l) => s + num(l.rate), 0);
  const net = live.reduce((s, l) => s + netOf(l), 0);
  const loadedTotal = live.reduce((s, l) => s + (calc(l).loaded ?? 0), 0);
  const deadheadTotal = live.reduce((s, l) => s + (calc(l).deadhead ?? 0), 0);
  const loadDieselTotal = live.reduce((s, l) => s + calc(l).diesel, 0);

  // Personal conveyance = the empty gaps. Order loads by their assigned
  // odometer; PC is trip-start → first assigned, each delivered → next
  // assigned, and last delivered → trip-end. Only count non-negative gaps.
  const seq = loads
    .filter((l) => l.odo_assigned != null && l.odo_delivered != null)
    .sort((a, b) => (a.odo_assigned ?? 0) - (b.odo_assigned ?? 0));
  let pcMiles = 0;
  if (trip.start_odometer != null && seq.length > 0) {
    const g = (seq[0].odo_assigned ?? 0) - trip.start_odometer;
    if (g > 0) pcMiles += g;
  }
  for (let i = 1; i < seq.length; i++) {
    const g = (seq[i].odo_assigned ?? 0) - (seq[i - 1].odo_delivered ?? 0);
    if (g > 0) pcMiles += g;
  }
  if (trip.end_odometer != null && seq.length > 0) {
    const g = trip.end_odometer - (seq[seq.length - 1].odo_delivered ?? 0);
    if (g > 0) pcMiles += g;
  }
  const pcDiesel = dieselCost(pcMiles, fuel);

  const miles = loadedTotal;
  const closed = trip.status === "closed";

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <Link
            href="/admin/dispatch/trips"
            prefetch={false}
            className="inline-flex items-center font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-fg-muted transition-colors hover:text-fg"
          >
            ← All trips
          </Link>

          {/* Header */}
          <header className="mb-4 mt-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[22px] font-semibold leading-none text-fg">
                  {trip.name}
                </h1>
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
              </div>
              <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
                Created {fmtDate(trip.created_at)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <form
                action={setTripStatus.bind(
                  null,
                  trip.id,
                  closed ? "active" : "closed",
                )}
              >
                <button
                  type="submit"
                  className="rounded-md border border-line-strong bg-card px-3 py-1.5 text-[12px] font-semibold text-fg transition-colors hover:bg-elevated"
                >
                  {closed ? "Reopen trip" : "Close trip"}
                </button>
              </form>
            </div>
          </header>

          {/* KPIs */}
          <div className="grid grid-cols-2 divide-x divide-line overflow-hidden rounded-md border border-line bg-card shadow-sm lg:grid-cols-4">
            <Kpi label="Loads" value={String(live.length)} />
            <Kpi label="Gross" value={usd(gross)} tone="green" />
            <Kpi label="Net profit" value={usd(net)} tone="green" />
            <Kpi label="Loaded mi" value={miles.toLocaleString()} />
          </div>

          {/* Mileage & diesel rollup */}
          <div className="mt-3 grid grid-cols-2 divide-x divide-line overflow-hidden rounded-md border border-line bg-card shadow-sm lg:grid-cols-4">
            <MileCell
              label="Loaded"
              accent="text-green-700"
              miles={loadedTotal}
              sub={usd(dieselCost(loadedTotal, fuel)) + " diesel"}
            />
            <MileCell
              label="Deadhead"
              accent="text-amber-700"
              miles={deadheadTotal}
              sub={usd(dieselCost(deadheadTotal, fuel)) + " diesel"}
            />
            <div className="bg-blue-50 px-4 py-3">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-blue-700">
                PC bucket
              </div>
              <div className="mt-1 text-[20px] font-bold tabular-nums leading-none text-blue-700">
                {pcMiles.toLocaleString()} mi
              </div>
              <div className="mt-1 font-mono text-[10px] text-blue-700/80">
                {usd(pcDiesel)} · not in net
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                Trip net
              </div>
              <div className="mt-1 text-[20px] font-bold tabular-nums leading-none text-green-700">
                {usd(net)}
              </div>
              <div className="mt-1 font-mono text-[10px] text-fg-subtle">
                −{usd(loadDieselTotal)} diesel
              </div>
            </div>
          </div>

          {/* Trip odometer bookends */}
          <form
            action={updateTripOdometer.bind(null, trip.id)}
            className="mt-3 flex flex-wrap items-end gap-3 rounded-md border border-line bg-elevated px-3.5 py-3 shadow-sm"
          >
            <div className="flex-1 min-w-[150px]">
              <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                Start odometer
              </label>
              <input
                name="start_odometer"
                type="number"
                defaultValue={trip.start_odometer ?? undefined}
                placeholder="Leaving home"
                className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 font-mono text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
              />
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                End odometer
              </label>
              <input
                name="end_odometer"
                type="number"
                defaultValue={trip.end_odometer ?? undefined}
                placeholder="Back home (closes PC)"
                className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 font-mono text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="rounded-md border border-line-strong bg-card px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-fg transition-colors hover:bg-canvas"
            >
              Save odometer
            </button>
          </form>

          {/* Linked loads */}
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-600">
                Linked loads
              </span>
              <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
                · {loads.length}
              </span>
            </div>
            <div className="overflow-x-auto rounded-md border border-line bg-card shadow-sm">
              <div className="min-w-[680px]">
                <div
                  className="grid items-center gap-2 bg-bar px-3.5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-bar-fg"
                  style={{ gridTemplateColumns: GRID }}
                >
                  <span>Load #</span>
                  <span>Status</span>
                  <span>Route</span>
                  <span className="text-right">Rate</span>
                  <span className="text-right">Miles</span>
                  <span className="text-right">Net</span>
                  <span />
                </div>
                {loads.length === 0 ? (
                  <p className="px-3.5 py-3 font-mono text-[12px] text-fg-subtle">
                    No loads linked yet. Add a load and set this trip’s name on it.
                  </p>
                ) : (
                  loads.map((l, i) => {
                    const unpaid =
                      l.status === "delivered" && l.payment_status !== "paid";
                    return (
                      <div
                        key={l.id}
                        className={
                          "grid items-center gap-2 px-3.5 py-2 text-[12.5px] " +
                          (i === loads.length - 1 ? "" : "border-b border-line")
                        }
                        style={{ gridTemplateColumns: GRID }}
                      >
                        <span className="truncate font-mono text-fg-muted">
                          {l.load_number?.trim() || "—"}
                        </span>
                        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-fg-muted">
                          {l.status.replace("_", " ")}
                        </span>
                        <span className="truncate text-fg">
                          {l.origin ?? "—"}{" "}
                          <span className="text-fg-subtle">→</span>{" "}
                          {l.destination ?? "—"}
                        </span>
                        <span className="text-right font-bold tabular-nums text-green-700">
                          {usd(num(l.rate))}
                        </span>
                        <span className="text-right tabular-nums text-fg-muted">
                          {l.loaded_miles != null
                            ? l.loaded_miles.toLocaleString()
                            : "—"}
                        </span>
                        <span className="text-right tabular-nums text-fg">
                          {usd(netOf(l))}
                        </span>
                        <span className="flex justify-end">
                          {unpaid ? (
                            <form action={markLoadPaid.bind(null, l.id)}>
                              <button
                                type="submit"
                                className="rounded-md border border-blue-300 bg-blue-50 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-blue-700 transition-colors hover:bg-blue-100"
                              >
                                Mark paid
                              </button>
                            </form>
                          ) : l.payment_status === "paid" ? (
                            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-green-700">
                              Paid
                            </span>
                          ) : null}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Edit / notes */}
          <details className="mt-4 overflow-hidden rounded-md border border-line bg-card shadow-sm">
            <summary className="cursor-pointer list-none px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-muted transition-colors hover:text-fg">
              Edit trip details
            </summary>
            <form
              action={updateTrip.bind(null, trip.id)}
              className="border-t border-line px-4 py-4"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                    Trip name<span className="text-red-600"> *</span>
                  </label>
                  <input
                    name="name"
                    defaultValue={trip.name}
                    required
                    autoComplete="off"
                    className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg focus:border-fg focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                    Status
                  </label>
                  <select
                    name="status"
                    defaultValue={trip.status}
                    className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg focus:border-fg focus:outline-none"
                  >
                    <option value="active">Active</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>
              <label className="mt-3 block font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                Notes
              </label>
              <textarea
                name="notes"
                defaultValue={trip.notes ?? ""}
                rows={2}
                className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg focus:border-fg focus:outline-none"
              />
              <div className="mt-4 flex items-center justify-between gap-2">
                <button
                  type="submit"
                  className="rounded-md border border-blue-700 bg-blue-600 px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-blue-700"
                >
                  Save trip
                </button>
                <button
                  type="submit"
                  formAction={deleteTrip.bind(null, trip.id)}
                  className="rounded-md border border-red-300 bg-card px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-red-700 transition-colors hover:bg-red-50"
                >
                  Delete trip
                </button>
              </div>
            </form>
          </details>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "green";
}) {
  return (
    <div className="px-4 py-3">
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
        {label}
      </div>
      <div
        className={
          "mt-1 text-[22px] font-bold tabular-nums leading-none " +
          (tone === "green" ? "text-green-700" : "text-fg")
        }
      >
        {value}
      </div>
    </div>
  );
}

function MileCell({
  label,
  miles,
  sub,
  accent,
}: {
  label: string;
  miles: number;
  sub: string;
  accent: string;
}) {
  return (
    <div className="px-4 py-3">
      <div className={"font-mono text-[10px] font-semibold uppercase tracking-[0.1em] " + accent}>
        {label}
      </div>
      <div className="mt-1 text-[20px] font-bold tabular-nums leading-none text-fg">
        {miles.toLocaleString()} mi
      </div>
      <div className="mt-1 font-mono text-[10px] text-fg-subtle">{sub}</div>
    </div>
  );
}
