import Link from "next/link";
import { Money } from "@/components/tms-v2/ui/Money";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { StatusPill } from "@/components/tms-v2/ui/StatusPill";
import type { LoadDetail } from "@/lib/data/loads";
import { MoneyLine, DetailRow, SectionHeading } from "./[id]/_parts";
import { LoadActions } from "./[id]/LoadActions";

/**
 * Load Board's context-drawer body — the same money/detail shape Load
 * Detail shows, condensed for a 400px panel, plus the same LoadActions
 * client island (Edit / Mark delivered / Mark TONU / Edit odometer) so
 * advancing a load's status never requires leaving the board. The full
 * /tms-v2/loads/[id] page stays reachable as a deep link (Needs Attention,
 * search results) — this isn't a replacement for it, just the fast path.
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
          odoAssigned: load.odoAssigned,
          odoLoaded: load.odoLoaded,
          odoDelivered: load.odoDelivered,
        }}
        brokerNames={brokerNames}
        activeTripNames={activeTripNames}
      />

      <div>
        <SectionHeading>Money</SectionHeading>
        <div className="flex flex-col divide-y divide-line border-y border-line">
          <MoneyLine label="Rate" value={financials.gross} tone="none" />
          {!financials.isTonu ? (
            <>
              <MoneyLine label="Fuel" value={-financials.diesel} tone="negative" />
              {showFactoringLine ? <MoneyLine label="Factoring" value={-financials.factoring} tone="negative" /> : null}
              <MoneyLine label={`Expenses (${load.expenseItems.length})`} value={-financials.expenses} tone="negative" />
            </>
          ) : null}
          <MoneyLine label="Net" value={financials.net} bold />
        </div>
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
