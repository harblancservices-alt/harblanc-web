import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { StatusTag, type StatusTone } from "@/components/ui/StatusTag";
import { AddLoadButton } from "./dispatch/loads/AddLoadButton";
import { FarmBrokerContactCard } from "./FarmBrokerContactCard";
import { ActiveLoadDocButton } from "./ActiveLoadDocActions";
import { OdometerStatusCard } from "./dispatch/loads/[id]/OdometerStatusCard";
import type { MaintStatus } from "@/lib/dispatch/maintenance";
import { IntervalBar } from "./maintenance/IntervalBar";
import { CountdownCards } from "./CountdownCards";
import { AlertsPanel } from "./AlertsPanel";
import { DashboardSearchBar } from "./_shell/GlobalSearch";
import type {
  MaintWidgetItem,
  DashboardData,
} from "@/lib/dispatch/view-types";

/**
 * Owner Dashboard — opportunity inbox (render layer).
 *
 * A collapsible "Needs attention" tab sits at the very top: a slim card
 * carrying the total alert count, which drops down into the grouped alert list
 * (maintenance, overdue receivables, incomplete loads, new applications, new
 * quote requests) — or the green "all clear" state when nothing is waiting.
 * Under it, in place of a page title, the global-search bar. Below that:
 * active loads, the truck-maintenance widget, and the expired-quotes table.
 */

const MAINT_TONE: Record<MaintStatus, StatusTone> = {
  overdue: "red",
  soon: "amber",
  ok: "green",
  baseline: "steel",
};
const MAINT_LABEL: Record<MaintStatus, string> = {
  overdue: "Overdue",
  soon: "Due soon",
  ok: "OK",
  baseline: "Set baseline",
};

function maintRemaining(m: MaintWidgetItem): { text: string; color: string } {
  if (m.milesRemaining == null) {
    return { text: "no baseline", color: "text-steel" };
  }
  if (m.milesRemaining <= 0) {
    return {
      text: `${Math.abs(m.milesRemaining).toLocaleString()} mi over`,
      color: "text-bad",
    };
  }
  return {
    text: `${m.milesRemaining.toLocaleString()} mi left`,
    color: m.status === "soon" ? "text-warn" : "text-ok",
  };
}

const LOAD_STATUS_TONE: Record<string, StatusTone> = {
  pending: "amber",
  assigned: "amber",
  loaded: "steel",
};
const LOAD_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  assigned: "Rolling",
  loaded: "Loaded",
};

