import Link from "next/link";
import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { Money } from "@/components/tms-v2/ui/Money";
import { DataList, type DataListColumn } from "@/components/tms-v2/ui/DataList";
import { listBrokerDirectory, type BrokerDirectoryRow } from "@/lib/data/broker-directory";
import { BrokerStatusPill } from "./_lib/broker-status";

// Money-affecting data, read fresh every visit — matches Today's pattern.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const COLUMNS: DataListColumn<BrokerDirectoryRow>[] = [
  {
    key: "name",
    header: "Name",
    render: (b) => <span className="font-medium text-fg">{b.name}</span>,
  },
  {
    key: "status",
    header: "Status",
    // Money-is-neutral-by-default's status-pill sibling: "active" is the
    // overwhelming common case for a working broker relationship, so
    // showing it on every row said nothing — the pill now only appears
    // when a broker's status actually deviates from that default.
    render: (b) => (b.status === "active" ? null : <BrokerStatusPill status={b.status} />),
    hideOnMobile: true,
  },
  { key: "loads", header: "Loads", render: (b) => String(b.loadsCount), align: "right" },
  { key: "gross", header: "Gross", render: (b) => <Money value={b.gross} tone="none" />, align: "right" },
  { key: "ar", header: "A/R", render: (b) => <Money value={b.arOutstanding} tone={b.arOutstanding > 0 ? "negative" : "none"} />, align: "right" },
];

function buildHref(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") usp.set(k, String(v));
  }
  const qs = usp.toString();
  return qs ? `/tms-v2/brokers?${qs}` : "/tms-v2/brokers";
}

export default async function BrokersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const search = typeof sp.q === "string" ? sp.q : undefined;
  const page = typeof sp.page === "string" ? Math.max(1, Number(sp.page) || 1) : 1;

  const list = await listBrokerDirectory({ page, pageSize: PAGE_SIZE, search });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Brokers"
        description="Master directory of every broker partner — gross and A/R via the canonical, fuel-adjusted money engine. Quick-add and edit land in a later phase; this view reads live."
      />

      <form className="flex flex-wrap items-end gap-3" method="GET">
        <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
          Search
          <input
            type="text"
            name="q"
            defaultValue={search ?? ""}
            placeholder="Broker name…"
            className="h-9 w-64 rounded-md border border-line-strong bg-card px-2.5 text-[14px] text-fg"
          />
        </label>
        <button type="submit" className="h-9 rounded-md border border-line-strong bg-card px-3 text-[13px] font-medium text-fg hover:bg-elevated">
          Search
        </button>
        {search ? (
          <Link href="/tms-v2/brokers" className="text-[13px] text-fg-muted underline">
            Clear
          </Link>
        ) : null}
      </form>

      <DataList
        columns={COLUMNS}
        rows={list.rows}
        rowKey={(b) => b.id}
        getHref={(b) => `/tms-v2/brokers/${b.id}`}
        emptyMessage="No brokers match this search."
      />

      <div className="flex items-center justify-between text-[13px] text-fg-muted">
        <span>
          {list.totalCount} broker{list.totalCount === 1 ? "" : "s"} · page {page}
        </span>
        <div className="flex gap-3">
          {page > 1 ? (
            <Link href={buildHref({ q: search, page: page - 1 })} className="underline">
              ← Prev
            </Link>
          ) : null}
          {list.hasMore ? (
            <Link href={buildHref({ q: search, page: page + 1 })} className="underline">
              Next →
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
