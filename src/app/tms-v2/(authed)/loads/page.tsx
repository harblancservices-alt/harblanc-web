import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { KpiTile } from "@/components/tms-v2/ui/KpiTile";
import { Money } from "@/components/tms-v2/ui/Money";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { StatusPill } from "@/components/tms-v2/ui/StatusPill";
import { DataList, type DataListColumn } from "@/components/tms-v2/ui/DataList";
import { ContextDrawer } from "@/components/tms-v2/ui/ContextDrawer";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { listLoads, getLoadBoardSummary, getLoadDetail, listArchivedLoads, type LoadWithFinancials, type LoadStatus, type LoadSortKey } from "@/lib/data/loads";
import { listBrokers } from "@/lib/data/brokers";
import { listTrips } from "@/lib/data/trips";
import { currentPeriod, type Period } from "@/lib/domain/attribution";
import { DEFAULT_PAGE_SIZE } from "@/lib/data/pagination";
import { formatMoney } from "@/lib/domain/money";
import { LoadBoardFilters } from "./LoadBoardFilters";
import { AddLoadButton } from "./AddLoadButton";
import { LoadDrawerContent } from "./LoadDrawerContent";
import { ArchivedLoadsSection } from "./ArchivedLoadsSection";
import { ExportLoadsCsvButton } from "./ExportLoadsCsvButton";
import { SavedViews } from "../_components/SavedViews";

// Bounded cap for the CSV export fetch — a whole period's rows, not just
// the current display page, but still an explicit bound (v2-architecture.md
// §3c), matching getLoadBoardSummary's own pageSize: 200 KPI-aggregate cap.
const EXPORT_FETCH_SIZE = 500;

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
  { key: "number", header: "#", render: (l) => l.loadNumber ?? l.id.slice(0, 8), sortable: true },
  { key: "broker", header: "Broker", render: (l) => l.brokerName ?? "—", sortable: true },
  {
    key: "lane",
    header: "Lane",
    render: (l) => `${l.origin ?? "—"} → ${l.destination ?? "—"}`,
    hideOnMobile: true,
  },
  { key: "pickup", header: "Pickup", render: (l) => <DateTimeCST value={l.pickupDate} mode="date" />, sortable: true },
  { key: "status", header: "Status", render: (l) => <StatusPill status={l.status} domain="load" />, sortable: true },
  { key: "rate", header: "Rate", render: (l) => <Money value={l.financials.gross} tone="none" />, align: "right" },
  { key: "net", header: "Net", render: (l) => <Money value={l.financials.net} />, align: "right" },
];

const SORT_KEYS: LoadSortKey[] = ["number", "broker", "pickup", "status"];
function isLoadSortKey(v: string | undefined): v is LoadSortKey {
  return !!v && (SORT_KEYS as string[]).includes(v);
}

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
  const sort = isLoadSortKey(first(sp.sort)) ? (first(sp.sort) as LoadSortKey) : undefined;
  const dir = first(sp.dir) === "asc" ? "asc" : "desc";

  const [summary, listResult, brokersPage, activeTripsPage, selectedLoad, archivedLoads, exportResult] = await Promise.all([
    getLoadBoardSummary(period),
    listLoads({ period, page, pageSize: DEFAULT_PAGE_SIZE, status, brokerId, sort, dir }),
    listBrokers({ pageSize: 100 }),
    listTrips({ status: "active", pageSize: 100 }),
    selectedId ? getLoadDetail(selectedId) : Promise.resolve(null),
    listArchivedLoads(),
    listLoads({ period, page: 1, pageSize: EXPORT_FETCH_SIZE, status, brokerId, sort, dir }),
  ]);
  const brokerNames = brokersPage.rows.map((b) => b.name);
  const activeTripNames = activeTripsPage.rows.map((t) => t.name).filter((n): n is string => !!n);

  const baseParams = new URLSearchParams();
  if (status) baseParams.set("status", status);
  if (brokerId) baseParams.set("brokerId", brokerId);
  if (sort) baseParams.set("sort", sort);
  if (sort) baseParams.set("dir", dir);

  // A stale/bookmarked ?page=N (from a Next tap on a fuller period, or a
  // filter change that used to clear it) can point past this period+
  // filter set's actual row count — Supabase's count:"exact" still
  // reports the true total even though .range() clips `rows` to [], so
  // the KPI strip (always its own page:1/pageSize:200 read, independent
  // of this page's `page` param) stays correct while the board itself
  // renders empty. Root cause of the mobile "load's gone but the KPIs
  // say it's there" report — clamp back to the last real page instead of
  // silently showing nothing.
  if (page > 1 && listResult.rows.length === 0 && listResult.totalCount > 0) {
    const lastPage = Math.max(1, Math.ceil(listResult.totalCount / DEFAULT_PAGE_SIZE));
    const params = new URLSearchParams(baseParams);
    params.set("year", String(period.year));
    params.set("month", String(period.month));
    if (lastPage > 1) params.set("page", String(lastPage));
    redirect(`/tms-v2/loads?${params.toString()}`);
  }

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

  function sortHrefFor(key: string): string {
    const nextDir = sort === key && dir === "asc" ? "desc" : "asc";
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (brokerId) params.set("brokerId", brokerId);
    params.set("sort", key);
    params.set("dir", nextDir);
    params.set("year", String(period.year));
    params.set("month", String(period.month));
    return `/tms-v2/loads?${params.toString()}`;
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden gap-6">
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
    <PageScroll
      header={
        <>
          <PageHeader
            title="Loads"
            description="Every load booked this period, server-paginated and searchable by status or broker."
            actions={
              <div className="flex items-center gap-2 text-[13px] font-medium text-fg">
                <ExportLoadsCsvButton rows={exportResult.rows} />
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

          <SavedViews storageKey="tms-v2:saved-filters:loads" />
        </>
      }
    >
      <DataList
        columns={LOAD_COLUMNS}
        rows={listResult.rows}
        rowKey={(l) => l.id}
        getHref={(l) => rowHref(l.id)}
        emptyMessage="No loads match this period and filters."
        sort={{ activeKey: sort ?? null, dir, hrefFor: sortHrefFor }}
      />

      <div className="mt-4 flex items-center justify-between text-[13px] text-fg-muted">
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

      <ArchivedLoadsSection loads={archivedLoads} />
    </PageScroll>
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
