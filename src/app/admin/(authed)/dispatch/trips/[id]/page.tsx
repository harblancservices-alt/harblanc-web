import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StatusTag, type StatusTone } from "@/components/ui/StatusTag";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/admin/demo";
import { demoTripDetail } from "@/lib/demo/demoData";
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

/**
 * The page's shared card chrome — the trip cards' and load cards' surface
 * exactly (rounded-lg, strong border, e2 depth) so a trip's detail panels read
 * as the same material as the cards you tapped to get here.
 */
const CARD =
  "rounded-lg border border-line-strong bg-card p-3.5 shadow-e2";

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

    // Brokers — the name titles each linked-load card (the load board's card
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
  // The only color in the money row is data: a losing trip's Net and Profit %
  // read red instead of green.
  const earnTone = net < 0 ? "bad" : "ok";

  const dates = describeTripSpan(trip.started_at, trip.ended_at, trip.created_at);

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        {/* Capped and centred rather than filling max-w-5xl: a trip's detail is
            a fixed amount of content, and stretching it across a desktop page
            strands the stat modules against the left edge. */}
        <div className="mx-auto max-w-3xl">
          <Button
            variant="navigate"
            size="sm"
            href="/admin/dispatch/trips"
            prefetch={false}
          >
            ← All trips
          </Button>

          {/* Header */}
          <header className="mb-3 mt-3 flex flex-wrap items-start justify-between gap-3">
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
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                  {dates.primaryLabel}
                </span>
                {dates.ongoing ? (
                  <span className="rounded border border-warn/40 bg-warn-bg px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-warn">
                    Ongoing · no end
                  </span>
                ) : dates.durationLabel ? (
                  <span className="font-mono text-[11px] text-fg-subtle">
                    · {dates.durationLabel}
                  </span>
                ) : null}
              </div>
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
                startDate={toDateInputValue(trip.started_at ?? trip.created_at)}
                startTime={toTimeInputValue(trip.started_at ?? trip.created_at)}
                endDate={trip.ended_at ? toDateInputValue(trip.ended_at) : undefined}
                endTime={trip.ended_at ? toTimeInputValue(trip.ended_at) : undefined}
                hasEnd={trip.ended_at != null}
              />
            </div>
          </header>

          <div className="space-y-3">
            {/* MONEY — one grouped stat module inside a card, four equal cells
                split by hairline left borders. Net leads on size and weight
                alone: no filled tile, no accent rail. Gross reads neutral,
                Spent is money out (red), Net and Profit % are the earnings. */}
            <section className={CARD}>
              <SectionLabel>Money</SectionLabel>
              <div className="mt-2 grid grid-cols-4 overflow-hidden rounded-md border border-line-strong bg-inset shadow-e1">
                <Cell label="Gross" value={usd(gross)} />
                <Cell
                  label="Net"
                  value={usd(net)}
                  tone={earnTone}
                  strong
                  divider
                  sub={`−${usd(loadDieselTotal + pcDiesel)} diesel`}
                />
                <Cell
                  label="Spent"
                  value={usd(spent)}
                  tone="bad"
                  divider
                  sub="fuel + fees"
                />
                <Cell
                  label="Profit %"
                  value={profitPct != null ? `${Math.round(profitPct)}%` : "—"}
                  tone={earnTone}
                  divider
                  sub="net ÷ gross"
                />
              </div>
            </section>

            {/* MILES — the same grouped module, neutral throughout: mileage is
                a measurement, not money, so the figures read ink and each
                cell's diesel cost sits under it as a muted sub-figure. */}
            <section className={CARD}>
              <SectionLabel>Miles</SectionLabel>
              <div className="mt-2 grid grid-cols-4 overflow-hidden rounded-md border border-line-strong bg-inset shadow-e1">
                <Cell
                  label="Total"
                  value={`${totalMiles.toLocaleString()} mi`}
                  strong
                  sub={`${usd(loadDieselTotal + pcDiesel)} diesel`}
                />
                <Cell
                  label="Loaded"
                  value={`${loadedTotal.toLocaleString()} mi`}
                  divider
                  sub={`${usd(dieselCost(loadedTotal, fuel))} diesel`}
                />
                <Cell
                  label="Deadhead"
                  value={`${deadheadTotal.toLocaleString()} mi`}
                  divider
                  sub={`${usd(dieselCost(deadheadTotal, fuel))} diesel`}
                />
                <Cell
                  label="PC"
                  value={`${pcMiles.toLocaleString()} mi`}
                  divider
                  sub={`${usd(pcDiesel)} · in net`}
                />
              </div>
            </section>

            {/* Trip odometer bookends */}
            <form
              action={updateTripOdometer.bind(null, trip.id)}
              className={CARD}
            >
              <SectionLabel>Odometer</SectionLabel>
              <div className="mt-2 flex flex-wrap items-end gap-2.5">
                <div className="min-w-[150px] flex-1">
                  <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                    Start odometer
                  </label>
                  <input
                    name="start_odometer"
                    type="number"
                    defaultValue={trip.start_odometer ?? undefined}
                    placeholder="Leaving home"
                    className="mt-1 w-full rounded-md border border-line-strong bg-inset px-2.5 py-1.5 font-mono text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/40"
                  />
                </div>
                <div className="min-w-[150px] flex-1">
                  <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                    End odometer
                  </label>
                  <input
                    name="end_odometer"
                    type="number"
                    defaultValue={trip.end_odometer ?? undefined}
                    placeholder="Back home (closes PC)"
                    className="mt-1 w-full rounded-md border border-line-strong bg-inset px-2.5 py-1.5 font-mono text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/40"
                  />
                </div>
                <Button variant="primary" type="submit">
                  Save odometer
                </Button>
              </div>
            </form>

            {trip.notes ? (
              <section className={CARD}>
                <SectionLabel>Notes</SectionLabel>
                <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-fg">
                  {trip.notes}
                </p>
              </section>
            ) : null}
          </div>

          {/* LINKED LOADS — each rendered as the load board's card, cell for
              cell: broker + status pill, the lane, identity chips, the
              Rate · Net · Margin stat module and the margin drawn as a bar.
              The paid state sits in a footer row OUTSIDE the link so the
              Mark-paid form isn't nested inside an anchor. */}
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg-muted">
                Linked loads
              </span>
              <span className="font-mono text-[10px] tabular-nums text-fg-subtle">
                · {loads.length}
              </span>
            </div>
            {loads.length === 0 ? (
              <div className="rounded-lg border border-line-strong bg-card px-3 py-6 text-center font-mono text-[12px] text-ink-3 shadow-e1">
                No loads linked yet. Add a load and set this trip’s name on it.
              </div>
            ) : (
              <div className="space-y-2">
                {loads.map((l) => {
                  const rate = num(l.rate);
                  const lnet = netOf(l);
                  const pct = rate > 0 ? (lnet / rate) * 100 : null;
                  const tone: Tone = lnet < 0 ? "bad" : "ok";
                  const barPct =
                    pct == null ? 0 : Math.min(100, Math.max(0, pct));
                  const unpaid =
                    l.status === "delivered" && l.payment_status !== "paid";
                  const paid = l.payment_status === "paid";
                  const broker = l.broker_id
                    ? brokerName.get(l.broker_id) || ""
                    : "";
                  return (
                    <div
                      key={l.id}
                      className="overflow-hidden rounded-lg border border-line-strong bg-card shadow-e2 transition-shadow hover:shadow-e3"
                    >
                      <Link
                        href={"/admin/dispatch/loads/" + l.id}
                        prefetch={false}
                        className="block min-w-0 p-3 active:bg-inset"
                      >
                        {/* Identity — broker leads, status pill holds the
                            right edge. */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 truncate text-[15px] font-semibold leading-tight text-fg">
                            {broker || "—"}
                          </div>
                          <StatusTag tone={STATUS_TONE[l.status] ?? "slate"}>
                            {STATUS_LABEL[l.status] ??
                              l.status.replace("_", " ")}
                          </StatusTag>
                        </div>

                        {/* The lane — what the load IS, so it sits directly
                            under the name rather than among the chips. */}
                        <div className="mt-0.5 truncate text-[12.5px] text-fg-muted">
                          {l.origin ?? "—"}{" "}
                          <span className="text-fg-subtle">→</span>{" "}
                          {l.destination ?? "—"}
                        </div>

                        {/* Identity chips — steel for the load number and the
                            mileage, neutral for the delivery date. */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {l.load_number?.trim() ? (
                            <span className="rounded border border-steel/40 bg-steel-bg px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums text-steel shadow-e1">
                              #{l.load_number.trim()}
                            </span>
                          ) : null}
                          {l.delivery_date ? (
                            <span className="rounded border border-line-strong bg-inset px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-fg shadow-e1">
                              {fmtDate(l.delivery_date)}
                            </span>
                          ) : null}
                          {l.loaded_miles != null ? (
                            <span className="rounded border border-steel/40 bg-steel-bg px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums text-steel shadow-e1">
                              {l.loaded_miles.toLocaleString()} mi
                            </span>
                          ) : null}
                        </div>

                        {/* Grouped stat module — Rate · Net · Margin as equal
                            thirds of one inset panel. */}
                        <div className="mt-2 grid grid-cols-3 overflow-hidden rounded-md border border-line-strong bg-inset shadow-e1">
                          <Cell label="Rate" value={usd(rate)} />
                          <Cell
                            label="Net"
                            value={usd(lnet)}
                            tone={tone}
                            strong
                            divider
                          />
                          <Cell
                            label="Margin"
                            value={pct != null ? `${Math.round(pct)}%` : "—"}
                            tone={tone}
                            divider
                          />
                        </div>

                        {/* Margin bar — the Margin percentage, drawn. */}
                        <div
                          aria-hidden
                          className="mt-2 h-1 w-full overflow-hidden rounded-full border border-line-strong bg-inset"
                        >
                          <div
                            className={
                              "h-full " + (tone === "bad" ? "bg-bad" : "bg-ok")
                            }
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                      </Link>

                      {unpaid || paid ? (
                        <div className="flex items-center justify-end gap-2 border-t border-line bg-inset px-3 py-2">
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
        </div>
      </div>
    </div>
  );
}

/** A card's small uppercase section heading. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg-muted">
      {children}
    </div>
  );
}

type Tone = "ok" | "bad" | "default";

/**
 * One labeled cell of a grouped stat module — the trip cards' and load cards'
 * Stat, cell for cell. `strong` is the module's headline (Net, Total miles):
 * it out-weighs its neighbours on size alone, no filled box and no accent
 * edge. `sub` is an optional muted second line (the diesel figures).
 *
 * `divider` draws the separator as an explicit left border rather than a
 * `divide-x-*` utility on the parent — this Tailwind build emits the divide
 * COLOR but not the divide WIDTH, so divide-x silently renders nothing.
 */
function Cell({
  label,
  value,
  tone = "default",
  strong = false,
  divider = false,
  sub,
}: {
  label: string;
  value: string;
  tone?: Tone;
  strong?: boolean;
  divider?: boolean;
  sub?: string;
}) {
  const valueColor =
    tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : "text-fg";
  return (
    <div
      className={
        "min-w-0 px-2 py-1.5 sm:px-2.5 " +
        (divider ? "border-l border-line-strong" : "")
      }
    >
      <div className="truncate font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-fg-subtle">
        {label}
      </div>
      <div
        className={
          "mt-0.5 truncate font-bold leading-tight tabular-nums " +
          (strong
            ? "text-[15px] sm:text-[17px] "
            : "text-[13px] sm:text-[14px] ") +
          valueColor
        }
      >
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 truncate font-mono text-[9px] leading-tight text-fg-subtle sm:text-[10px]">
          {sub}
        </div>
      ) : null}
    </div>
  );
}
