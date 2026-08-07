import Link from "next/link";
import { redirect } from "next/navigation";
import { ContextDrawer } from "@/components/tms-v2/ui/ContextDrawer";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { listLoads, getLoadDetail, getLoadBoardSummary } from "@/lib/data/loads";
import { listBrokers } from "@/lib/data/brokers";
import { listTrips } from "@/lib/data/trips";
import { getDispatchSettingsSummary } from "@/lib/data/settings";
import { getAnalyticsLoads, dayAfter } from "@/lib/data/analytics";
import { summarize } from "@/lib/dispatch/performance";
import { currentPeriod, periodLabel, type Period } from "@/lib/domain/attribution";
import { DEFAULT_PAGE_SIZE } from "@/lib/data/pagination";
import { LoadBoardListClient } from "./LoadBoardListClient";
import { MonthDropdown, type LoadBoardView } from "./MonthDropdown";
import { LoadBoardGoalCard } from "./LoadBoardGoalCard";
import { LoadDrawerContent } from "./LoadDrawerContent";

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

/**
 * Load Board — mirrors legacy /admin's board OPERATION: a period-dependent
 * goal card, a two-button Add load/Delete row, and rich shipment-timeline
 * load cards instead of a table.
 *
 * Per Brent's correction to the month dropdown + goal: the dropdown now
 * lists all 12 months of the resolved year PLUS "Year to date" and "All"
 * (MonthDropdown) — it was missing the individual months and both of
 * those before. The selection drives BOTH which loads show and which
 * Settings goal the card targets: a specific month -> the $10,000
 * MONTHLY goal and that month's net; "Year to date" -> the $120,000
 * ANNUAL goal and Jan-1-through-today net; "All" -> the $120,000 ANNUAL
 * goal and all-time net. Both goal figures come from
 * getDispatchSettingsSummary() (dispatch_settings.monthly_net_goal /
 * annual_net_goal) — never hardcoded (LoadBoardGoalCard, replacing the
 * old YTD-only AnnualGoalCard).
 *
 * "Year to date"/"All" scope the loads list itself via
 * lib/data/loads.ts's new `dateRange` option (reusing the same
 * loadsPeriodFilter() attribution-fallback filter periodRange() already
 * built on) — "All" passes no period/dateRange at all, which the data
 * layer already treated as "every load," no new capability needed there.
 */
export default async function LoadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const view = parseView(sp);
  const period = parsePeriod(sp);
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const selectedId = first(sp.id);

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const ytdStart = `${today.getUTCFullYear()}-01-01`;

  const scopedListOpts =
    view.mode === "month"
      ? { period, page, pageSize: DEFAULT_PAGE_SIZE }
      : view.mode === "ytd"
        ? { dateRange: { start: ytdStart, end: dayAfter(todayIso) }, page, pageSize: DEFAULT_PAGE_SIZE }
        : { page, pageSize: DEFAULT_PAGE_SIZE }; // "all" — no period/dateRange means every load

  const [listResult, brokersPage, activeTripsPage, selectedLoad, settings, goalNet] = await Promise.all([
    listLoads(scopedListOpts),
    listBrokers({ pageSize: 100 }),
    listTrips({ status: "active", pageSize: 100 }),
    selectedId ? getLoadDetail(selectedId) : Promise.resolve(null),
    getDispatchSettingsSummary(),
    view.mode === "month"
      ? getLoadBoardSummary(period).then((s) => s.net)
      : getAnalyticsLoads({ start: view.mode === "ytd" ? ytdStart : ALL_TIME_START, end: dayAfter(todayIso) }).then((rows) => summarize(rows).net),
  ]);
  const brokerNames = brokersPage.rows.map((b) => b.name);
  const activeTripNames = activeTripsPage.rows.map((t) => t.name).filter((n): n is string => !!n);

  const goal = view.mode === "month" ? settings.monthlyNetGoal : settings.annualNetGoal;
  const goalLabel = view.mode === "month" ? `${periodLabel(period)} net goal` : view.mode === "ytd" ? "Annual net goal · year to date" : "Annual net goal · all-time";

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

  // Row selection stays in the URL (same discipline as period/page) rather
  // than client state, so a selected load's context drawer is a real,
  // shareable/back-button-friendly location, not ephemeral UI state.
  //
  // rowHrefBase (a plain string) — not a rowHref(id) FUNCTION — is what
  // gets passed to LoadBoardListClient below: that component is "use
  // client", and a Server Component can't hand a Client Component an
  // arbitrary closure as a prop (only serializable values cross that
  // boundary). The client component appends `&id=` itself.
  const rowHrefBase = (() => {
    const params = baseParams();
    if (page > 1) params.set("page", String(page));
    return params.toString();
  })();

  const closeHref = (() => {
    const params = baseParams();
    if (page > 1) params.set("page", String(page));
    return `/tms-v2/loads?${params.toString()}`;
  })();

  return (
    <div className="flex h-full min-h-0 overflow-hidden gap-6">
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
    <PageScroll
      header={
        <div className="flex items-center justify-center">
          <MonthDropdown year={period.year} view={view} />
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <LoadBoardGoalCard label={goalLabel} goal={goal} net={goalNet} />

        <LoadBoardListClient
          loads={listResult.rows}
          rowHrefBase={rowHrefBase}
          brokerNames={brokerNames}
          activeTripNames={activeTripNames}
          emptyMessage="No loads in this view."
        />

        {listResult.hasMore || page > 1 ? (
          <div className="flex items-center justify-end gap-2">
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
