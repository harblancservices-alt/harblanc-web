import Link from "next/link";
import { redirect } from "next/navigation";
import { ContextDrawer } from "@/components/tms-v2/ui/ContextDrawer";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { listLoads, getLoadBoardSummary, getLoadDetail, listArchivedLoads } from "@/lib/data/loads";
import { listBrokers } from "@/lib/data/brokers";
import { listTrips } from "@/lib/data/trips";
import { getDispatchSettingsSummary } from "@/lib/data/settings";
import { currentPeriod, type Period } from "@/lib/domain/attribution";
import { DEFAULT_PAGE_SIZE } from "@/lib/data/pagination";
import { LoadBoardListClient } from "./LoadBoardListClient";
import { GoalCountdownCard } from "../_components/GoalCountdownCard";
import { LoadDrawerContent } from "./LoadDrawerContent";
import { ArchivedLoadsSection } from "./ArchivedLoadsSection";

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

function shiftPeriod(period: Period, delta: number): Period {
  const total = period.year * 12 + period.month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/**
 * Load Board — mirrors legacy /admin's board OPERATION (src/app/admin/
 * (authed)/dispatch/loads/LoadBoardView.tsx + board/LoadCard.tsx): a
 * static monthly goal card (no collapsible wrapper — Brent's mobile
 * review dropped the "Monthly Performance" toggle bar, GoalCountdownCard
 * renders directly), a two-button Add load/Delete row (equal size, both
 * solid red — Inquiry and CSV export both dropped from this page per that
 * same review), and rich shipment-timeline load cards instead of a table.
 * The search/status/broker filter cluster and saved-filter presets were
 * also dropped per Brent's review — status/brokerId/search plumbing is
 * gone from this page entirely along with the UI (lib/data/loads.ts's
 * ListLoadsOptions still supports them for any other caller). Column
 * sorting stays dropped along with the table it belonged to.
 */
export default async function LoadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const period = parsePeriod(sp);
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const selectedId = first(sp.id);

  const [summary, listResult, brokersPage, activeTripsPage, selectedLoad, archivedLoads, settings] = await Promise.all([
    getLoadBoardSummary(period),
    listLoads({ period, page, pageSize: DEFAULT_PAGE_SIZE }),
    listBrokers({ pageSize: 100 }),
    listTrips({ status: "active", pageSize: 100 }),
    selectedId ? getLoadDetail(selectedId) : Promise.resolve(null),
    listArchivedLoads(),
    getDispatchSettingsSummary(),
  ]);
  const brokerNames = brokersPage.rows.map((b) => b.name);
  const activeTripNames = activeTripsPage.rows.map((t) => t.name).filter((n): n is string => !!n);

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

  function periodHref(p: Period): string {
    const params = new URLSearchParams();
    params.set("year", String(p.year));
    params.set("month", String(p.month));
    return `/tms-v2/loads?${params.toString()}`;
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
        <div className="flex items-center justify-center gap-1 rounded-lg border border-line-strong bg-card p-1 shadow-e1">
          <Link
            href={periodHref(shiftPeriod(period, -1))}
            aria-label="Previous month"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-elevated hover:text-fg"
          >
            ←
          </Link>
          <span className="min-w-[150px] text-center text-[14px] font-semibold tabular-nums text-fg">{summary.periodLabel}</span>
          <Link
            href={periodHref(shiftPeriod(period, 1))}
            aria-label="Next month"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-elevated hover:text-fg"
          >
            →
          </Link>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <GoalCountdownCard goal={settings.monthlyNetGoal} net={summary.net} periodLabel={summary.periodLabel} />

        <LoadBoardListClient
          loads={listResult.rows}
          rowHrefBase={rowHrefBase}
          brokerNames={brokerNames}
          activeTripNames={activeTripNames}
          emptyMessage="No loads this period."
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
