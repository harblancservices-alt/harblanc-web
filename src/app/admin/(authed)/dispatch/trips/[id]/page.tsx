import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StatusTag, type StatusTone } from "@/components/ui/StatusTag";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/admin/demo";
import { demoTripDetail } from "@/lib/demo/demoData";
import { setTripStatus, updateTripOdometer } from "../actions";
import { EditTripButton } from "./EditTripButton";
import { TripLoadsList, type TripLoadItem } from "./TripLoadsList";
import {
  loadDiesel,
  loadNet,
  FUEL_DEFAULTS,
  type FuelSettings,
} from "@/lib/dispatch/fuel";
import { computeTripFinancials } from "@/lib/dispatch/trip-rollup";
import {
  describeTripSpan,
  toDateInputValue,
  toTimeInputValue,
} from "@/lib/dispatch/central-time";

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
  started_at: string | null;
  ended_at: string | null;
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
// Sign goes OUTSIDE the dollar sign — a losing figure reads "-$310", not the
// "$-310" a naive "$" + n produces.
function usd(n: number): string {
  const r = Math.round(n);
  return (r < 0 ? "-$" : "$") + Math.abs(r).toLocaleString("en-US");
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
  tonu: "slate",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  assigned: "Rolling",
  loaded: "Loaded",
  delivered: "Delivered",
  tonu: "Cancelled / TONU",
};

