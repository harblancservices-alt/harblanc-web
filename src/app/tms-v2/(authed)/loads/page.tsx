import Link from "next/link";
import { redirect } from "next/navigation";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { listLoads, listArchivedLoads, type LoadStatus, type LoadSortKey, type LoadWithFinancials } from "@/lib/data/loads";
import { listBrokers } from "@/lib/data/brokers";
import { listTrips } from "@/lib/data/trips";
import { getDispatchSettingsSummary } from "@/lib/data/settings";
import { getAnalyticsLoads, dayAfter } from "@/lib/data/analytics";
import { summarize } from "@/lib/dispatch/performance";
import { currentPeriod, periodLabel, periodRange, type Period } from "@/lib/domain/attribution";
import { withReturnTo } from "@/lib/nav/return-to";
import { DEFAULT_PAGE_SIZE } from "@/lib/data/pagination";
import { LoadBoardListClient } from "./LoadBoardListClient";
import { LoadBoardTopRow } from "./LoadBoardTopRow";
import { LoadBoardDesktopToolbar } from "./LoadBoardDesktopToolbar";
import { LoadBoardSummaryStrip } from "./LoadBoardSummaryStrip";
import { LoadBoardDesktopTable } from "./LoadBoardDesktopTable";
import { ArchivedLoadsSection } from "./ArchivedLoadsSection";
import type { LoadBoardView } from "./MonthDropdown";
import { LoadBoardSelectionProvider } from "./LoadBoardSelectionProvider";
import { LoadBoardGoalCard } from "./LoadBoardGoalCard";

// Loads change status/payment throughout the day — the board always reads
// live, request-scoped data (matches Today's own force-dynamic choice).
export const dynamic = "force-dynamic";

// A safe "beginning of time" bound for the "All" view's net aggregate —
// this one-truck operation has no loads before this date, and
// getAnalyticsLoads is already bounded to 2000 rows regardless.
const ALL_TIME_START = "1970-01-01";

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

function parseView(sp: SearchParams): LoadBoardView {
  const v = first(sp.view);
  if (v === "ytd") return { mode: "ytd" };
  if (v === "all") return { mode: "all" };
  return { mode: "month", month: parsePeriod(sp).month };
}

const STATUS_VALUES: LoadStatus[] = ["pending", "assigned", "loaded", "delivered", "tonu"];
function parseStatus(sp: SearchParams): LoadStatus | undefined {
  const v = first(sp.status);
  return v && (STATUS_VALUES as string[]).includes(v) ? (v as LoadStatus) : undefined;
}

// In-memory sort of the currently-fetched page — desktop-table-only
// (Brent's mockup wants Miles/Gross/Net/Net-$/mi sortable, none of which
// listLoads()'s own DB-level `sort` supports — see LoadSortKey's own
// comment on why: they're derived post-query by the money engine, not raw
// columns SQL can ORDER BY without computing the whole page first). Every
// value sorted here is already the canonical computed figure
// (`financials`), never re-derived — this only orders rows that are
// already on the page, it doesn't touch the query or the math.
const DESKTOP_SORT_KEYS = new Set(["number", "status", "pickup", "broker", "miles", "gross", "net", "netRpm"]);
function sortForDesktop(rows: LoadWithFinancials[], key: string | undefined, dir: "asc" | "desc"): LoadWithFinancials[] {
  if (!key || !DESKTOP_SORT_KEYS.has(key)) return rows;
  const mul = dir === "asc" ? 1 : -1;
  const val = (l: LoadWithFinancials): number | string => {
    switch (key) {
      case "number":
        return l.loadNumber ?? "";
      case "status":
        return l.status;
      case "pickup":
        return l.pickupDate ?? "";
      case "broker":
        return l.brokerName ?? "";
      case "miles":
        return l.financials.loadedMiles;
      case "gross":
        return l.financials.gross;
      case "net":
        return l.financials.net;
      case "netRpm":
        return l.financials.loadedMiles > 0 ? l.financials.net / l.financials.loadedMiles : -Infinity;
      default:
        return "";
    }
  };
  return [...rows].sort((a, b) => {
    const av = val(a);
    const bv = val(b);
    const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
    return cmp * mul;
  });
}

