import Link from "next/link";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/tms-v2/ui/BackButton";
import { Money } from "@/components/tms-v2/ui/Money";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { StatusPill } from "@/components/tms-v2/ui/StatusPill";
import { rpm } from "@/lib/dispatch/format";
import { formatMoney } from "@/lib/domain/money";
import { getLoadDetail } from "@/lib/data/loads";
import { listBrokers } from "@/lib/data/brokers";
import { listTrips } from "@/lib/data/trips";
import { resolveBackHref, withReturnTo } from "@/lib/nav/return-to";
import { DetailRow, CommandStat } from "./_parts";
import { LoadActionsProvider, TopBarActions, OdometerActions, EditLoadTriggerButton } from "./LoadActions";
import { FinancialsSection } from "./FinancialsSection";
import { DocumentsSection } from "./DocumentsSection";
import { DarkBarCard } from "./DarkBarCard";
import { ScrollToHash } from "./ScrollToHash";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";

// A load's financials/documents/status can change between visits — always
// read live, request-scoped data (matches Today's and the Load Board's own
// force-dynamic choice).
export const dynamic = "force-dynamic";

const JUMP_LINK = "inline-flex h-8 items-center justify-center rounded-md bg-info px-3 text-[13px] font-medium text-white shadow-e1 transition-colors hover:bg-info-hover";

/**
 * Load Detail — rebuilt to closely mirror legacy /admin's
 * dispatch/loads/[id] "almost to the T" (Brent's explicit ask, incl. a
 * follow-up pass against 3 reference screenshots of the old page):
 *
 * - Dark 3-tier command bar: a white-pill BackButton + Edit/TONU-or-Restore/
 *   Delete(red icon) on the same top row, a centered origin→destination
 *   headline with ZIPs, then a 2×2 KPI grid with a red divider bar down the
 *   center (Revenue/Net green, Total mi white, Deadhead amber — each with a
 *   grey $/mi-or-fuel-$ pill underneath).
 * - Two-column panel grid of dark-bar collapsible cards (Load details +
 *   Odometer & status on the left, Financials on the right), each header
 *   carrying its own action buttons (blue Trip/Broker/Edit, blue Edit,
 *   blue Edit + red Add expense) rather than one button row for the whole
 *   page — same split admin's page uses.
 * - Full-width Documents card, same three-kind (rate con/BOL/POD) layout.
 *
 * `DarkBarCard` (this directory) is the shared panel primitive reusing the
 * same --bar/--bar-fg tokens KpiTile's `emphasis="dark"` already uses
 * elsewhere in tms-v2. `LoadActionsProvider`/`LoadActions.tsx` is the one
 * modal/mutation controller shared by every action button on the page, even
 * though the buttons themselves now render in three different DOM spots.
 *
 * Deliberate simplification vs. admin: admin edits Load details/Odometer
 * inline (each card swaps to a form in place); this keeps tms-v2's
 * existing modal-based edit flow instead of rebuilding inline editing —
 * fields and section order match, the edit *mechanism* doesn't. Every
 * existing tms-v2 write action (mark paid/unpaid, mark delivered, TONU/
 * undo, delete, odometer, expenses, documents/signatures) is unchanged and
 * still fully wired.
 */