/** Flat, calm card surface — a hairline border, no heavy chrome. */
const CARD = "rounded-xl border border-line-strong bg-card p-4 shadow-e1 sm:p-5";

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // DEMO MODE: the whole trip-detail bundle comes from the static fake dataset;
  // a non-demo id yields null → notFound(), so no real trip surfaces in demo.
  const demo = (await isDemoMode()) ? demoTripDetail(id) : null;
  if ((await isDemoMode()) && !demo) notFound();

  let trip: Trip | null;
  let loadRows: LoadRow[] | null;
  let fuelRow:
    | {
        mpg: number | string;
        diesel_price_per_gallon: number | string;
        factoring_pct: number | string;
      }
    | null;
  let tripExp: { load_id: string; amount: number | string }[] | null;
  let brokerRows:
    | { id: string; name: string | null; factoring: boolean | null }[]
    | null;

  if (demo) {
    trip = demo.trip;
    loadRows = demo.loadRows;
    fuelRow = demo.fuelRow;
    tripExp = demo.tripExp;
    brokerRows = demo.brokerRows;
  } else {
    const sb = createServiceRoleClient();
    const [tripRes, loadRes, fuelRes] = await Promise.all([
      sb
        .from("trips")
        .select(
          "id, name, status, notes, created_at, started_at, ended_at, start_odometer, end_odometer",
        )
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
    trip = tripRes.data;
    loadRows = loadRes.data;
    fuelRow = fuelRes.data;

    if (!trip) notFound();

    // Manual expenses per load on this trip.
    const loadIds = (loadRows ?? []).map((l) => l.id);
    const { data: expData } = await sb
      .from("load_expenses")
      .select("load_id, amount")
      .in("load_id", loadIds.length ? loadIds : ["00000000-0000-0000-0000-000000000000"])
      .is("deleted_at", null)
      .returns<{ load_id: string; amount: number | string }[]>();
    tripExp = expData;

    // Brokers — the name titles each linked-load row (the load board's card
    // leads with the broker), and the `factoring` flag decides which loads incur
    // a factoring fee. One read serves both.
    const { data: brokerData } = await sb
      .from("brokers")
      .select("id, name, factoring")
      .is("deleted_at", null)
      .returns<{ id: string; name: string | null; factoring: boolean | null }[]>();
    brokerRows = brokerData;
  }

  if (!trip) notFound();

  const fuel: FuelSettings = {
    mpg: num(fuelRow?.mpg ?? null) || FUEL_DEFAULTS.mpg,
    ppg: num(fuelRow?.diesel_price_per_gallon ?? null) || FUEL_DEFAULTS.ppg,
    factoringPct: fuelRow?.factoring_pct != null ? num(fuelRow.factoring_pct) : FUEL_DEFAULTS.factoringPct,
  };

  const loads = loadRows ?? [];

  const expByLoad = new Map<string, number>();
  for (const e of tripExp ?? []) {
    expByLoad.set(e.load_id, (expByLoad.get(e.load_id) ?? 0) + num(e.amount));
  }

  const factoringIds = new Set(
    (brokerRows ?? []).filter((b) => b.factoring === true).map((b) => b.id),
  );
  const brokerName = new Map(
    (brokerRows ?? []).map((b) => [b.id, (b.name ?? "").trim()]),
  );

  // Per-load diesel + true net — used by the linked-loads list below. The
  // trip aggregates come from the shared computeTripFinancials so the list
  // and this page's headline numbers always agree.
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

  // PC diesel is folded into net by computeTripFinancials, so the rollup
  // takes the trip's odometer bookends and returns pcMiles / pcDiesel too.
  const fin = computeTripFinancials(loads, fuel, factoringIds, expByLoad, {
    start: trip.start_odometer,
    end: trip.end_odometer,
  });
  const gross = fin.gross;
  const net = fin.net; // all-in: minus load diesel + factoring + expenses + PC diesel
  const loadedTotal = fin.loadedMiles;
  const deadheadTotal = fin.deadheadMiles;
  const dieselTotal = fin.loadDieselTotal + fin.pcDiesel;
  const spent = fin.spent; // gross − net = load diesel + factoring + expenses + PC diesel
  const profitPct = fin.profitPct; // net ÷ gross × 100, or null when gross is 0
  const pcMiles = fin.pcMiles;

  const totalMiles = loadedTotal + deadheadTotal + pcMiles;
  const closed = trip.status === "closed";
  const earnOk = net >= 0;
  const marginBarPct =
    profitPct == null ? 0 : Math.min(100, Math.max(0, profitPct));

  const dates = describeTripSpan(trip.started_at, trip.ended_at, trip.created_at);

  const loadItems: TripLoadItem[] = loads.map((l) => {
    const rate = num(l.rate);
    const lnet = netOf(l);
    const pct = rate > 0 ? (lnet / rate) * 100 : null;
    return {
      id: l.id,
      broker: l.broker_id ? brokerName.get(l.broker_id) || "" : "",
      origin: l.origin ?? "",
      destination: l.destination ?? "",
      loadNumber: l.load_number?.trim() || null,
      dateLabel: l.delivery_date ? fmtDate(l.delivery_date) : null,
      miles: l.loaded_miles,
      statusTone: STATUS_TONE[l.status] ?? "slate",
      statusLabel: STATUS_LABEL[l.status] ?? l.status.replace("_", " "),
      rate,
      net: lnet,
      pct,
      unpaid: l.status === "delivered" && l.payment_status !== "paid",
      paid: l.payment_status === "paid",
    };
  });

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        {/* Capped and centred rather than filling max-w-5xl: a trip's detail is
            a fixed amount of content, and stretching it across a desktop page
            strands the stat modules against the left edge. */}
        <div className="mx-auto max-w-3xl">
          <Link
            href="/admin/dispatch/trips"
            prefetch={false}
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-fg-muted transition-colors hover:text-fg"
          >
            ‹ All trips
          </Link>

          {/* Header */}
          <header className="mb-4 mt-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[24px] font-bold leading-tight tracking-tight text-fg sm:text-[28px]">
                  {trip.name}
                </h1>
                <StatusTag tone={closed ? "slate" : "green"}>
                  {closed ? "Closed" : "Active"}
                </StatusTag>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[12px] font-semibold text-fg-muted">
                  {dates.primaryLabel} · {fin.loads} load{fin.loads === 1 ? "" : "s"} · CST
                </span>
                {dates.ongoing ? (
                  <span className="rounded border border-warn/40 bg-warn-bg px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-warn">
                    Ongoing · no end
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {closed ? (
                <form action={setTripStatus.bind(null, trip.id, "active")}>
                  <Button variant="navigate" size="sm" type="submit">
                    Reopen
                  </Button>
                </form>
              ) : null}
              <EditTripButton
                tripId={trip.id}
                name={trip.name}
                status={trip.status}
                notes={trip.notes}
                startDate={toDateInputValue(trip.started_at ?? trip.created_at)}
                startTime={toTimeInputValue(trip.started_at ?? trip.created_at)}
                endDate={trip.ended_at ? toDateInputValue(trip.ended_at) : undefined}
                endTime={trip.ended_at ? toTimeInputValue(trip.ended_at) : undefined}
                hasEnd={trip.ended_at != null}
              />
            </div>
          </header>

          <div className="space-y-3">
            {/* HERO — net profit is the page's focal point: one big number,
                a margin pill, a one-line breakdown, and the margin drawn as
                a bar. Everything else on the page is supporting detail. */}
            <section className={CARD}>
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-fg-muted">
                Net profit
              </div>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-2.5">
                <span
                  className={
                    "text-[36px] font-bold leading-none tabular-nums sm:text-[44px] " +
                    (earnOk ? "text-ok" : "text-bad")
                  }
                >
                  {usd(net)}
                </span>
                {profitPct != null ? (
                  <StatusTag tone={earnOk ? "green" : "red"} hideDot>
                    {Math.round(profitPct)}% margin
                  </StatusTag>
                ) : null}
              </div>
              <div className="mt-1.5 text-[12.5px] font-medium text-fg-muted">
                of {usd(gross)} gross · after {usd(spent)} costs
              </div>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full border border-line bg-inset">
                <div
                  className={"h-full " + (earnOk ? "bg-ok" : "bg-bad")}
                  style={{ width: `${marginBarPct}%` }}
                />
              </div>
            </section>

            {/* MONEY — flat, hairline-separated columns. No nested boxes. */}
            <section className={CARD}>
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg-muted">
                Money
              </div>
              <div className="mt-2.5 flex items-stretch">
                <MoneyStat label="Gross" value={usd(gross)} />
                <MoneyStat
                  label="Spent"
                  value={usd(spent)}
                  tone="bad"
                  sub="fuel + fees"
                  divider
                />
                <MoneyStat label="Diesel" value={usd(dieselTotal)} divider />
              </div>
            </section>

            {/* MILES — de-emphasized soft card: supporting detail, not the
                headline. */}
            <section className="rounded-xl border border-line bg-inset p-4 sm:p-5">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg-muted">
                Miles
              </div>
              <div className="mt-1.5 text-[20px] font-bold tabular-nums text-fg">
                {totalMiles.toLocaleString()} mi{" "}
                <span className="text-[11px] font-mono font-semibold uppercase tracking-[0.08em] text-fg-muted">
                  total
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11.5px] font-semibold text-fg-muted">
                <span>
                  Loaded{" "}
                  <span className="text-fg">{loadedTotal.toLocaleString()}</span>
                </span>
                <span>
                  Deadhead{" "}
                  <span className="text-fg">{deadheadTotal.toLocaleString()}</span>
                </span>
                <span>
                  PC <span className="text-fg">{pcMiles.toLocaleString()}</span>
                </span>
              </div>
            </section>

            {/* Trip odometer bookends — minimal. The one strong-color action
                on the page. */}
            <form action={updateTripOdometer.bind(null, trip.id)} className={CARD}>
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg-muted">
                Odometer
              </div>
              <div className="mt-2.5 flex flex-wrap items-end gap-2.5">
                <div className="min-w-[150px] flex-1">
                  <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-muted">
                    Start
                  </label>
                  <input
                    name="start_odometer"
                    type="number"
                    defaultValue={trip.start_odometer ?? undefined}
                    placeholder="Leaving home"
                    className="mt-1 w-full rounded-md border border-line-strong bg-inset px-2.5 py-1.5 font-mono text-[13px] text-fg outline-none placeholder:text-fg-muted focus:border-accent focus:ring-2 focus:ring-accent/40"
                  />
                </div>
                <div className="min-w-[150px] flex-1">
                  <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-muted">
                    End
                  </label>
                  <input
                    name="end_odometer"
                    type="number"
                    defaultValue={trip.end_odometer ?? undefined}
                    placeholder="Back home"
                    className="mt-1 w-full rounded-md border border-line-strong bg-inset px-2.5 py-1.5 font-mono text-[13px] text-fg outline-none placeholder:text-fg-muted focus:border-accent focus:ring-2 focus:ring-accent/40"
                  />
                </div>
                <Button variant="primary" type="submit">
                  Save odometer
                </Button>
              </div>
            </form>

            {trip.notes ? (
              <section className={CARD}>
                <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg-muted">
                  Notes
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-fg">
                  {trip.notes}
                </p>
              </section>
            ) : null}
          </div>

          {/* LINKED LOADS */}
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg-muted">
                Linked loads
              </span>
              <span className="font-mono text-[10px] tabular-nums text-fg-muted">
                · {loadItems.length}
              </span>
            </div>
            {loadItems.length === 0 ? (
              <div className="rounded-xl border border-line-strong bg-card px-3 py-6 text-center font-mono text-[12px] text-fg-muted shadow-e1">
                No loads linked yet. Add a load and set this trip’s name on it.
              </div>
            ) : (
              <TripLoadsList loads={loadItems} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** One column of the flat MONEY module — a hairline left border, no box. */
function MoneyStat({
  label,
  value,
  tone,
  sub,
  divider = false,
}: {
  label: string;
  value: string;
  tone?: "bad";
  sub?: string;
  divider?: boolean;
}) {
  return (
    <div
      className={
        "min-w-0 flex-1 px-3 first:pl-0 last:pr-0 " +
        (divider ? "border-l border-line" : "")
      }
    >
      <div className="truncate font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-fg-muted">
        {label}
      </div>
      <div
        className={
          "mt-0.5 truncate text-[19px] font-bold leading-tight tabular-nums sm:text-[21px] " +
          (tone === "bad" ? "text-bad" : "text-fg")
        }
      >
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 truncate font-mono text-[10px] font-semibold text-fg-muted">
          {sub}
        </div>
      ) : null}
    </div>
  );
}
