import Link from "next/link";
import { notFound } from "next/navigation";
import { Money } from "@/components/tms-v2/ui/Money";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { StatusPill } from "@/components/tms-v2/ui/StatusPill";
import { rpm } from "@/lib/dispatch/format";
import { formatMoney } from "@/lib/domain/money";
import { getLoadDetail } from "@/lib/data/loads";
import { listBrokers } from "@/lib/data/brokers";
import { listTrips } from "@/lib/data/trips";
import { DetailRow, CommandStat } from "./_parts";
import { LoadActions } from "./LoadActions";
import { FinancialsSection } from "./FinancialsSection";
import { DocumentsSection } from "./DocumentsSection";
import { DarkBarCard } from "./DarkBarCard";
import { ScrollToHash } from "./ScrollToHash";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";

// A load's financials/documents/status can change between visits — always
// read live, request-scoped data (matches Today's and the Load Board's own
// force-dynamic choice).
export const dynamic = "force-dynamic";

/**
 * Load Detail — rebuilt to closely mirror legacy /admin's
 * dispatch/loads/[id] (Brent's explicit ask: same IA "almost to the T").
 * Structure ported 1:1 from admin: a dark command bar (back/actions, a
 * centered origin→destination headline, a 2×4 $-and-$/mi KPI strip), then
 * a two-column grid of dark-bar collapsible panels (Load details +
 * Odometer & status on the left, Financials on the right — Financials
 * closed by default, the other two open), then a full-width Documents
 * panel. `DarkBarCard` (this directory) is the shared panel primitive that
 * makes the three headers line up, reusing the same --bar/--bar-fg tokens
 * KpiTile's `emphasis="dark"` already uses elsewhere in tms-v2.
 *
 * Deliberate simplification vs. admin: admin edits Load details/Odometer
 * inline (each card swaps to a form in place); this keeps tms-v2's
 * existing modal-based edit flow (LoadActions) instead of rebuilding
 * inline editing — the fields and section order match, the edit
 * *mechanism* doesn't. Every tms-v2 write action (mark paid/unpaid, mark
 * delivered, TONU/undo, delete, odometer, expenses, documents/signatures)
 * is unchanged and still reachable, grouped in one action row rather than
 * split per-card the way admin's page does.
 */
