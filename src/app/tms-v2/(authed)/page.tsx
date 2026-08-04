import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { KpiTile } from "@/components/tms-v2/ui/KpiTile";
import { Card } from "@/components/tms-v2/ui/Card";
import { Money } from "@/components/tms-v2/ui/Money";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";

/**
 * /tms-v2 — Today (v2-design.md §3). Foundation-phase placeholder: the
 * shell, nav, and primitives are real and live; the KPI figures below are
 * static zeros, not a live query — Dashboard's real notification-model-
 * driven "Needs attention" feed and Active Loads zones land once lib/data's
 * query layer exists (a later phase).
 */
export default function TmsV2TodayPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Today"
        description="Harblanc TMS — Version 2 foundation."
        badge={
          <span className="inline-flex items-center rounded-full border border-accent bg-accent/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
            V2 — preview
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <KpiTile label="Gross (this month)" value={<Money value={0} tone="none" />} />
        <KpiTile label="Net (this month)" value={<Money value={0} tone="none" />} />
        <KpiTile label="Loads" value="0" />
        <KpiTile label="A/R" value={<Money value={0} tone="none" />} />
      </div>

      <Card className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold text-fg">Foundation phase</h2>
        <p className="text-[13px] text-fg-muted">
          This is the /tms-v2 app shell — navigation, auth, and the design-system primitives are live behind the
          same login as /admin. Every destination in the sidebar and bottom nav routes to a real page; live data,
          the notification model, and the money/domain engines land in the phases that follow.
        </p>
        <p className="text-[13px] text-fg-muted">
          Server render time: <DateTimeCST value={new Date()} />
        </p>
      </Card>
    </div>
  );
}