// "3w" → "3 weeks ago", "1h" → "1 hour ago", etc. Falls back to the raw
// label for non-numeric forms like "now" / "<1h".
function spellAge(s: string): string {
  const m = /^(\d+)([mhdw])$/.exec(s.trim());
  if (!m) return s;
  const n = parseInt(m[1] ?? "", 10);
  const unit = { m: "minute", h: "hour", d: "day", w: "week" }[m[2] ?? ""] ?? "";
  if (!unit) return s;
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

export function DashboardView({ data }: { data: DashboardData }) {
  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <AlertsPanel groups={data.alertGroups} />
      <div className="mx-auto w-full max-w-5xl px-4 pb-4 pt-2.5 sm:px-6 lg:px-8">
        {/* Search sits where the "Dashboard" title used to — a page title that
            only says where you already are earns less than an entry point into
            loads / brokers / files, and on a phone this is the only one there
            is (the top bar carrying the search icon is hidden below sm). */}
        <div className="mb-3">
          <DashboardSearchBar />
        </div>

        <SectionLabel title="Active loads" count={data.activeLoads.length} />
        {data.activeLoads.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line-strong bg-card px-4 py-10 text-center shadow-e1">
            <p className="font-mono text-[12px] text-ink-3">
              No active loads.
            </p>
            <AddLoadButton
              brokerNames={data.brokerNames}
              activeTrips={data.activeTrips}
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-line-strong bg-card shadow-e2">
            {data.activeLoads.map((l, i) => (
              <div
                key={l.id}
                className={
                  "relative px-3.5 py-2.5 transition-colors hover:bg-inset " +
                  (i === data.activeLoads.length - 1 ? "" : "border-b border-line")
                }
              >
                {/* Stretched link — the WHOLE card opens the load. The odometer
                    and the three doc buttons sit ABOVE it (relative z-10) so
                    they act as their own controls and never navigate. */}
                <Link
                  href={"/admin/dispatch/loads/" + l.id}
                  prefetch={false}
                  aria-label={`Open load — ${l.broker}`}
                  className="absolute inset-0 z-0"
                />

                {/* Top info — status, broker/lane, rate. Static (below the
                    stretched link), so tapping anywhere here opens the load. */}
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 flex-1 items-center gap-2.5">
                    <StatusTag
                      tone={LOAD_STATUS_TONE[l.status] ?? "slate"}
                      className="shrink-0"
                    >
                      {LOAD_STATUS_LABEL[l.status] ?? l.status}
                    </StatusTag>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-fg">
                        {l.broker}
                      </span>
                      <span className="block truncate text-[11px] text-fg-muted">
                        {l.lane}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[13px] font-bold tabular-nums text-ok">
                    {l.rateDisplay}
                  </span>
                </div>

                {/* Inline odometer — the EXACT same component + action the load
                    page uses. Lifted above the stretched link (relative z-10)
                    so its Edit + entry form work without opening the load. */}
                <div className="relative z-10 mt-2.5">
                  <OdometerStatusCard
                    variant="dashboard"
                    loadId={l.id}
                    status={l.status}
                    lastReading={
                      Math.max(
                        l.odoAssigned ?? 0,
                        l.odoLoaded ?? 0,
                        l.odoDelivered ?? 0,
                      ) || null
                    }
                    odoAssigned={l.odoAssigned}
                    odoLoaded={l.odoLoaded}
                    odoDelivered={l.odoDelivered}
                  />
                </div>

                {/* Three doc buttons — lifted above the stretched link so each
                    acts as its own button (and the "attached" indicator state
                    doesn't navigate either). */}
                <div className="relative z-10 mt-2.5 grid grid-cols-3 gap-2">
                  <ActiveLoadDocButton
                    loadId={l.id}
                    broker={l.broker}
                    lane={l.lane}
                    kind="rate_con"
                    label="Rate Con"
                    count={l.rateConCount}
                  />
                  <ActiveLoadDocButton
                    loadId={l.id}
                    broker={l.broker}
                    lane={l.lane}
                    kind="bol"
                    label="BOL"
                    count={l.bolCount}
                  />
                  <ActiveLoadDocButton
                    loadId={l.id}
                    broker={l.broker}
                    lane={l.lane}
                    kind="pod"
                    label="POD"
                    count={l.podCount}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty-truck nudge: farm a broker/lane off the board for Backhaul.
            Only when there are NO active loads (between Add Load + maintenance). */}
        {data.activeLoads.length === 0 ? <FarmBrokerContactCard /> : null}

        {/* Countdown goals — a small section directly above Truck Maintenance,
            styled to match those progress-bar rows. Editable targets with a
            live tap-through breakdown. */}
        <div className="my-5 h-px bg-line" />
        <CountdownCards
          goals={data.countdownGoals}
          pace={data.netPace}
          currentCash={data.currentCash}
          today={new Date().toISOString().slice(0, 10)}
        />

        {data.maintenance.length > 0 ? (
          <>
            <div className="my-5 h-px bg-line" />
            <SectionLabel
              title="Truck maintenance"
              count={data.maintenance.length}
            />
            <div className="overflow-hidden rounded-lg border border-line-strong bg-card shadow-e2">
              {data.maintenance.map((m) => {
                const rem = maintRemaining(m);
                return (
                  <Link
                    key={m.id}
                    href="/admin/maintenance"
                    prefetch={false}
                    className="block border-b border-line px-3.5 py-2.5 transition-colors hover:bg-inset"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <StatusTag tone={MAINT_TONE[m.status]} className="shrink-0">
                          {MAINT_LABEL[m.status]}
                        </StatusTag>
                        <span className="truncate text-[13px] font-semibold text-fg">
                          {m.name}
                        </span>
                      </span>
                      <span
                        className={
                          "shrink-0 font-mono text-[12px] font-bold tabular-nums " +
                          rem.color
                        }
                      >
                        {rem.text}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <IntervalBar pct={m.pct} status={m.status} className="h-2" />
                    </div>
                  </Link>
                );
              })}
              <div className="px-3.5 py-2">
                <Button
                  href="/admin/maintenance"
                  prefetch={false}
                  variant="navigate"
                  size="sm"
                  fullWidth
                >
                  View full schedule →
                </Button>
              </div>
            </div>
          </>
        ) : null}

        {data.expiredQuotes.length > 0 ? (
          <>
            <div className="my-5 h-px bg-line" />
            <SectionLabel
              title="Expired quotes"
              count={data.expiredQuotes.length}
            />
            {/* Standardized cards — same shape as the loads / leads cards. */}
            <div className="space-y-2">
              {data.expiredQuotes.map((q) => (
                <Link
                  key={q.leadId}
                  href={"/admin/quotes/" + q.leadId}
                  prefetch={false}
                  className="block rounded-lg border border-line-strong bg-card p-3 shadow-e2 transition-shadow hover:shadow-e3 active:bg-inset"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <StatusTag tone="amber" className="shrink-0">
                        Expired
                      </StatusTag>
                      <h3 className="truncate text-[14px] font-semibold text-fg">
                        {q.name}
                      </h3>
                    </span>
                    <span className="shrink-0 font-mono text-[15px] font-bold tabular-nums text-ok">
                      {q.priceDisplay ?? "—"}
                    </span>
                  </div>

                  <p className="mt-1 truncate font-mono text-[12px] tabular-nums text-fg-muted">
                    <span className="text-steel">{q.originZip}</span>
                    {q.originPlace ? (
                      <span> · {q.originPlace}</span>
                    ) : null}
                    <span className="text-fg-subtle"> → </span>
                    <span className="text-steel">{q.destZip}</span>
                    {q.destPlace ? <span> · {q.destPlace}</span> : null}
                  </p>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-fg-muted">
                    {q.commodity ? (
                      <span className="truncate">{q.commodity}</span>
                    ) : null}
                    <span className="font-mono tabular-nums">{q.weight}</span>
                    {q.miles != null ? (
                      <span className="font-mono tabular-nums">
                        {Math.round(q.miles).toLocaleString()} mi
                      </span>
                    ) : null}
                    <DatePill dateLabel={q.dateLabel} ageLabel={q.ageLabel} />
                  </div>
                </Link>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function DatePill({
  dateLabel,
  ageLabel,
}: {
  dateLabel: string;
  ageLabel: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap rounded-full bg-amber-500 px-2.5 py-[3px] font-mono tabular-nums">
      <span className="text-[12px] font-semibold text-white">{dateLabel}</span>
      <span className="text-[11.5px] font-medium text-white/85">
        · {spellAge(ageLabel)}
      </span>
    </span>
  );
}

function SectionLabel({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-3">
        {title}
      </span>
      <span className="font-mono text-[11px] tabular-nums text-ink-3">
        · {count}
      </span>
    </div>
  );
}

