import Link from "next/link";
import { KpiTile } from "@/components/tms-v2/ui/KpiTile";
import { Money } from "@/components/tms-v2/ui/Money";
import { DataList, type DataListColumn } from "@/components/tms-v2/ui/DataList";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { getAccountingKpis, listPaymentLedger, type PaymentLedgerRow } from "@/lib/data/pipeline";

const PAGE_SIZE = 25;

const COLUMNS: DataListColumn<PaymentLedgerRow>[] = [
  { key: "customer", header: "Customer", render: (p) => p.customerName },
  { key: "date", header: "Received", render: (p) => <DateTimeCST value={p.date} mode="date" /> },
  { key: "method", header: "Method", render: (p) => p.method.replace(/_/g, " "), hideOnMobile: true },
  { key: "status", header: "Status", render: (p) => p.status, hideOnMobile: true },
  { key: "amount", header: "Amount", render: (p) => <Money value={p.amount} tone="none" />, align: "right" },
];

function buildHref(page: number): string {
  return `/tms-v2/operations?tab=accounting&page=${page}`;
}

/** Customer-brokerage money only (Stripe-processed quote payments) — the
 * same domain /admin's Accounting tab tracks, distinct from carrier-load
 * Receivables (v2-design.md §22). Collected MTD and outstanding A/R are
 * real scoped aggregate queries (lib/data/pipeline.ts), not the audit's
 * confirmed 100-row-cap undercount bug (current-tms-audit.md §19). Live
 * Stripe balance/fees/payouts reconciliation is deferred — this tab reads
 * only the local `payments`/`finalized_quotes` ledger. */
export async function AccountingTab({ page }: { page: number }) {
  const [kpis, ledger] = await Promise.all([getAccountingKpis(), listPaymentLedger({ page, pageSize: PAGE_SIZE })]);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-[13px] text-fg-muted">
        {kpis.monthLabel} · customer-brokerage payments only. Full Stripe balance/payout reconciliation stays on{" "}
        <Link href="/admin/accounting" className="underline">
          /admin/accounting
        </Link>{" "}
        for now.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile label="Collected MTD" value={<Money value={kpis.collectedMtd} tone="none" />} />
        <KpiTile label="Outstanding A/R" value={<Money value={kpis.outstandingAr} tone={kpis.outstandingAr > 0 ? "negative" : "none"} />} />
        <KpiTile label="Unpaid finalized quotes" value={String(kpis.unpaidCount)} />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold text-fg">Payments ledger</h2>
        <DataList columns={COLUMNS} rows={ledger.rows} rowKey={(p) => p.id} emptyMessage="No payments recorded yet." />
        <div className="flex items-center justify-between text-[13px] text-fg-muted">
          <span>
            {ledger.totalCount} payment{ledger.totalCount === 1 ? "" : "s"} · page {page}
          </span>
          <div className="flex gap-3">
            {page > 1 ? (
              <Link href={buildHref(page - 1)} className="underline">
                ← Prev
              </Link>
            ) : null}
            {ledger.hasMore ? (
              <Link href={buildHref(page + 1)} className="underline">
                Next →
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
