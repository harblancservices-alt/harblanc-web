import Link from "next/link";
import { redirect } from "next/navigation";
import { ContextDrawer } from "@/components/tms-v2/ui/ContextDrawer";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { listLoads, getLoadBoardSummary, getLoadDetail, listArchivedLoads, type LoadStatus } from "@/lib/data/loads";
import { listBrokers } from "@/lib/data/brokers";
import { listTrips } from "@/lib/data/trips";
import { getDispatchSettingsSummary } from "@/lib/data/settings";
import { currentPeriod, type Period } from "@/lib/domain/attribution";
import { DEFAULT_PAGE_SIZE } from "@/lib/data/pagination";
import { LoadBoardFilters } from "./LoadBoardFilters";
import { LoadBoardListClient } from "./LoadBoardListClient";
import { LoadBoardPerformanceCard } from "./LoadBoardPerformanceCard";
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

/**
 * Load Board — rebuilt to mirror legacy /admin's board OPERATION
 * (src/app/admin/(authed)/dispatch/loads/LoadBoardView.tsx + board/
 * LoadCard.tsx), not a pixel copy: a slim collapsible Monthly Performance
 * strip in place of the six square KPI tiles, a compact New Load/Inquiry/
 * Delete action row, a compact search+filter row, and rich shipment-
 * timeline load cards instead of a table. tms-v2's own additions (status/
 * broker filters, column CSV export, saved filter presets, an Archived-
 * loads trash section) are kept — legacy never had them, but Brent asked
 * to keep them, just compact. Column sorting is dropped along with the
 * table it belonged to (there's no table header left to sort by) — the
 * data layer's sort capability (lib/data/loads.ts's ListLoadsOptions)
 * stays intact for CSV export's own deterministic ordering.
 */
export default async function LoadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const period = parsePeriod(sp);
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const status = first(sp.status) as LoadStatus | undefined;
  const brokerId = first(sp.brokerId) || undefined;
  const search = first(sp.q) || undefined;
  const selectedId = first(sp.id);

  const [summary, listResult, brokersPage, activeTripsPage, selectedLoad, archivedLoads, exportResult, settings] = await Promise.all([
    getLoadBoardSummary(period),
    listLoads({ period, page, pageSize: DEFAULT_PAGE_SIZE, status, brokerId, search }),
    listBrokers({ pageSize: 100 }),
    listTrips({ status: "active", pageSize: 100 }),
    selectedId ? getLoadDetail(selectedId) : Promise.resolve(null),
    listArchivedLoads(),
    listLoads({ period, page: 1, pageSize: EXPORT_FETCH_SIZE, status, brokerId, search }),
    getDispatchSettingsSummary(),
  ]);
  const brokerNames = brokersPage.rows.map((b) => b.name);
  const activeTripNames = activeTripsPage.rows.map((t) => t.name).filter((n): n is string => !!n);

  const baseParams = new URLSearchParams();
  if (status) baseParams.set("status", status);
  if (brokerId) baseParams.set("brokerId", brokerId);
  if (search) baseParams.set("q", search);

  // A stale/bookmarked ?page=N (from a Next tap on a fuller period, or a
  // filter change that used to clear it) can point past this period+
  // filter set's actual row count — Supabase's count:"exact" still
  // reports the true total even though .range() clips `rows` to [], so
  // the KPI strip (always its own page:1/pageSize:200 read, independent
  // of this page's `page` param) stays correct while the board itself
  // renders empty. Clamp back to the last real page instead of silently
  // showing nothing.
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
  //
  // rowHrefBase (a plain string) — not a rowHref(id) FUNCTION — is what
  // gets passed to LoadBoardListClient below: that component is "use
  // client", and a Server Component can't hand a Client Component an
  // arbitrary closure as a prop (only serializable values cross that
  // boundary). The client component appends `&id=` itself.
  const rowHrefBase = (() => {
    const params = new URLSearchParams(baseParams);
    params.set("year", String(period.year));
    params.set("month", String(period.month));
    if (page > 1) params.set("page", String(page));
    return params.toString();
  })();
  function rowHref(loadId: string): string {
    return `/tms-v2/loads?${rowHrefBase}&id=${loadId}`;
  }

  const closeHref = (() => {
    const params = new URLSearchParams(baseParams);
    params.set("year", String(period.year));
    params.set("month", String(period.month));
    if (page > 1) params.set("page", String(page));
    return `/tms-v2/loads?${params.toString()}`;
  })();

  return (
    <div className="flex h-full min-h-0 overflow-hidden gap-6">
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
    <PageScroll
      header={
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[13px] font-medium text-fg">
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
          <ExportLoadsCsvButton rows={exportResult.rows} />
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <LoadBoardPerformanceCard goal={settings.monthlyNetGoal} net={summary.net} periodLabel={summary.periodLabel} />

        <LoadBoardListClient
          loads={listResult.rows}
          rowHrefBase={rowHrefBase}
          brokerNames={brokerNames}
          activeTripNames={activeTripNames}
          emptyMessage="No loads match this period and filters."
        />

        <LoadBoardFilters
          statusOptions={STATUS_OPTIONS}
          brokers={brokersPage.rows.map((b) => ({ id: b.id, name: b.name }))}
          status={status}
          brokerId={brokerId}
          search={search}
          year={period.year}
          month={period.month}
        />

        <SavedViews storageKey="tms-v2:saved-filters:loads" />

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

        <ArchivedLoadsSection loads={archivedLoads} />
      </div>
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
