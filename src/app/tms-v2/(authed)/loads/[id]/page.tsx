import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { Money } from "@/components/tms-v2/ui/Money";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { StatusPill } from "@/components/tms-v2/ui/StatusPill";
import { getLoadDetail } from "@/lib/data/loads";
import { listBrokers } from "@/lib/data/brokers";
import { listTrips } from "@/lib/data/trips";
import { MoneyLine, DetailRow, SectionHeading } from "./_parts";
import { LoadActions } from "./LoadActions";
import { ExpensesSection } from "./ExpensesSection";
import { DocumentsSection } from "./DocumentsSection";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";

// A load's financials/documents/status can change between visits — always
// read live, request-scoped data (matches Today's and the Load Board's own
// force-dynamic choice).
export const dynamic = "force-dynamic";

export default async function LoadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const load = await getLoadDetail(id);
  if (!load) notFound();

  const { financials } = load;
  const margin = financials.gross > 0 ? (financials.net / financials.gross) * 100 : null;
  const showFactoringLine = load.brokerFactoring && !financials.isTonu;

  const [brokersPage, activeTripsPage] = await Promise.all([
    listBrokers({ pageSize: 100 }),
    listTrips({ status: "active", pageSize: 100 }),
  ]);

  return (
    <PageScroll>
    <div className="flex flex-col gap-6">
      <Link
        href="/tms-v2/loads"
        className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-fg-muted hover:text-fg"
      >
        ← Loads
      </Link>

      <PageHeader
        title={`${load.loadNumber ? `#${load.loadNumber} — ` : ""}${load.origin ?? "—"} → ${load.destination ?? "—"}`}
        description={load.brokerName ?? "No broker on file"}
        badge={<StatusPill status={load.status} domain="load" />}
        actions={
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
            brokerNames={brokersPage.rows.map((b) => b.name)}
            activeTripNames={activeTripsPage.rows.map((t) => t.name).filter((n): n is string => !!n)}
          />
        }
      />

      {/* Hero net — same focal-number pattern as Trip Detail. */}
      <div className="flex flex-col items-center gap-1 border-b border-line pb-6 text-center">
        <span className="text-[13px] font-medium text-fg-muted">Net profit</span>
        <Money value={financials.net} className="text-[40px] font-semibold leading-none" />
        {margin != null ? <span className="text-[13px] font-medium text-fg-muted">{margin.toFixed(0)}% margin</span> : null}
        {financials.isTonu ? (
          <span className="mt-1 rounded-full bg-bad-bg px-2.5 py-0.5 text-[12px] font-medium text-bad">
            TONU — flat fee, no deductions
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section className="flex flex-col gap-4">
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

          <div className="flex flex-col gap-1.5">
            <h3 className="text-[13px] font-medium text-fg-muted">Expense detail</h3>
            <ExpensesSection loadId={load.id} items={load.expenseItems} />
          </div>

          <SectionHeading>Load details</SectionHeading>
          <dl className="flex flex-col divide-y divide-line border-y border-line">
            <DetailRow label="Broker" value={load.brokerName} />
            <DetailRow label="Trip" value={load.tripName} />
            <DetailRow label="Equipment" value={load.equipment} />
            <DetailRow label="Origin" value={[load.origin, load.originZip].filter(Boolean).join(" ")} />
            <DetailRow label="Destination" value={[load.destination, load.destZip].filter(Boolean).join(" ")} />
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

          {load.brokerName ? (
            <>
              <SectionHeading>Broker</SectionHeading>
              <dl className="flex flex-col divide-y divide-line border-y border-line">
                <DetailRow label="Name" value={load.brokerName} />
                <DetailRow label="MC #" value={load.brokerMcNumber} />
                <DetailRow label="DOT #" value={load.brokerDotNumber} />
                <DetailRow label="Phone" value={load.brokerPhone} />
                <DetailRow label="Email" value={load.brokerEmail} />
                <DetailRow label="Factoring" value={load.brokerFactoring ? "Yes" : "No"} />
              </dl>
            </>
          ) : null}
        </section>

        <section className="flex flex-col gap-4">
          <SectionHeading>Odometer</SectionHeading>
          <dl className="flex flex-col divide-y divide-line border-y border-line">
            <DetailRow label="Assigned" value={load.odoAssigned != null ? `${load.odoAssigned.toLocaleString()} mi` : "—"} />
            <DetailRow label="Loaded" value={load.odoLoaded != null ? `${load.odoLoaded.toLocaleString()} mi` : "—"} />
            <DetailRow label="Delivered" value={load.odoDelivered != null ? `${load.odoDelivered.toLocaleString()} mi` : "—"} />
            <DetailRow label="Loaded miles" value={`${financials.loadedMiles.toLocaleString()} mi`} />
            <DetailRow label="Deadhead miles" value={`${financials.deadheadMiles.toLocaleString()} mi`} />
          </dl>

          <SectionHeading>Documents</SectionHeading>
          <DocumentsSection loadId={load.id} docs={load.documents} />
        </section>
      </div>
    </div>
    </PageScroll>
  );
}
