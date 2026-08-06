import Link from "next/link";
import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { KpiTile } from "@/components/tms-v2/ui/KpiTile";
import { Money } from "@/components/tms-v2/ui/Money";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { StatusPill } from "@/components/tms-v2/ui/StatusPill";
import { DataList, type DataListColumn } from "@/components/tms-v2/ui/DataList";
import { ContextDrawer } from "@/components/tms-v2/ui/ContextDrawer";
import { listLoads, getLoadBoardSummary, getLoadDetail, type LoadWithFinancials, type LoadStatus } from "@/lib/data/loads";
import { listBrokers } from "@/lib/data/brokers";
import { listTrips } from "@/lib/data/trips";
import { currentPeriod, type Period } from "@/lib/domain/attribution";
import { DEFAULT_PAGE_SIZE } from "@/lib/data/pagination";
import { formatMoney } from "@/lib/domain/money";
import { LoadBoardFilters } from "./LoadBoardFilters";
import { AddLoadButton } from "./AddLoadButton";
import { LoadDrawerContent } from "./LoadDrawerContent";

// Loads change status/payment throughout the day — the board always reads
// live, request-scoped data (matches Today's own force-dynamic choice).
export const dynamic = "force-dynamic";

const STATUS_OPTIONS: { value: LoadStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "assigned", label: "Assigned" },
  { value: "loaded", label: "Loaded" },
  { value: "delivered", label: "Delivered" },
  { value: "tonu", label: "TONU" },
];

const LOAD_COLUMNS: DataListColumn<LoadWithFinancials>[] = [
  { key: "number", header: "#", render: (l) => l.loadNumber ?? l.id.slice(0, 8) },
  { key: "broker", header: "Broker", render: (l) => l.brokerName ?? "—" },
  {
    key: "lane",
    header: "Lane",
    render: (l) => `${l.origin ?? "—"} → ${l.destination ?? "—"}`,
    hideOnMobile: true,
  },
  { key: "pickup", header: "Pickup", render: (l) => <DateTimeCST value={l.pickupDate} mode="date" /> },
  { key: "status", header: "Status", render: (l) => <StatusPill status={l.status} domain="load" /> },
  { key: "rate", header: "Rate", render: (l) => <Money value={l.financials.gross} tone="none" />, align: "right" },
  { key: "net", header: "Net", render: (l) => <Money value={l.financials.net} />, align: "right" },
];

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function parsePeriod(sp: SearchParams): Period {
  const y = Number(first(sp.year));
  const m = Number(first(sp.month));
  if (Number.isFinite(y) && Number.isFinite(m) && m >= 0 && m <= 11) return { year: y, month: m };
  return currentPeriod();
}

