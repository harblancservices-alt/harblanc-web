import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { NeedsAttentionList } from "./_components/NeedsAttentionList";
import { ActiveLoadsList } from "./_components/ActiveLoadsList";
import { getTodaySummary } from "@/lib/data/dashboard";
import { getNeedsAttention } from "@/lib/data/attention";
import { listBrokers } from "@/lib/data/brokers";
import { listTrips } from "@/lib/data/trips";
import { listExpenseAccounts } from "@/lib/data/recurring-expenses";
import { AddLoadButton } from "./loads/AddLoadButton";
import { AddExpenseButton } from "./expenses/AddExpenseButton";
import { GoalCountdownCard } from "./_components/GoalCountdownCard";
import { getDispatchSettingsSummary } from "@/lib/data/settings";

// Dashboard reads live, request-scoped data (active loads, needs-attention
// list) — always fresh, matching /admin's own dashboard.
export const dynamic = "force-dynamic";

/**
 * Dashboard (formerly "Today") — rebuilt to mirror legacy /admin's
 * dashboard OPERATION (src/app/admin/(authed)/page.tsx +
 * DashboardView.tsx): an alerts feed up top, active loads as the primary
 * working list with inline micro-actions, goal tracking, quick add — not
 * a pixel copy, and deliberately without the KPI-tile/hero-card treatment
 * that page never had. Brent's explicit asks this pass: no "V2 — preview"
 * pill, no big dark Net hero, no square KPI cards (Gross/Loads/A-R —
 * cash/A-R doesn't belong on the dashboard), and the WHOLE page as one
 * continuous scroll on mobile — so this renders as a single stacked
 * column with no split-scroll rail and no PageScroll `header` prop
 * (nothing here is pinned).
 *
 * Deliberately NOT ported from legacy this pass (flagging rather than
 * silently dropping, per the standing instruction): the per-load Rate
 * Con/BOL/POD document-count buttons (needs a new per-load doc-count
 * query nothing in tms-v2's data layer has yet), the truck-maintenance
 * quick-view widget, the "Expired quotes" section, and legacy's
 * multi-goal CountdownCards/CurrentCashRow breakdown (tms-v2 already
 * ships a deliberately-simplified single-goal card, kept as-is — see
 * GoalCountdownCard's own header comment for why that simplification was
 * chosen originally).
 */
export default async function TmsV2DashboardPage() {
  const [summary, attention, brokersPage, activeTripsPage, accounts, settings] = await Promise.all([
    getTodaySummary(),
    getNeedsAttention(),
    listBrokers({ pageSize: 100 }),
    listTrips({ status: "active", pageSize: 100 }),
    listExpenseAccounts(),
    getDispatchSettingsSummary(),
  ]);
  const brokerNames = brokersPage.rows.map((b) => b.name);
  const activeTripNames = activeTripsPage.rows.map((t) => t.name).filter((n): n is string => !!n);
  const accountNames = accounts.map((a) => a.name);

  return (
    <PageScroll>
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-fg">Needs attention</h2>
            {attention.redCount > 0 ? (
              <span className="inline-flex items-center rounded-full bg-bad-bg px-2 py-0.5 text-[11px] font-semibold text-bad">
                {attention.redCount} overdue
              </span>
            ) : null}
            {attention.amberCount > 0 ? (
              <span className="inline-flex items-center rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-semibold text-warn">
                {attention.amberCount} soon
              </span>
            ) : null}
          </div>
          <NeedsAttentionList items={attention.items} />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold text-fg">Active loads ({summary.activeLoads.length})</h2>
          <ActiveLoadsList loads={summary.activeLoads} />
        </section>

        <GoalCountdownCard goal={settings.monthlyNetGoal} net={summary.net} periodLabel={summary.periodLabel} />

        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold text-fg">Quick add</h2>
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-card p-3 shadow-e1 sm:flex-row">
            <AddLoadButton brokerNames={brokerNames} activeTripNames={activeTripNames} showFab={false} />
            <AddExpenseButton accountNames={accountNames} showFab={false} />
          </div>
        </section>
      </div>
    </PageScroll>
  );
}