/**
 * Load Board.
 *
 * MOBILE (<lg): unchanged — Brent's explicit ask, this pass is desktop-
 * only. Goal card, full-width Add-load button + card grid, month-only
 * dropdown + delete-select mode all stay exactly as they were.
 *
 * DESKTOP (lg+, this pass, per Brent's approved mockup): a slim toolbar
 * (title, period prev/next+dropdown, status filter, search, a small
 * "+ Add load") — no goal banner, no full-width Add button; a quiet
 * one-line summary strip; a dense sortable DataList table (Load #/Status/
 * Pickup/Delivery/Broker/Lane/Miles/Gross/Net/Net-$/mi) with a totals
 * footer row; deleted-loads access (ArchivedLoadsSection, ported in here
 * for the first time — it existed in code but was never actually rendered
 * anywhere before this).
 *
 * Both breakpoints share the SAME `listLoads()` fetch (no forked query)
 * and the SAME canonical `financials` on each row — the desktop table
 * only sorts/displays what's already computed, never recalculates.
 *
 * Note: the footer/strip totals are the period's REAL totals
 * (getAnalyticsLoads + summarize(), matching Performance's own aggregation
 * exactly), not a sum of whatever page of rows the table happens to be
 * showing — the same reason the old goal card never derived its figure
 * from listResult.rows either. They only diverge from the visible table's
 * own sum if a period has more than one page of loads (DEFAULT_PAGE_SIZE
 * = 25), which is realistically rare at this business's scale.
 */
