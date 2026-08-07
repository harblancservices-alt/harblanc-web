import Link from "next/link";
import { redirect } from "next/navigation";
import { ContextDrawer } from "@/components/tms-v2/ui/ContextDrawer";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { listLoads, getLoadDetail } from "@/lib/data/loads";
import { listBrokers } from "@/lib/data/brokers";
import { listTrips } from "@/lib/data/trips";
import { getDispatchSettingsSummary } from "@/lib/data/settings";
import { getAnalyticsLoads, dayAfter } from "@/lib/data/analytics";
import { summarize } from "@/lib/dispatch/performance";
import { currentPeriod, type Period } from "@/lib/domain/attribution";
import { DEFAULT_PAGE_SIZE } from "@/lib/data/pagination";
import { LoadBoardListClient } from "./LoadBoardListClient";
import { MonthDropdown } from "./MonthDropdown";
import { AnnualGoalCard } from "./AnnualGoalCard";
import { LoadDrawerContent } from "./LoadDrawerContent";

// Loads change status/payment throughout the day — the board always reads
// live, request-scoped data (matches Today's own force-dynamic choice).
export const dynamic = "force-dynamic";

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

/**
 * Load Board — mirrors legacy /admin's board OPERATION (src/app/admin/
 * (authed)/dispatch/loads/LoadBoardView.tsx + board/LoadCard.tsx): a goal
 * card, a two-button Add load/Delete row (equal size, both solid red), and
 * rich shipment-timeline load cards instead of a table.
 *
 * Per Brent's mobile review (second pass): the month arrows became a real
 * dropdown (MonthDropdown, all 12 months of the resolved year, not just
 * the current one — still driving the same ?year=&month= params this page
 * already reads), the goal card now targets the $120,000 ANNUAL goal
 * (dispatch_settings.annual_net_goal via getDispatchSettingsSummary — the
 * same Settings-editable single source) against YEAR-TO-DATE net rather
 * than the $10,000 monthly goal, and the bottom "Page N · M loads" text
 * plus the "Deleted loads" section were removed. The month dropdown still
 * scopes the loads list and the period label; the goal card does not
 * (it's YTD-vs-annual regardless of which month is selected) — see
 * AnnualGoalCard's header for why.
 *
 * The search/status/broker filter cluster, saved-filter presets, Inquiry
 * button, and CSV export were already dropped in the prior review pass.
 */
export default async function LoadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const period = parsePeriod(sp);
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const selectedId = first(sp.id);

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const ytdStart = `${today.getUTCFullYear()}-01-01`;

  const [listResult, brokersPage, activeTripsPage, selectedLoad, settings, ytdLoads] = await Promise.all([
    listLoads({ period, page, pageSize: DEFAULT_PAGE_SIZE }),
    listBrokers({ pageSize: 100 }),
    listTrips({ status: "active", pageSize: 100 }),
    selectedId ? getLoadDetail(selectedId) : Promise.resolve(null),
    getDispatchSettingsSummary(),
    getAnalyticsLoads({ start: ytdStart, end: dayAfter(todayIso) }),
  ]);
  const brokerNames = brokersPage.rows.map((b) => b.name);
  const activeTripNames = activeTripsPage.rows.map((t) => t.name).filter((n): n is string => !!n);
  const ytdNet = summarize(ytdLoads).net;

  // A stale/bookmarked ?page=N (from a tap on a fuller period) can point
  // past this period's actual row count — Supabase's count:"exact" still
  // reports the true total even though .range() clips `rows` to [], so the
  // KPI strip (its own page:1/pageSize:200 read, independent of this
  // page's `page` param) stays correct while the board itself renders
  // empty. Clamp back to the last real page instead of silently showing
  // nothing.
  if (page > 1 && listResult.rows.length === 0 && listResult.totalCount > 0) {
    const lastPage = Math.max(1, Math.ceil(listResult.totalCount / DEFAULT_PAGE_SIZE));
    const params = new URLSearchParams();
    params.set("year", String(period.year));
    params.set("month", String(period.month));
    if (lastPage > 1) params.set("page", String(lastPage));
    redirect(`/tms-v2/loads?${params.toString()}`);
  }

  function pageHref(p: number): string {
    const params = new URLSearchParams();
    params.set("year", String(period.year));
    params.set("month", String(period.month));
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
    const params = new URLSearchParams();
    params.set("year", String(period.year));
    params.set("month", String(period.month));
    if (page > 1) params.set("page", String(page));
    return params.toString();
  })();

  const closeHref = (() => {
    const params = new URLSearchParams();
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
        <div className="flex items-center justify-center">
          <MonthDropdown year={period.year} month={period.month} />
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <AnnualGoalCard goal={settings.annualNetGoal} ytdNet={ytdNet} />

        <LoadBoardListClient
          loads={listResult.rows}
          rowHrefBase={rowHrefBase}
          brokerNames={brokerNames}
          activeTripNames={activeTripNames}
          emptyMessage="No loads this period."
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