function shiftPeriod(period: Period, delta: number): Period {
  const total = period.year * 12 + period.month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

export default async function LoadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const period = parsePeriod(sp);
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const status = first(sp.status) as LoadStatus | undefined;
  const brokerId = first(sp.brokerId) || undefined;
  const selectedId = first(sp.id);

  const [summary, listResult, brokersPage, activeTripsPage, selectedLoad] = await Promise.all([
    getLoadBoardSummary(period),
    listLoads({ period, page, pageSize: DEFAULT_PAGE_SIZE, status, brokerId }),
    listBrokers({ pageSize: 100 }),
    listTrips({ status: "active", pageSize: 100 }),
    selectedId ? getLoadDetail(selectedId) : Promise.resolve(null),
  ]);
  const brokerNames = brokersPage.rows.map((b) => b.name);
  const activeTripNames = activeTripsPage.rows.map((t) => t.name).filter((n): n is string => !!n);

  const baseParams = new URLSearchParams();
  if (status) baseParams.set("status", status);
  if (brokerId) baseParams.set("brokerId", brokerId);

  function periodHref(p: Period): string {
    const params = new URLSearchParams(baseParams);
    params.set("year", String(p.year));
    params.set("month", String(p.month));
    return `/tms-v2/loads?${params.toString()}`;
  }

  function pageHref(p: number): string {
    const params = new URLSearchParams(baseParams);
    params.set("year", String(period.year));
    params.set("month", String(period.month));
    params.set("page", String(p));
    return `/tms-v2/loads?${params.toString()}`;
  }

  // Row selection stays in the URL (same discipline as period/status/page)
  // rather than client state, so a selected load's context drawer is a real,
  // shareable/back-button-friendly location, not ephemeral UI state.
  function rowHref(loadId: string): string {
    const params = new URLSearchParams(baseParams);
    params.set("year", String(period.year));
    params.set("month", String(period.month));
    if (page > 1) params.set("page", String(page));
    params.set("id", loadId);
    return `/tms-v2/loads?${params.toString()}`;
  }

  const closeHref = (() => {
    const params = new URLSearchParams(baseParams);
    params.set("year", String(period.year));
    params.set("month", String(period.month));
    if (page > 1) params.set("page", String(page));
    return `/tms-v2/loads?${params.toString()}`;
  })();

  return (
    <div className="flex items-start gap-6">
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      <PageHeader
        title="Loads"
        description="Every load booked this period, server-paginated and searchable by status or broker."
        actions={
          <div className="flex items-center gap-2 text-[13px] font-medium text-fg">
            <AddLoadButton
              brokerNames={brokerNames}
              activeTripNames={activeTripNames}
            />
            <Link
              href={periodHref(shiftPeriod(period, -1))}
              aria-label="Previous month"
              className="rounded-md border border-line-strong px-2.5 py-1.5 hover:bg-elevated"
            >
              ←
            </Link>
            <span className="min-w-[110px] text-center tabular-nums">{summary.periodLabel}</span>
            <Link
              href={periodHref(shiftPeriod(period, 1))}
              aria-label="Next month"
              className="rounded-md border border-line-strong px-2.5 py-1.5 hover:bg-elevated"
            >
              →
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiTile label="Gross" value={<Money value={summary.gross} tone="none" />} />
        <KpiTile label="Net" value={formatMoney(summary.net)} emphasis="dark" />
        <KpiTile label="Loads" value={String(summary.loadsCount)} />
        <KpiTile label="$/mi" value={summary.ratePerMile != null ? `$${summary.ratePerMile.toFixed(2)}` : "—"} />
        <KpiTile
          label="Deadhead"
          value={summary.deadheadPct != null ? `${summary.deadheadPct.toFixed(1)}%` : "—"}
        />
        <KpiTile label="A/R" value={<Money value={summary.arOutstanding} tone="none" />} />
      </div>

      <LoadBoardFilters
        statusOptions={STATUS_OPTIONS}
        brokers={brokersPage.rows.map((b) => ({ id: b.id, name: b.name }))}
        status={status}
        brokerId={brokerId}
      />

      <DataList
        columns={LOAD_COLUMNS}
        rows={listResult.rows}
        rowKey={(l) => l.id}
        getHref={(l) => rowHref(l.id)}
        emptyMessage="No loads match this period and filters."
      />

      <div className="flex items-center justify-between text-[13px] text-fg-muted">
        <span>
          Page {page} · {listResult.totalCount} load{listResult.totalCount === 1 ? "" : "s"} this period
        </span>
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link
              href={pageHref(page - 1)}
              className="rounded-md border border-line-strong px-3 py-1.5 font-medium text-fg hover:bg-elevated"
            >
              Previous
            </Link>
          ) : null}
          {listResult.hasMore ? (
            <Link
              href={pageHref(page + 1)}
              className="rounded-md border border-line-strong px-3 py-1.5 font-medium text-fg hover:bg-elevated"
            >
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </div>

    {selectedLoad ? (
      <ContextDrawer
        title={selectedLoad.loadNumber ? `#${selectedLoad.loadNumber}` : selectedLoad.id.slice(0, 8)}
        subtitle={`${selectedLoad.origin ?? "—"} → ${selectedLoad.destination ?? "—"}`}
        closeHref={closeHref}
      >
        <LoadDrawerContent load={selectedLoad} brokerNames={brokerNames} activeTripNames={activeTripNames} />
      </ContextDrawer>
    ) : null}
    </div>
  );
}