export default async function LoadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const backHref = resolveBackHref(sp.from, "/tms-v2/loads");
  const fromPath = `/tms-v2/loads/${id}`;
  const load = await getLoadDetail(id);
  if (!load) notFound();

  const { financials } = load;
  const totalMiles = financials.loadedMiles + financials.deadheadMiles;
  const showFactoringLine = load.brokerFactoring && !financials.isTonu;

  // $/mi, the loaded/deadhead fuel-cost split, and the factoring percent for
  // the command-bar KPIs + Financials card. Diesel cost is linear in miles
  // (dieselCost = miles/mpg × ppg) and factoring is a flat percent of gross
  // (factoring = gross × pct/100), so both splits are exact decompositions
  // of the already-computed canonical totals — not a second money
  // calculation, just reading the known-linear formulas backward.
  // The Odometer & status card's "+ Miles" column must show ONLY a real
  // odometer-to-odometer delta, never the money engine's ZIP-route estimate
  // fallback (financials.loadedMiles/deadheadMiles legitimately falls back to
  // that estimate pre-delivery for diesel/KPI math — see loadDiesel() in
  // lib/dispatch/fuel.ts). Computed separately here so the estimate can never
  // leak into this column.
  const odoDeadheadDelta =
    load.odoAssigned != null && load.odoLoaded != null && load.odoLoaded - load.odoAssigned >= 0
      ? load.odoLoaded - load.odoAssigned
      : null;
  const odoLoadedDelta =
    load.odoLoaded != null && load.odoDelivered != null && load.odoDelivered - load.odoLoaded >= 0
      ? load.odoDelivered - load.odoLoaded
      : null;

  const revenuePerMile = financials.loadedMiles > 0 ? financials.gross / financials.loadedMiles : null;
  const netPerMile = financials.loadedMiles > 0 ? financials.net / financials.loadedMiles : null;
  const dieselPerMile = totalMiles > 0 ? financials.diesel / totalMiles : 0;
  const loadedFuel = dieselPerMile * financials.loadedMiles;
  const deadheadFuel = dieselPerMile * financials.deadheadMiles;
  const factoringPct = financials.gross > 0 ? Math.round((financials.factoring / financials.gross) * 100) : 0;

  const [brokersPage, activeTripsPage] = await Promise.all([
    listBrokers({ pageSize: 100 }),
    listTrips({ status: "active", pageSize: 100 }),
  ]);

  return (
    <PageScroll>
      <ScrollToHash />
      <LoadActionsProvider
        load={{
          id: load.id,
          loadNumber: load.loadNumber,
          brokerName: load.brokerName,
          originZip: load.originZip,
          destZip: load.destZip,
          pickupDate: load.pickupDate,
          deliveryDate: load.deliveryDate,
          rate: financials.isTonu ? null : financials.gross,
          loadedMiles: financials.loadedMiles,
          tripName: load.tripName,
          status: load.status,
          paymentStatus: load.paymentStatus,
          odoAssigned: load.odoAssigned,
          odoLoaded: load.odoLoaded,
          odoDelivered: load.odoDelivered,
        }}
        brokerNames={brokersPage.rows.map((b) => b.name)}
        activeTripNames={activeTripsPage.rows.map((t) => t.name).filter((n): n is string => !!n)}
      >
        <div className="flex flex-col gap-5">
          {/* COMMAND BAR — mirrors admin's 3-tier dark bar. Condensed per
              Brent's follow-up (2026-08-08): tighter padding/gaps/type
              throughout so the whole card reads as compact, not tall —
              everything that was in it stays, just denser. */}
          <div className="overflow-hidden rounded-xl border border-line bg-bar shadow-e2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-bar-fg/10 px-3 py-2">
              <BackButton href={backHref} label="Loads" />
              <TopBarActions />
            </div>

            <div className="flex flex-col items-center gap-0.5 px-3 py-2 text-center">
              {load.loadNumber ? <div className="text-[11px] font-medium text-bar-fg/60">#{load.loadNumber}</div> : null}
              <div className="flex flex-wrap items-center justify-center gap-1.5 text-[17px] font-semibold leading-tight text-bar-fg">
                <span>{load.origin ?? "—"}</span>
                <span className="text-bar-fg/40">→</span>
                <span>{load.destination ?? "—"}</span>
              </div>
              <div className="flex flex-wrap justify-center gap-2.5 text-[11px] text-bar-fg/60">
                <span>{load.originZip ?? "—"}</span>
                <span>{load.destZip ?? "—"}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center justify-center gap-2">
                <StatusPill status={load.status} domain="load" />
                {financials.isTonu ? (
                  <span className="w-fit rounded-full bg-bad-bg px-2.5 py-0.5 text-[12px] font-medium text-bad">
                    TONU — flat fee, factoring only
                  </span>
                ) : null}
              </div>
            </div>

            {/* 2×2 KPI grid, red divider bar down the center. */}
            <div className="grid grid-cols-2">
              <CommandStat
                label="Revenue"
                value={<Money value={financials.gross} tone="positive" />}
                sub={revenuePerMile != null ? `${rpm(revenuePerMile)}/mi` : undefined}
                tone="ok"
                className="border-b border-r-2 border-b-bar-fg/10 border-r-bad"
              />
              <CommandStat
                label="Net"
                value={<Money value={financials.net} />}
                sub={netPerMile != null ? `${rpm(netPerMile)}/mi` : undefined}
                tone="ok"
                className="border-b border-b-bar-fg/10"
              />
              <CommandStat
                label="Total mi"
                value={totalMiles > 0 ? totalMiles.toLocaleString("en-US") : "—"}
                sub={totalMiles > 0 ? `${formatMoney(financials.diesel)} fuel` : undefined}
                className="border-r-2 border-r-bad"
              />
              <CommandStat
                label="Deadhead mi"
                value={financials.deadheadMiles > 0 ? financials.deadheadMiles.toLocaleString("en-US") : "—"}
                sub={financials.deadheadMiles > 0 ? `${formatMoney(deadheadFuel)} fuel` : undefined}
                tone="warn"
              />
            </div>
          </div>

          {/* TWO-COLUMN PANEL GRID — Load details + Odometer left, Financials
              right, matching admin's column split. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <DarkBarCard
                title="Load details"
                headerAction={
                  <div className="flex flex-wrap items-center gap-1.5">
                    {load.tripId ? (
                      <Link href={withReturnTo(`/tms-v2/trips/${load.tripId}`, fromPath)} className={JUMP_LINK}>
                        Trip
                      </Link>
                    ) : null}
                    {load.brokerId ? (
                      <Link href={withReturnTo(`/tms-v2/brokers/${load.brokerId}`, fromPath)} className={JUMP_LINK}>
                        Broker
                      </Link>
                    ) : null}
                    <EditLoadTriggerButton />
                  </div>
                }
              >
                <div className="flex flex-col gap-4">
                  <div>
                    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">Load</div>
                    <dl className="flex flex-col divide-y divide-line border-y border-line">
                      <DetailRow label="Load #" value={load.loadNumber} />
                      <DetailRow label="Broker" value={load.brokerName} />
                      <DetailRow label="Trip" value={load.tripName} />
                    </dl>
                  </div>
                  <div>
                    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">Schedule</div>
                    <dl className="flex flex-col divide-y divide-line border-y border-line">
                      <DetailRow label="Pickup" value={<DateTimeCST value={load.pickupDate} mode="date" />} />
                      <DetailRow label="Delivery" value={<DateTimeCST value={load.deliveryDate} mode="date" />} />
                      <DetailRow label="Mileage" value={`${totalMiles.toLocaleString("en-US")} mi`} />
                      <DetailRow label="Origin" value={[load.origin, load.originZip].filter(Boolean).join(" ")} />
                      <DetailRow label="Dest" value={[load.destination, load.destZip].filter(Boolean).join(" ")} />
                    </dl>
                  </div>
                </div>
              </DarkBarCard>

              <DarkBarCard id="odometer" title="Odometer & status" defaultOpen headerAction={<OdometerActions />}>
                <div className="flex flex-col gap-3">
                  <div className="overflow-hidden rounded-lg border border-line">
                    <table className="w-full border-collapse text-[13px]">
                      <thead>
                        <tr className="border-b border-line bg-elevated text-left text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
                          <th className="px-3 py-2">Stage</th>
                          <th className="px-3 py-2 text-right">Odometer</th>
                          <th className="px-3 py-2 text-right">+ Miles</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-line">
                          <td className="px-3 py-2 text-fg">Assigned</td>
                          <td className="px-3 py-2 text-right tabular-nums text-fg">{load.odoAssigned != null ? load.odoAssigned.toLocaleString("en-US") : "—"}</td>
                          <td className="px-3 py-2 text-right text-fg-muted">—</td>
                        </tr>
                        <tr className="border-b border-line">
                          <td className="px-3 py-2 text-fg">Loaded</td>
                          <td className="px-3 py-2 text-right tabular-nums text-fg">{load.odoLoaded != null ? load.odoLoaded.toLocaleString("en-US") : "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-warn">
                            {odoDeadheadDelta != null && odoDeadheadDelta > 0 ? `+${odoDeadheadDelta.toLocaleString("en-US")}` : "—"}
                          </td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 text-fg">Delivered</td>
                          <td className="px-3 py-2 text-right tabular-nums text-fg">{load.odoDelivered != null ? load.odoDelivered.toLocaleString("en-US") : "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-ok">
                            {odoLoadedDelta != null && odoLoadedDelta > 0 ? `+${odoLoadedDelta.toLocaleString("en-US")}` : "—"}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </DarkBarCard>
            </div>

            <FinancialsSection
              loadId={load.id}
              items={load.expenseItems}
              loadedFuel={loadedFuel}
              deadheadFuel={deadheadFuel}
              factoring={financials.factoring}
              factoringPct={factoringPct}
              net={financials.net}
              isTonu={financials.isTonu}
              showFactoringLine={showFactoringLine}
            />
          </div>

          {/* DOCUMENTS — full width, open by default. */}
          <DarkBarCard id="documents" title="Documents" defaultOpen>
            <DocumentsSection loadId={load.id} docs={load.documents} />
          </DarkBarCard>
        </div>
      </LoadActionsProvider>
    </PageScroll>
  );
}