export default async function LoadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const load = await getLoadDetail(id);
  if (!load) notFound();

  const { financials } = load;
  const totalMiles = financials.loadedMiles + financials.deadheadMiles;
  const showFactoringLine = load.brokerFactoring && !financials.isTonu;

  // $/mi and the loaded/deadhead fuel-cost split for the KPI strip, mirroring
  // admin's command-bar tiles. Diesel cost is linear in miles (dieselCost =
  // miles/mpg × ppg), so splitting the already-computed total proportionally
  // by each segment's mile share reconstructs the exact split — not a second
  // money calculation, just decomposing the one canonical total.
  const revenuePerMile = financials.loadedMiles > 0 ? financials.gross / financials.loadedMiles : null;
  const netPerMile = financials.loadedMiles > 0 ? financials.net / financials.loadedMiles : null;
  const dieselPerMile = totalMiles > 0 ? financials.diesel / totalMiles : 0;
  const deadheadFuel = dieselPerMile * financials.deadheadMiles;

  const [brokersPage, activeTripsPage] = await Promise.all([
    listBrokers({ pageSize: 100 }),
    listTrips({ status: "active", pageSize: 100 }),
  ]);

  const loadActionsProps = {
    load: {
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
    },
    brokerNames: brokersPage.rows.map((b) => b.name),
    activeTripNames: activeTripsPage.rows.map((t) => t.name).filter((n): n is string => !!n),
  };

  return (
    <PageScroll>
      <ScrollToHash />
      <div className="flex flex-col gap-5">
        <Link
          href="/tms-v2/loads"
          className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-fg-muted hover:text-fg"
        >
          ← Loads
        </Link>

        {/* COMMAND BAR — mirrors admin's 3-tier dark bar: actions, centered
            lane, $-and-$/mi KPI strip. */}
        <div className="overflow-hidden rounded-xl border border-line bg-bar shadow-e2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-bar-fg/10 px-4 py-3">
            <StatusPill status={load.status} domain="load" />
            <LoadActions {...loadActionsProps} />
          </div>

          <div className="flex flex-col items-center gap-1 px-4 py-4 text-center">
            {load.loadNumber ? <div className="text-[12px] font-medium text-bar-fg/60">#{load.loadNumber}</div> : null}
            <div className="flex flex-wrap items-center justify-center gap-2 text-[20px] font-semibold text-bar-fg">
              <span>{load.origin ?? "—"}</span>
              <span className="text-bar-fg/40">→</span>
              <span>{load.destination ?? "—"}</span>
            </div>
            <div className="flex flex-wrap justify-center gap-3 text-[12px] text-bar-fg/60">
              <span>{load.originZip ?? "—"}</span>
              <span>{load.destZip ?? "—"}</span>
            </div>
            {financials.isTonu ? (
              <span className="mt-1 w-fit rounded-full bg-bad-bg px-2.5 py-0.5 text-[12px] font-medium text-bad">
                TONU — flat fee, no deductions
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
            <CommandStat label="Revenue" value={<Money value={financials.gross} tone="none" />} sub={revenuePerMile != null ? `${rpm(revenuePerMile)}/mi` : undefined} />
            <CommandStat label="Net" value={<Money value={financials.net} />} sub={netPerMile != null ? `${rpm(netPerMile)}/mi` : undefined} accent />
            <CommandStat label="Total mi" value={totalMiles.toLocaleString("en-US")} sub={totalMiles > 0 ? `${formatMoney(financials.diesel)} fuel` : undefined} />
            <CommandStat label="Deadhead mi" value={financials.deadheadMiles.toLocaleString("en-US")} sub={financials.deadheadMiles > 0 ? `${formatMoney(deadheadFuel)} fuel` : undefined} />
          </div>
        </div>

        {/* TWO-COLUMN PANEL GRID — Load details + Odometer left, Financials
            right, matching admin's column split. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <DarkBarCard title="Load details" defaultOpen>
              <div className="flex flex-col gap-4">
                <dl className="flex flex-col divide-y divide-line border-y border-line">
                  <DetailRow label="Load #" value={load.loadNumber} />
                  <DetailRow label="Broker" value={load.brokerName} />
                  <DetailRow label="Trip" value={load.tripName} />
                  <DetailRow
                    label="Payment"
                    value={
                      load.paymentStatus === "paid" ? (
                        <>
                          Paid{load.paidAt ? <> · <DateTimeCST value={load.paidAt} mode="date" /></> : null}
                        </>
                      ) : (
                        "Unpaid"
                      )
                    }
                  />
                </dl>
                <dl className="flex flex-col divide-y divide-line border-y border-line">
                  <DetailRow label="Pickup" value={<DateTimeCST value={load.pickupDate} mode="date" />} />
                  <DetailRow label="Delivery" value={<DateTimeCST value={load.deliveryDate} mode="date" />} />
                  <DetailRow label="Mileage" value={`${totalMiles.toLocaleString("en-US")} mi`} />
                  <DetailRow label="Origin" value={[load.origin, load.originZip].filter(Boolean).join(" ")} />
                  <DetailRow label="Dest" value={[load.destination, load.destZip].filter(Boolean).join(" ")} />
                  <DetailRow label="Equipment" value={load.equipment} />
                </dl>
                {load.brokerName ? (
                  <dl className="flex flex-col divide-y divide-line border-y border-line">
                    <DetailRow label="Broker MC #" value={load.brokerMcNumber} />
                    <DetailRow label="Broker DOT #" value={load.brokerDotNumber} />
                    <DetailRow label="Broker phone" value={load.brokerPhone} />
                    <DetailRow label="Broker email" value={load.brokerEmail} />
                    <DetailRow label="Factoring" value={load.brokerFactoring ? "Yes" : "No"} />
                  </dl>
                ) : null}
              </div>
            </DarkBarCard>

            <DarkBarCard id="odometer" title="Odometer & status" defaultOpen>
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
                          {financials.deadheadMiles > 0 ? `+${financials.deadheadMiles.toLocaleString("en-US")}` : "—"}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 text-fg">Delivered</td>
                        <td className="px-3 py-2 text-right tabular-nums text-fg">{load.odoDelivered != null ? load.odoDelivered.toLocaleString("en-US") : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-ok">
                          {financials.loadedMiles > 0 ? `+${financials.loadedMiles.toLocaleString("en-US")}` : "—"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[12px] text-fg-muted">
                  Status is derived from these readings — use &quot;Edit odometer&quot; or &quot;Mark delivered&quot; above, never a separate status field.
                </p>
              </div>
            </DarkBarCard>
          </div>

          <FinancialsSection
            loadId={load.id}
            items={load.expenseItems}
            gross={financials.gross}
            diesel={financials.diesel}
            factoring={financials.factoring}
            expenses={financials.expenses}
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
    </PageScroll>
  );
}