export default async function LoadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const view = parseView(sp);
  const period = parsePeriod(sp);
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const status = parseStatus(sp);
  const q = first(sp.q)?.trim() || undefined;
  const sortKey = first(sp.sort);
  const sortDir: "asc" | "desc" = first(sp.dir) === "asc" ? "asc" : "desc";

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const ytdStart = `${today.getUTCFullYear()}-01-01`;

  const scopedListOpts =
    view.mode === "month"
      ? { period, page, pageSize: DEFAULT_PAGE_SIZE, status, search: q }
      : view.mode === "ytd"
        ? { dateRange: { start: ytdStart, end: dayAfter(todayIso) }, page, pageSize: DEFAULT_PAGE_SIZE, status, search: q }
        : { page, pageSize: DEFAULT_PAGE_SIZE, status, search: q }; // "all" — no period/dateRange means every load

  // One period-complete range for the summary/footer totals — never the
  // paginated listResult.rows, which can be a partial page.
  const summaryRange =
    view.mode === "month" ? periodRange(period) : { start: view.mode === "ytd" ? ytdStart : ALL_TIME_START, end: dayAfter(todayIso) };

  const [listResult, brokersPage, activeTripsPage, summaryLoads, archived, settings] = await Promise.all([
    listLoads(scopedListOpts),
    listBrokers({ pageSize: 100 }),
    listTrips({ status: "active", pageSize: 100 }),
    getAnalyticsLoads(summaryRange),
    listArchivedLoads(),
    getDispatchSettingsSummary(),
  ]);
  const brokerNames = brokersPage.rows.map((b) => b.name);
  const activeTripNames = activeTripsPage.rows.map((t) => t.name).filter((n): n is string => !!n);
  const summary = summarize(summaryLoads);

  // Mobile goal card target — a specific month targets the MONTHLY goal,
  // "Year to date"/"All" both target the ANNUAL goal (Brent's earlier
  // correction, unchanged by this pass). The desktop strip/table have no
  // goal concept at all (Brent's mockup explicitly drops the goal banner
  // there) — `summary.net` is reused as both the mobile card's "net so
  // far" and the desktop figures, but `goal`/`goalLabel` are mobile-only.
  const goal = view.mode === "month" ? settings.monthlyNetGoal : settings.annualNetGoal;
  const goalLabel = view.mode === "month" ? `${periodLabel(period)} net goal` : view.mode === "ytd" ? "Annual net goal · year to date" : "Annual net goal · all-time";

  const viewLabel = view.mode === "month" ? periodLabel(period) : view.mode === "ytd" ? "Year to date" : "All time";

  // The base query string for this view — reused by pagination, row
  // selection, and the redirect-clamp below so all of them stay scoped
  // to whichever month/ytd/all the dropdown picked.
  function baseParams(): URLSearchParams {
    const params = new URLSearchParams();
    if (view.mode === "month") {
      params.set("year", String(period.year));
      params.set("month", String(period.month));
    } else {
      params.set("view", view.mode);
    }
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    return params;
  }

  // A stale/bookmarked ?page=N (from a tap on a fuller period) can point
  // past this view's actual row count — Supabase's count:"exact" still
  // reports the true total even though .range() clips `rows` to [], so
  // the board renders empty. Clamp back to the last real page instead of
  // silently showing nothing.
  if (page > 1 && listResult.rows.length === 0 && listResult.totalCount > 0) {
    const lastPage = Math.max(1, Math.ceil(listResult.totalCount / DEFAULT_PAGE_SIZE));
    const params = baseParams();
    if (lastPage > 1) params.set("page", String(lastPage));
    redirect(`/tms-v2/loads?${params.toString()}`);
  }

  function pageHref(p: number): string {
    const params = baseParams();
    params.set("page", String(p));
    return `/tms-v2/loads?${params.toString()}`;
  }

  function sortHrefFor(key: string): string {
    const params = baseParams();
    const nextDir = sortKey === key && sortDir === "desc" ? "asc" : "desc";
    params.set("sort", key);
    params.set("dir", nextDir);
    return `/tms-v2/loads?${params.toString()}`;
  }

  // This exact view (month/ytd/all + page) — handed to LoadBoardListClient
  // so a load opened from here returns to the same view, not a reset
  // "current month" (lib/nav/return-to.ts).
  const fromPath = page > 1 ? pageHref(page) : (() => { const qs = baseParams().toString(); return qs ? `/tms-v2/loads?${qs}` : "/tms-v2/loads"; })();

  const desktopRows = sortForDesktop(listResult.rows, sortKey, sortDir);

  return (
    <LoadBoardSelectionProvider>
    <PageScroll
      header={
        <>
          <div className="lg:hidden">
            <LoadBoardTopRow year={period.year} view={view} hasLoads={listResult.rows.length > 0} />
          </div>
          <div className="hidden lg:block">
            <LoadBoardDesktopToolbar
              year={period.year}
              view={view}
              status={status}
              q={q}
              brokerNames={brokerNames}
              activeTripNames={activeTripNames}
              otherParams={sortKey ? { sort: sortKey, dir: sortDir } : {}}
            />
          </div>
        </>
      }
    >
      {/* MOBILE — unchanged. */}
      <div className="flex flex-col gap-4 lg:hidden">
        <LoadBoardGoalCard label={goalLabel} goal={goal} net={summary.net} />

        <LoadBoardListClient
          loads={listResult.rows}
          brokerNames={brokerNames}
          activeTripNames={activeTripNames}
          emptyMessage="No loads in this view."
          fromPath={fromPath}
        />
      </div>

      {/* DESKTOP — new, per Brent's approved mockup. */}
      <div className="hidden flex-col gap-4 lg:flex">
        <LoadBoardSummaryStrip summary={summary} />

        <LoadBoardDesktopTable
          loads={desktopRows}
          sort={{ activeKey: sortKey ?? null, dir: sortDir, hrefFor: sortHrefFor }}
          summary={summary}
          periodLabel={viewLabel}
          getHref={(id) => withReturnTo(`/tms-v2/loads/${id}`, fromPath)}
        />

        <ArchivedLoadsSection loads={archived} />
      </div>

      {listResult.hasMore || page > 1 ? (
        <div className="mt-4 flex items-center justify-end gap-2">
          {page > 1 ? (
            <Link
              href={pageHref(page - 1)}
              className="rounded-md border border-line-strong px-3 py-1.5 text-[13px] font-medium text-fg hover:bg-elevated"
            >
              Previous
            </Link>
          ) : null}
          {listResult.hasMore ? (
            <Link
              href={pageHref(page + 1)}
              className="rounded-md border border-line-strong px-3 py-1.5 text-[13px] font-medium text-fg hover:bg-elevated"
            >
              Next
            </Link>
          ) : null}
        </div>
      ) : null}
    </PageScroll>
    </LoadBoardSelectionProvider>
  );
}
