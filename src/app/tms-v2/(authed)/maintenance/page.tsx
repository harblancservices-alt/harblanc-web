import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { Card } from "@/components/tms-v2/ui/Card";
import { getMaintenanceOverview } from "@/lib/data/maintenance";
import {
  IntervalBar,
  MaintenanceStatusBadge,
  RecentEntryRow,
  milesRemainingText,
} from "./_components/parts";

// Odometer/reminder status can change between visits (a service logged
// moments ago should show up immediately) — read live, matching the rest of
// /tms-v2's money-and-status-affecting pages (Today, Load Detail).
export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const { currentOdo, reminders, recentEntries } = await getMaintenanceOverview();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Maintenance"
        description="Odometer-driven service and repair records for the truck."
      />

      <Card className="flex flex-col gap-1">
        <span className="text-[13px] font-medium text-fg-muted">Current odometer</span>
        <span className="font-mono text-[34px] font-semibold leading-none tabular-nums text-fg sm:text-[40px]">
          {currentOdo.toLocaleString()} <span className="text-[16px] font-medium text-fg-muted">mi</span>
        </span>
        <span className="text-[12px] text-fg-muted">Highest reading across all loads.</span>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-fg">Reminders ({reminders.length})</h2>
        {reminders.length === 0 ? (
          <p className="text-[13px] text-fg-muted">No active reminders — nothing has a mileage interval set yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {reminders.map((r) => (
              <Card key={r.id} className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate text-[14px] font-medium text-fg">{r.label}</span>
                  <MaintenanceStatusBadge status={r.status} className="shrink-0" />
                </div>
                <div className="flex items-center justify-between text-[12px] text-fg-muted">
                  <span>{r.category}</span>
                  <span>every {r.intervalMiles.toLocaleString()} mi</span>
                </div>
                <IntervalBar pct={r.pct} status={r.status} />
                <div className="flex items-center justify-between text-[12.5px]">
                  <span
                    className={
                      r.status === "overdue"
                        ? "font-medium text-bad"
                        : r.status === "soon"
                          ? "font-medium text-warn"
                          : "text-fg-muted"
                    }
                  >
                    {milesRemainingText(r.milesRemaining)}
                  </span>
                  <span className="text-fg-subtle">
                    {r.lastOdo != null ? `Last: ${r.lastOdo.toLocaleString()} mi` : "Never serviced"}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold text-fg">Recent repair log ({recentEntries.length})</h2>
        {recentEntries.length === 0 ? (
          <p className="text-[13px] text-fg-muted">No repairs logged yet.</p>
        ) : (
          <div className="rounded-lg border border-line bg-card px-3">
            {recentEntries.map((entry) => (
              <RecentEntryRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
