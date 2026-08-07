import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { KpiTile } from "@/components/tms-v2/ui/KpiTile";
import { Money } from "@/components/tms-v2/ui/Money";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { StatusPill } from "@/components/tms-v2/ui/StatusPill";
import { DataList, type DataListColumn } from "@/components/tms-v2/ui/DataList";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { NeedsAttentionList } from "./_components/NeedsAttentionList";
import { getTodaySummary } from "@/lib/data/dashboard";
import { formatMoney } from "@/lib/domain/money";
import { getNeedsAttention } from "@/lib/data/attention";
import type { LoadWithFinancials } from "@/lib/data/loads";
import { listBrokers } from "@/lib/data/brokers";
import { listTrips } from "@/lib/data/trips";
import { listExpenseAccounts } from "@/lib/data/recurring-expenses";
import { AddLoadButton } from "./loads/AddLoadButton";
import { AddExpenseButton } from "./expenses/AddExpenseButton";
import { ActiveLoadRowAction } from "./_components/ActiveLoadRowAction";
import { GoalCountdownCard } from "./_components/GoalCountdownCard";
import { getDispatchSettingsSummary } from "@/lib/data/settings";

// Today reads live, request-scoped data (this period's KPIs, active loads,
// needs-attention list) — always fresh, matching /admin's own dashboard.
export const dynamic = "force-dynamic";

const ACTIVE_LOAD_COLUMNS: DataListColumn<LoadWithFinancials>[] = [
  { key: "load", header: "Load", render: (l) => l.loadNumber ?? l.id.slice(0, 8) },
  { key: "broker", header: "Broker", render: (l) => l.brokerName ?? "—" },
  { key: "lane", header: "Lane", render: (l) => `${l.origin ?? "—"} → ${l.destination ?? "—"}`, hideOnMobile: true },
  { key: "pickup", header: "Pickup", render: (l) => <DateTimeCST value={l.pickupDate} mode="date" /> },
  { key: "status", header: "Status", render: (l) => <StatusPill status={l.status} domain="load" /> },
  { key: "net", header: "Net", render: (l) => <Money value={l.financials.net} />, align: "right" },
  { key: "quickOdo", header: "", render: (l) => <ActiveLoadRowAction load={l} />, align: "right" },
];

export default async function TmsV2TodayPage() {
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
    <PageScroll
      header={
        <>
          <PageHeader
            title="Today"
            description={`Harblanc TMS — ${summary.periodLabel}`}
            badge={
              <span className="inline-flex items-center rounded-full border border-accent bg-accent/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
                V2 — preview
              </span>
            }
          />

          {/* Command-center hero — the one figure that outranks everything
              else on the page (v2-design.md's Today wireframe). */}
          <div className="flex flex-col items-center gap-1 rounded-xl bg-bar p-6 text-center shadow-e2">
            <span className="text-[13px] font-medium text-bar-fg/70">Net · {summary.periodLabel}</span>
            <span className="text-[44px] font-semibold leading-none tabular-nums text-bar-fg">
              {formatMoney(summary.net)}
            </span>
            <span className="mt-1 text-[13px] text-bar-fg/70">
              {summary.loadsCount} load{summary.loadsCount === 1 ? "" : "s"} · Gross {formatMoney(summary.gross)}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <KpiTile label={`Gross (${summary.periodLabel})`} value={<Money value={summary.gross} tone="none" />} />
            <KpiTile label="Loads this period" value={String(summary.loadsCount)} />
            <KpiTile label="A/R outstanding" value={<Money value={summary.arTotal} tone="none" />} />
          </div>
        </>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-6 lg:flex-row lg:items-stretch">
        {/* Right rail (~30% on desktop): Goal countdown + Quick Add + Needs
            Attention. First in DOM order so it stays the mobile-priority
            stack; lg:order-2 moves it to the right once there's room for
            the two-column split. Scrolls on its own if "Show more" ever
            expands Needs Attention past the rail's height. */}
        <aside className="flex shrink-0 flex-col gap-6 overflow-y-auto lg:order-2 lg:h-full lg:w-[340px]">
          <GoalCountdownCard goal={settings.monthlyNetGoal} net={summary.net} periodLabel={summary.periodLabel} />

          <section className="flex flex-col gap-2">
            <h2 className="text-[15px] font-semibold text-fg">Quick add</h2>
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-card p-3 shadow-e1">
              <AddLoadButton brokerNames={brokerNames} activeTripNames={activeTripNames} showFab={false} />
              <AddExpenseButton accountNames={accountNames} showFab={false} />
            </div>
          </section>

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
        </aside>

        {/* Hero workspace region (~70% on desktop): active loads — only
            this list scrolls, the rail and everything above stay put. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 lg:order-1 lg:h-full">
          <h2 className="shrink-0 text-[15px] font-semibold text-fg">
            Active loads ({summary.activeLoads.length})
          </h2>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <DataList
              columns={ACTIVE_LOAD_COLUMNS}
              rows={summary.activeLoads}
              rowKey={(l) => l.id}
              getHref={(l) => `/tms-v2/loads?id=${l.id}`}
              emptyMessage="Nothing pending, assigned, or loaded right now."
            />
          </div>
          <p className="shrink-0 text-[13px] text-fg-muted">
            Server render time: <DateTimeCST value={new Date()} />
          </p>
        </div>
      </div>
    </PageScroll>
  );
}
