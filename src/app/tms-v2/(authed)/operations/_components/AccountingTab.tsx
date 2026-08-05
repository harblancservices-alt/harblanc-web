import Link from "next/link";
import { KpiTile } from "@/components/tms-v2/ui/KpiTile";
import { Money } from "@/components/tms-v2/ui/Money";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { DataList, type DataListColumn } from "@/components/tms-v2/ui/DataList";
import {
  getAccountingSummary,
  listCustomerPayments,
  listCustomerOutstanding,
  type CustomerPaymentRow,
  type CustomerOutstandingRow,
} from "@/lib/data/accounting";

const PAGE_SIZE = 15;

const OUTSTANDING_STATUS_CLASS: Record<CustomerOutstandingRow["status"], string> = {
  overdue: "bg-bad-bg text-bad",
  unpaid: "bg-warn-bg text-warn",
  deposit: "bg-elevated text-fg-muted",
};

const OUTSTANDING_STATUS_LABEL: Record<CustomerOutstandingRow["status"], string> = {
  overdue: "Overdue",
  unpaid: "Unpaid",
  deposit: "Partial",
};

const OUTSTANDING_COLUMNS: DataListColumn<CustomerOutstandingRow>[] = [
  { key: "customer", header: "Customer", render: (r) => <span className="font-medium text-fg">{r.customerName}</span> },
  { key: "quote", header: "Quote #", render: (r) => (r.quoteNumber != null ? `#${r.quoteNumber}` : "—"), hideOnMobile: true },
  { key: "lane", header: "Lane", render: (r) => r.lane, hideOnMobile: true },
  {
    key: "status",
    header: "Status",
    render: (r) => (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${OUTSTANDING_STATUS_CLASS[r.status]}`}>
        {OUTSTANDING_STATUS_LABEL[r.status]}
        {r.daysOverdue != null ? ` · ${r.daysOverdue}d` : ""}
      </span>
    ),
  },
  { key: "outstanding", header: "Outstanding", render: (r) => <Money value={r.outstanding} tone="negative" />, align: "right" },
];

const PAYMENT_COLUMNS: DataListColumn<CustomerPaymentRow>[] = [
  { key: "date", header: "Date", render: (p) => (p.date ? <DateTimeCST value={p.date} mode="date" /> : "—") },
  { key: "customer", header: "Customer", render: (p) => p.customerName },
  {
    key: "method",
    header: "Method",
    render: (p) => (
      <span>
        {p.method}
        {p.isStripe ? <span className="text-fg-muted"> · Stripe</span> : null}
      </span>
    ),
    hideOnMobile: true,
  },
  { key: "amount", header: "Amount", render: (p) => <Money value={p.amount} tone="positive" />, align: "right" },
];

function buildHref(section: "payments" | "outstanding", page: number): string {
  const param = section === "payments" ? "ppage" : "opage";
  return `/tms-v2/operations?tab=accounting&${param}=${page}`;
}

/** Customer-brokerage money only — the same domain /admin's Accounting tab
 * tracks, distinct from carrier-load Receivables (v2-design.md §22). Folded
 * in from the former standalone /tms-v2/accounting page (now a redirect
 * here) — same lib/data/accounting.ts queries, same KPI/outstanding/ledger
 * layout, just scoped under this tab's opage/ppage params instead of its
 * own route. */
export async function AccountingTab({ outstandingPage, paymentsPage }: { outstandingPage: number; paymentsPage: number }) {
  const [summary, outstanding, payments] = await Promise.all([
    getAccountingSummary(),
    listCustomerOutstanding({ page: outstandingPage, pageSize: PAGE_SIZE }),
    listCustomerPayments({ page: paymentsPage, pageSize: PAGE_SIZE }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-[13px] text-fg-muted">
        Customer-brokerage money for {summary.periodLabel} — payments collected against finalized quotes, and the balance still owed. A
        separate ledger from carrier Receivables (freight owed to the owner); never merged into one number.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiTile label={`Collected · ${summary.periodLabel}`} value={<Money value={summary.collectedPeriod} tone="positive" />} />
        <KpiTile
          label="Outstanding (customer)"
          value={<Money value={summary.outstandingTotal} tone={summary.outstandingTotal > 0 ? "negative" : "none"} />}
          delta={`${summary.outstandingCount} quote${summary.outstandingCount === 1 ? "" : "s"}`}
        />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-fg">Outstanding balances</h2>
        <DataList
          columns={OUTSTANDING_COLUMNS}
          rows={outstanding.rows}
          rowKey={(r) => r.finalizedQuoteId}
          emptyMessage="No customer-brokerage balances outstanding."
        />
        <div className="flex items-center justify-between text-[13px] text-fg-muted">
          <span>
            {outstanding.totalCount} outstanding · page {outstandingPage}
          </span>
          <div className="flex gap-3">
            {outstandingPage > 1 ? (
              <Link href={buildHref("outstanding", outstandingPage - 1)} className="underline">
                ← Prev
              </Link>
            ) : null}
            {outstanding.hasMore ? (
              <Link href={buildHref("outstanding", outstandingPage + 1)} className="underline">
                Next →
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-fg">Recent payments</h2>
        <DataList columns={PAYMENT_COLUMNS} rows={payments.rows} rowKey={(p) => p.id} emptyMessage="No payments recorded yet." />
        <div className="flex items-center justify-between text-[13px] text-fg-muted">
          <span>
            {payments.totalCount} payment{payments.totalCount === 1 ? "" : "s"} · page {paymentsPage}
          </span>
          <div className="flex gap-3">
            {paymentsPage > 1 ? (
              <Link href={buildHref("payments", paymentsPage - 1)} className="underline">
                ← Prev
              </Link>
            ) : null}
            {payments.hasMore ? (
              <Link href={buildHref("payments", paymentsPage + 1)} className="underline">
                Next →
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
