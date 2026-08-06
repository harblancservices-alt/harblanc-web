import Link from "next/link";
import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { KpiTile } from "@/components/tms-v2/ui/KpiTile";
import { Money } from "@/components/tms-v2/ui/Money";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { DataList, type DataListColumn } from "@/components/tms-v2/ui/DataList";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import {
  getCarrierARSummary,
  listCarrierReceivables,
  AGING_BUCKETS,
  AGING_BUCKET_LABEL,
  type CarrierReceivableRow,
} from "@/lib/data/receivables";

// Money-affecting data, read fresh every visit — matches Today's pattern.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const COLUMNS: DataListColumn<CarrierReceivableRow>[] = [
  {
    key: "broker",
    header: "Broker",
    render: (r) => <span className="font-medium text-fg">{r.brokerName ?? "—"}</span>,
  },
  { key: "loadNumber", header: "Load #", render: (r) => r.loadNumber ?? "—" },
  {
    key: "lane",
    header: "Lane",
    render: (r) => `${r.origin ?? "—"} → ${r.destination ?? "—"}`,
    hideOnMobile: true,
  },
  {
    key: "delivery",
    header: "Delivered",
    render: (r) => (r.deliveryDate ? <DateTimeCST value={r.deliveryDate} mode="date" /> : "—"),
    hideOnMobile: true,
  },
  {
    key: "days",
    header: "Days out",
    render: (r) => (
      <span className={r.overdue ? "font-medium text-bad" : "text-fg"}>
        {r.bucket === "unaged" ? "—" : r.daysOutstanding}
      </span>
    ),
    align: "right",
  },
  {
    key: "amount",
    header: "Amount",
    render: (r) => <Money value={r.amount} tone={r.overdue ? "negative" : "auto"} />,
    align: "right",
  },
];

function buildHref(page: number): string {
  return page > 1 ? `/tms-v2/receivables?page=${page}` : "/tms-v2/receivables";
}

export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const page = typeof sp.page === "string" ? Math.max(1, Number(sp.page) || 1) : 1;

  const [summary, list] = await Promise.all([
    getCarrierARSummary(),
    listCarrierReceivables({ page, pageSize: PAGE_SIZE }),
  ]);

  return (
    <PageScroll
      header={
        <>
          <PageHeader
            title="Receivables"
            description="Carrier freight A/R — every delivered or TONU'd load still unpaid, aged from its delivery date via the one computeCarrierAR rule. Distinct from customer-brokerage money on Accounting. Mark-paid lands in a later phase; this view reads live."
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <KpiTile label="Outstanding" value={<Money value={summary.totalOutstanding} tone={summary.totalOutstanding > 0 ? "negative" : "none"} />} />
            {AGING_BUCKETS.map((bucket) => (
              <KpiTile
                key={bucket}
                label={AGING_BUCKET_LABEL[bucket]}
                value={<Money value={summary.bucketTotals[bucket]} tone={bucket === "90+" && summary.bucketTotals[bucket] > 0 ? "negative" : "none"} />}
                delta={`${summary.bucketCounts[bucket]} load${summary.bucketCounts[bucket] === 1 ? "" : "s"}`}
              />
            ))}
          </div>
        </>
      }
    >
      <DataList
        columns={COLUMNS}
        rows={list.rows}
        rowKey={(r) => r.loadId}
        getHref={(r) => `/tms-v2/loads/${r.loadId}`}
        emptyMessage="No outstanding carrier receivables — every delivered or TONU'd load is paid."
      />

      <div className="mt-4 flex items-center justify-between text-[13px] text-fg-muted">
        <span>
          {list.totalCount} outstanding load{list.totalCount === 1 ? "" : "s"} · page {page}
        </span>
        <div className="flex gap-3">
          {page > 1 ? (
            <Link href={buildHref(page - 1)} className="underline">
              ← Prev
            </Link>
          ) : null}
          {list.hasMore ? (
            <Link href={buildHref(page + 1)} className="underline">
              Next →
            </Link>
          ) : null}
        </div>
      </div>
    </PageScroll>
  );
}
