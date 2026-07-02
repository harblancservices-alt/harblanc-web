import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StatusTag, type StatusTone } from "@/components/ui/StatusTag";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { setTripStatus, updateTripOdometer } from "../actions";
import { markLoadPaid } from "../../loads/actions";
import { EditTripButton } from "./EditTripButton";
import {
  loadDiesel,
  dieselCost,
  loadNet,
  FUEL_DEFAULTS,
  type FuelSettings,
} from "@/lib/dispatch/fuel";
import { computeTripFinancials } from "@/lib/dispatch/trip-rollup";

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
  broker_id: string | null;
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

// Load status pill colors / labels — same mapping as the load board cards so a
// load looks identical wherever it appears (load board, broker, dashboard).
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
        "id, load_number, broker_id, origin, destination, delivery_date, rate, loaded_miles, odo_assigned, odo_loaded, odo_delivered, status, payment_status",
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

  // Brokers that factor — only their loads incur a factoring fee.
  const { data: factoringBrokers } = await sb
    .from("brokers")
    .select("id")
    .eq("factoring", true)
    .is("deleted_at", null)
    .returns<{ id: string }[]>();
  const factoringIds = new Set((factoringBrokers ?? []).map((b) => b.id));

  // Per-load deadhead + loaded + diesel, and the load's true net — used by the
  // linked-loads list below. The trip aggregates come from the shared
  // computeTripFinancials so the card and this page agree on every number.
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
      l.broker_id != null && factoringIds.has(l.broker_id),
    ).net;

  // PC diesel is now folded into net by computeTripFinancials, so the rollup
  // takes the trip's odometer bookends and returns pcMiles / pcDiesel too.
  const fin = computeTripFinancials(loads, fuel, factoringIds, expByLoad, {
    start: trip.start_odometer,
    end: trip.end_odometer,
  });
  const gross = fin.gross;
  const net = fin.net; // all-in: minus load diesel + factoring + expenses + PC diesel
  const loadedTotal = fin.loadedMiles;
  const deadheadTotal = fin.deadheadMiles;
  const loadDieselTotal = fin.loadDieselTotal;
  const spent = fin.spent; // gross − net = load diesel + factoring + expenses + PC diesel
  const profitPct = fin.profitPct; // net ÷ gross × 100, or null when gross is 0
  const pcMiles = fin.pcMiles;
  const pcDiesel = fin.pcDiesel;

  const totalMiles = loadedTotal + deadheadTotal + pcMiles;
  const closed = trip.status === "closed";

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <Button
            variant="navigate"
            size="sm"
            href="/admin/dispatch/trips"
            prefetch={false}
          >
            ← All trips
          </Button>

          {/* Header */}
          <header className="mb-4 mt-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[22px] font-semibold leading-none text-fg">
                  {trip.name}
                </h1>
                <StatusTag tone={closed ? "slate" : "green"}>
                  {closed ? "Closed" : "Active"}
                </StatusTag>
                <span className="font-mono text-[11px] font-semibold tabular-nums text-fg-muted">
                  {fin.loads} load{fin.loads === 1 ? "" : "s"}
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
                <Button variant="cancel" type="submit" className="h-9">
                  {closed ? "Reopen trip" : "Close trip"}
                </Button>
              </form>
              <EditTripButton
                tripId={trip.id}
                name={trip.name}
                status={trip.status}
                notes={trip.notes}
              />
            </div>
          </header>

          {/* Stat grid — grouped by type for readability: every dollar figure
              in the LEFT column, every mileage figure in the RIGHT column,
              each stacked top to bottom. Values come from computeTripFinancials
              so they match the trip card. */}
          <div className="grid grid-cols-2 divide-x divide-line overflow-hidden rounded-md border border-line bg-card shadow-e2">
            {/* LEFT — money */}
            <div className="divide-y divide-line">
              <StatTile label="Gross" value={usd(gross)} tone="green" />
              <StatTile
                label="Net"
                value={usd(net)}
                tone="focal"
                sub={`−${usd(loadDieselTotal + pcDiesel)} diesel`}
              />
              <StatTile
                label="Spent"
                value={usd(spent)}
                tone="red"
                sub="diesel + factoring + expenses"
              />
              <StatTile
                label="Profit %"
                value={profitPct != null ? `${Math.round(profitPct)}%` : "—"}
                tone="green"
                sub="net ÷ gross"
              />
            </div>
            {/* RIGHT — mileage */}
            <div className="divide-y divide-line">
              <StatTile
                label="Total miles"
                value={`${totalMiles.toLocaleString()} mi`}
                sub={`${usd(loadDieselTotal + pcDiesel)} diesel`}
              />
              <StatTile
                label="Loaded"
                value={`${loadedTotal.toLocaleString()} mi`}
                accent="text-ok"
                sub={`${usd(dieselCost(loadedTotal, fuel))} diesel`}
              />
              <StatTile
                label="Deadhead"
                value={`${deadheadTotal.toLocaleString()} mi`}
                accent="text-warn"
                sub={`${usd(dieselCost(deadheadTotal, fuel))} diesel`}
              />
              <StatTile
                label="PC"
                value={`${pcMiles.toLocaleString()} mi`}
                highlight
                sub={`${usd(pcDiesel)} · in net`}
              />
            </div>
          </div>

          {/* Trip odometer bookends */}
          <form
            action={updateTripOdometer.bind(null, trip.id)}
            className="mt-3 flex flex-wrap items-end gap-3 rounded-md border border-line bg-inset px-3.5 py-3 shadow-e1"
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
                className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 font-mono text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/40"
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
                className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 font-mono text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <Button variant="primary" type="submit">
              Save odometer
            </Button>
          </form>

          {/* Linked loads */}
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-3">
                Linked loads
              </span>
              <span className="font-mono text-[11px] tabular-nums text-ink-3">
                · {loads.length}
              </span>
            </div>
            {loads.length === 0 ? (
              <div className="rounded-md border border-line bg-card px-3.5 py-3 font-mono text-[12px] text-ink-3 shadow-e1">
                No loads linked yet. Add a load and set this trip’s name on it.
              </div>
            ) : (
              <div className="space-y-2">
                {loads.map((l) => {
                  const unpaid =
                    l.status === "delivered" && l.payment_status !== "paid";
                  return (
                    <div
                      key={l.id}
                      className="flex items-stretch overflow-hidden rounded-md border border-line bg-card shadow-e1 transition-colors hover:bg-inset"
                    >
                      <Link
                        href={"/admin/dispatch/loads/" + l.id}
                        prefetch={false}
                        className="min-w-0 flex-1 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <StatusTag tone={STATUS_TONE[l.status] ?? "slate"}>
                            {STATUS_LABEL[l.status] ?? l.status.replace("_", " ")}
                          </StatusTag>
                          <span className="font-mono text-[15px] font-bold tabular-nums text-ok">
                            {usd(num(l.rate))}
                          </span>
                        </div>
                        <div className="mt-1.5 truncate text-[14px] font-semibold text-fg">
                          {l.origin ?? "—"}{" "}
                          <span className="text-fg-subtle">→</span>{" "}
                          {l.destination ?? "—"}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-fg-subtle">
                          {l.load_number?.trim() ? (
                            <span>#{l.load_number.trim()}</span>
                          ) : null}
                          {l.delivery_date ? (
                            <span>{fmtDate(l.delivery_date)}</span>
                          ) : null}
                          {l.loaded_miles != null ? (
                            <span>{l.loaded_miles.toLocaleString()} mi</span>
                          ) : null}
                          <span className="font-bold text-ok">
                            Net {usd(netOf(l))}
                          </span>
                        </div>
                      </Link>
                      {unpaid || l.payment_status === "paid" ? (
                        <div className="flex shrink-0 items-center border-l border-line px-3">
                          {unpaid ? (
                            <form action={markLoadPaid.bind(null, l.id)}>
                              <Button variant="primary" size="sm" type="submit">
                                Mark paid
                              </Button>
                            </form>
                          ) : (
                            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-ok">
                              Paid
                            </span>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {trip.notes ? (
            <div className="mt-4 rounded-md border border-line bg-card px-4 py-3 shadow-e1">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                Notes
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[13px] text-fg">
                {trip.notes}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * One stat tile used for every cell in the money / mileage grid. `tone` colors
 * the value; `accent` optionally colors the label (e.g. green Loaded, amber
 * Deadhead); `highlight` gives the PC cell its blue accent surface. The sub
 * line always renders (a non-breaking space when empty) so the four tiles in
 * each column line up row-for-row across the two columns.
 */
function StatTile({
  label,
  value,
  tone = "default",
  accent,
  sub,
  highlight = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "green" | "red" | "blue" | "amber" | "focal";
  accent?: string;
  sub?: string;
  highlight?: boolean;
}) {
  // Focal — the graphite hero tile (Net) with a 3px accent left edge.
  if (tone === "focal") {
    return (
      <div className="relative overflow-hidden bg-graphite px-4 py-3 pl-5">
        <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-accent" />
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-on-dark-dim">
          {label}
        </div>
        <div className="mt-1 text-[20px] font-bold tabular-nums leading-none text-white">
          {value}
        </div>
        <div className="mt-1 font-mono text-[10px] text-on-dark-dim">
          {sub ?? " "}
        </div>
      </div>
    );
  }
  const valueColor =
    tone === "green"
      ? "text-ok"
      : tone === "red"
        ? "text-bad"
        : tone === "blue"
          ? "text-steel"
          : tone === "amber"
            ? "text-warn"
            : "text-fg";
  const labelColor = accent ?? (highlight ? "text-steel" : "text-fg-subtle");
  const subColor = highlight ? "text-steel/80" : "text-fg-subtle";
  return (
    <div className={"px-4 py-3 " + (highlight ? "bg-steel-bg" : "")}>
      <div
        className={
          "font-mono text-[10px] font-semibold uppercase tracking-[0.1em] " +
          labelColor
        }
      >
        {label}
      </div>
      <div
        className={
          "mt-1 text-[20px] font-bold tabular-nums leading-none " + valueColor
        }
      >
        {value}
      </div>
      <div className={"mt-1 font-mono text-[10px] " + subColor}>
        {sub ?? " "}
      </div>
    </div>
  );
}
