import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { KpiTile } from "@/components/tms-v2/ui/KpiTile";
import { Money } from "@/components/tms-v2/ui/Money";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { StatusPill } from "@/components/tms-v2/ui/StatusPill";
import { DataList, type DataListColumn } from "@/components/tms-v2/ui/DataList";
import { NeedsAttentionList } from "./_components/NeedsAttentionList";
import { getTodaySummary } from "@/lib/data/dashboard";
import { formatMoney } from "@/lib/domain/money";
import { getNeedsAttention } from "@/lib/data/attention";
import type { LoadWithFinancials } from "@/lib/data/loads";

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
];

export default async function TmsV2TodayPage() {
  const [summary, attention] = await Promise.all([getTodaySummary(), getNeedsAttention()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Today"
        description={`Harblanc TMS — ${summary.periodLabel}`}
        badge={
          <span className="inline-flex items-center rounded-full border border-accent bg-accent/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
            V2 — preview
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <KpiTile label={`Gross (${summary.periodLabel})`} value={<Money value={summary.gross} tone="none" />} />
        <KpiTile label={`Net (${summary.periodLabel})`} value={formatMoney(summary.net)} emphasis="dark" />
        <KpiTile label="Loads this period" value={String(summary.loadsCount)} />
        <KpiTile label="A/R outstanding" value={<Money value={summary.arTotal} tone="none" />} />
      </div>

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
        <h2 className="text-[15px] font-semibold text-fg">
          Active loads ({summary.activeLoads.length})
        </h2>
        <DataList
          columns={ACTIVE_LOAD_COLUMNS}
          rows={summary.activeLoads}
          rowKey={(l) => l.id}
          emptyMessage="Nothing pending, assigned, or loaded right now."
        />
      </section>

      <p className="text-[13px] text-fg-muted">
        Server render time: <DateTimeCST value={new Date()} />
      </p>
    </div>
  );
}
