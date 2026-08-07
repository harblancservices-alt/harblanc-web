import Link from "next/link";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { StatusPill } from "@/components/tms-v2/ui/StatusPill";
import type { LoadDetail } from "@/lib/data/loads";
import { DetailRow, SectionHeading } from "./[id]/_parts";
import { LoadActions } from "./[id]/LoadActions";
import { FinancialsSection } from "./[id]/FinancialsSection";
import { DocumentsSection } from "./[id]/DocumentsSection";

/**
 * Load Board's context-drawer body — the same single-scroll workspace Load
 * Detail shows (Phase 5C), condensed for a 400px panel: LoadActions,
 * Financials (collapsed, "+ Add expense" one tap away), Documents (POD/BOL
 * capture including the scanner), and static details — so advancing a
 * load, logging a cost, or capturing paperwork never requires leaving the
 * board. The full /tms-v2/loads/[id] page stays reachable as a deep link
 * (Needs Attention, search results) — this isn't a replacement for it,
 * just the fast path.
 */
export function LoadDrawerContent({
  load,
  brokerNames,
  activeTripNames,
}: {
  load: LoadDetail;
  brokerNames: string[];
  activeTripNames: string[];
}) {
  const { financials } = load;
  const showFactoringLine = load.brokerFactoring && !financials.isTonu;

  return (
    <div className="flex flex-col gap-5 pt-3">
      <div className="flex items-center gap-2">
        <StatusPill status={load.status} domain="load" />
        {financials.isTonu ? (
          <span className="rounded-full bg-bad-bg px-2.5 py-0.5 text-[12px] font-medium text-bad">
            TONU — flat fee
          </span>
        ) : null}
      </div>

      <LoadActions
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
        brokerNames={brokerNames}
        activeTripNames={activeTripNames}
      />

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

      <div>
        <SectionHeading>Documents</SectionHeading>
        <DocumentsSection loadId={load.id} docs={load.documents} />
      </div>

      <div>
        <SectionHeading>Load details</SectionHeading>
        <dl className="flex flex-col divide-y divide-line border-y border-line">
          <DetailRow label="Broker" value={load.brokerName} />
          <DetailRow label="Trip" value={load.tripName} />
          <DetailRow label="Pickup" value={<DateTimeCST value={load.pickupDate} mode="date" />} />
          <DetailRow label="Delivery" value={<DateTimeCST value={load.deliveryDate} mode="date" />} />
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
      </div>

      <Link
        href={`/tms-v2/loads/${load.id}`}
        prefetch={false}
        className="text-center text-[13px] font-medium text-accent hover:underline"
      >
        Open full load detail →
      </Link>
    </div>
  );
}
