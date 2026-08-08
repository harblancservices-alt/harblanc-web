import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/tms-v2/ui/Card";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { Money } from "@/components/tms-v2/ui/Money";
import { StatusPill } from "@/components/tms-v2/ui/StatusPill";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { BackButton } from "@/components/tms-v2/ui/BackButton";
import { getTripById } from "@/lib/data/trips";
import { getLoadById, type LoadWithFinancials } from "@/lib/data/loads";
import { formatMoney } from "@/lib/domain/money";
import { resolveBackHref, withReturnTo } from "@/lib/nav/return-to";
import { TripActions } from "./TripActions";

// Trip detail reads live, request-scoped data — always fresh, matching the
// Trips list and Today.
export const dynamic = "force-dynamic";

/** One row in the Loads(N) list — the app's load-card family (avatar-less,
 * compact: load#, lane, broker, status, rate, net), not a DataList table.
 * Brent's "Option B" layout wants this page reading as one clean card
 * stack with minimal scrolling on any device, not a desktop table plus a
 * separate mobile fallback. Tapping through carries `from` (lib/nav/
 * return-to.ts) so Load Detail's own back button returns to THIS trip,
 * not the Trips list — the bug Brent reported for the Broker/Trip jump
 * buttons applies just as much to this direction. */
function TripLoadCard({ load, fromPath }: { load: LoadWithFinancials; fromPath: string }) {
  return (
    <Link
      href={withReturnTo(`/tms-v2/loads/${load.id}`, fromPath)}
      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card p-3.5 shadow-e1 transition-shadow hover:shadow-e2"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] font-semibold text-fg">#{load.loadNumber ?? load.id.slice(0, 8)}</span>
          <StatusPill status={load.status} domain="load" />
        </div>
        <div className="mt-1 truncate text-[13px] text-fg-muted">
          {load.origin ?? "—"} → {load.destination ?? "—"}
        </div>
        <div className="mt-0.5 truncate text-[12px] text-fg-muted">{load.brokerName ?? "No broker"}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <Money value={load.financials.gross} tone="none" className="text-[13px] font-semibold" />
        <Money value={load.financials.net} className="text-[12px]" />
      </div>
    </Link>
  );
}

export default async function TripDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const backHref = resolveBackHref(sp.from, "/tms-v2/trips");
  const trip = await getTripById(id);
  if (!trip) notFound();

  const linkedLoads = (
    await Promise.all(trip.loadIds.map((loadId) => getLoadById(loadId)))
  ).filter((l): l is LoadWithFinancials => l !== null);

  const fin = trip.financials;
  const totalMiles = fin.loadedMiles + fin.deadheadMiles + fin.pcMiles;

  return (
    <PageScroll>
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <BackButton href={backHref} label="All trips" />

        {/* HEADER — name, date range, status. */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[20px] font-semibold text-fg">{trip.name ?? "Untitled trip"}</h1>
            <StatusPill status={trip.status} domain="trip" />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
            <span>
              <DateTimeCST value={trip.startedAt} mode="date" />
              {trip.endedAt ? (
                <>
                  {" → "}
                  <DateTimeCST value={trip.endedAt} mode="date" />
                </>
              ) : null}
            </span>
            {!trip.endedAt ? (
              <span className="inline-flex w-fit items-center rounded-full border border-warn/40 bg-warn-bg px-2 py-0.5 text-[11px] font-medium text-warn">
                Ongoing · no end
              </span>
            ) : null}
          </div>
        </div>

        {/* MONEY LINE — tight, directly under the header. */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[15px]">
          <span className={`font-semibold tabular-nums ${fin.net < 0 ? "text-bad" : "text-ok"}`}>Net {formatMoney(fin.net)}</span>
          <span className="text-fg-muted">·</span>
          <span className="font-medium text-fg">
            Gross <Money value={fin.gross} tone="none" className="font-medium" />
          </span>
          <span className="text-fg-muted">·</span>
          <span className="font-medium text-bad">
            Spent <Money value={fin.spent} tone="negative" className="font-medium" />
          </span>
          {fin.profitPct != null ? (
            <>
              <span className="text-fg-muted">·</span>
              <span className="font-medium text-fg-muted">{Math.round(fin.profitPct)}% margin</span>
            </>
          ) : null}
        </div>
      </div>

      {/* MILES — total/loaded/deadhead/PC, no odometer bookends shown. */}
      <Card className="flex flex-col gap-2">
        <div className="text-[12px] font-medium uppercase tracking-wide text-fg-muted">Miles</div>
        <div className="text-[22px] font-semibold tabular-nums text-fg">
          {totalMiles.toLocaleString("en-US")} <span className="text-[12px] font-medium text-fg-muted">total</span>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] font-medium text-fg-muted">
          <span>Loaded <span className="text-fg">{fin.loadedMiles.toLocaleString("en-US")}</span></span>
          <span>Deadhead <span className="text-fg">{fin.deadheadMiles.toLocaleString("en-US")}</span></span>
          <span>PC <span className="text-fg">{fin.pcMiles.toLocaleString("en-US")}</span></span>
        </div>
      </Card>

      {trip.notes ? (
        <section className="flex flex-col gap-1.5">
          <h2 className="text-[13px] font-medium uppercase tracking-wide text-fg-muted">Notes</h2>
          <p className="whitespace-pre-wrap text-[14px] text-fg">{trip.notes}</p>
        </section>
      ) : null}

      {/* LOADS — card list, not a table. */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold text-fg">Loads ({linkedLoads.length})</h2>
        {linkedLoads.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong bg-card px-4 py-8 text-center shadow-e1">
            <p className="text-[13px] text-fg-muted">No loads linked to this trip yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {linkedLoads.map((l) => (
              <TripLoadCard key={l.id} load={l} fromPath={`/tms-v2/trips/${trip.id}`} />
            ))}
          </div>
        )}
      </section>

      {/* ACTIONS — Reopen/Close, Add expense, and trip management. */}
      <TripActions
        trip={{
          id: trip.id,
          name: trip.name,
          status: trip.status,
          notes: trip.notes,
          startedAt: trip.startedAt,
          endedAt: trip.endedAt,
          startOdometer: trip.startOdometer,
          endOdometer: trip.endOdometer,
        }}
        loads={linkedLoads.map((l) => ({ id: l.id, label: `#${l.loadNumber ?? l.id.slice(0, 8)} — ${l.origin ?? "—"} → ${l.destination ?? "—"}` }))}
      />
    </div>
    </PageScroll>
  );
}
