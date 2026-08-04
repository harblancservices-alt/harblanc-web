import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { Money } from "@/components/tms-v2/ui/Money";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { StatusPill } from "@/components/tms-v2/ui/StatusPill";
import { getLoadDetail, LOAD_DOC_KIND_LABEL } from "@/lib/data/loads";
import { MoneyLine, DetailRow, SectionHeading } from "./_parts";

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

  return (
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

          {load.expenseItems.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <h3 className="text-[13px] font-medium text-fg-muted">Expense detail</h3>
              {load.expenseItems.map((e) => (
                <div key={e.id} className="flex items-center justify-between text-[13px]">
                  <span className="min-w-0 truncate text-fg">
                    {e.category ?? "Expense"}
                    {e.note ? ` — ${e.note}` : ""}
                  </span>
                  <Money value={e.amount} tone="negative" />
                </div>
              ))}
            </div>
          ) : null}

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
          {load.documents.length === 0 ? (
            <p className="text-[13px] text-fg-muted">No documents uploaded yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {load.documents.map((d) =>
                d.url ? (
                  <a
                    key={d.id}
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-[13px] text-fg hover:bg-elevated"
                  >
                    <span className="min-w-0 truncate">{d.name}</span>
                    <span className="shrink-0 text-fg-muted">{LOAD_DOC_KIND_LABEL[d.kind] ?? d.kind}</span>
                  </a>
                ) : (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-[13px] text-fg-muted"
                  >
                    <span className="min-w-0 truncate">{d.name}</span>
                    <span className="shrink-0">Unavailable</span>
                  </div>
                ),
              )}
            </div>
          )}

          <p className="text-[13px] text-fg-muted">
            This is a read-only view for now — uploading documents and status/payment actions (Mark delivered, TONU,
            edit) land in a later phase.
          </p>
        </section>
      </div>
    </div>
  );
}
