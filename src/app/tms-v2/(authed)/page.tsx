import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { NeedsAttentionBar } from "./_components/NeedsAttentionBar";
import { ActiveLoadsList } from "./_components/ActiveLoadsList";
import { CountdownPanel } from "./_components/CountdownPanel";
import { getTodaySummary } from "@/lib/data/dashboard";
import { getNeedsAttention } from "@/lib/data/attention";
import { listBrokers } from "@/lib/data/brokers";
import { listTrips } from "@/lib/data/trips";
import { listCountdownGoals } from "@/lib/data/countdown";
import { getDispatchSettingsSummary } from "@/lib/data/settings";

// Dashboard reads live, request-scoped data (active loads, needs-attention
// list) — always fresh, matching /admin's own dashboard.
export const dynamic = "force-dynamic";

/**
 * Dashboard (formerly "Today") — rebuilt a second time against a screenshot
 * of legacy /admin's actual dashboard, per Brent's explicit correction that
 * the first pass didn't match. Top to bottom, mirroring legacy's structure
 * exactly (DashboardView.tsx): a collapsed "Needs attention" dropdown bar
 * (NeedsAttentionBar — replaces the old always-open flat list), NO search
 * bar (Brent explicitly doesn't want one here), Active Loads as the primary
 * working list with the red "+ Add Load" living only in its empty state
 * (matching legacy — once a load exists, new ones come from the Load
 * Board's own action row), and a redesigned Countdown panel at the bottom
 * (dark header, goal rows, current cash) — the multi-goal countdown_goals
 * system legacy has, not tms-v2's old single monthly-goal card. The whole
 * page is one flat PageScroll column, no split-scroll rail, no header prop.
 *
 * The green "Farm a broker contact" empty-truck card (FarmBrokerContactCard,
 * still in _components/) was pulled from this page per Brent's follow-up —
 * he may relocate that concept into Load Inquiry/emails as its own "Farm"
 * tab later, so the component and its action (farm-contact.ts) are kept
 * in place, just unreferenced here, rather than deleted.
 *
 * Deliberately NOT ported this pass (flagged, not silently dropped): the
 * per-load Rate Con/BOL/POD document-count buttons, the truck-maintenance
 * quick-view widget, the "Expired quotes" table, and the Countdown panel's
 * read-only pace-breakdown modal (needs a trailing-12-week net-pace query
 * this pass doesn't add — the row-level name/target/days-left/progress bar
 * Brent asked for doesn't need it).
 */
export default async function TmsV2DashboardPage() {
  const [summary, attention, brokersPage, activeTripsPage, goals, settings] = await Promise.all([
    getTodaySummary(),
    getNeedsAttention(),
    listBrokers({ pageSize: 100 }),
    listTrips({ status: "active", pageSize: 100 }),
    listCountdownGoals(),
    getDispatchSettingsSummary(),
  ]);
  const brokerNames = brokersPage.rows.map((b) => b.name);
  const activeTripNames = activeTripsPage.rows.map((t) => t.name).filter((n): n is string => !!n);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <PageScroll>
      <div className="flex flex-col gap-4">
        <NeedsAttentionBar items={attention.items} />

        <section className="flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-fg-muted">
            Active loads · {summary.activeLoads.length}
          </h2>
          <ActiveLoadsList loads={summary.activeLoads} brokerNames={brokerNames} activeTripNames={activeTripNames} />
        </section>

        <CountdownPanel goals={goals} currentCash={settings.currentCash} today={today} />
      </div>
    </PageScroll>
  );
}
