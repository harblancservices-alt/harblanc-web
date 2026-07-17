import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { StatusTag, type StatusTone } from "@/components/ui/StatusTag";
import { AddLoadButton } from "./dispatch/loads/AddLoadButton";
import { FarmBrokerContactCard } from "./FarmBrokerContactCard";
import { ActiveLoadDocButton } from "./ActiveLoadDocActions";
import { OdometerStatusCard } from "./dispatch/loads/[id]/OdometerStatusCard";
import type { PipelineCard } from "@/lib/dispatch/pipeline";
import type { MaintStatus } from "@/lib/dispatch/maintenance";
import type { CountdownGoal, NetPace } from "@/lib/dispatch/countdown";
import { IntervalBar } from "./maintenance/IntervalBar";
import { CountdownCards } from "./CountdownCards";

/**
 * Owner Dashboard — opportunity inbox (render layer).
 *
 * A slim alert bar sits at the very top: quiet/muted when nothing is waiting,
 * and a prominent red bar when there are new job applications and/or new
 * quote requests (each part deep-links to its tab). Below it: active loads,
 * the truck-maintenance widget, and the expired-quotes table.
 */

export type MaintWidgetItem = {
  id: string;
  name: string;
  status: MaintStatus;
  milesRemaining: number | null;
  pct: number;
  neverServiced: boolean;
};

export type DashboardData = {
  newApplicationCount: number;
  newQuoteCount: number;
  expiredQuotes: ReadonlyArray<PipelineCard>;
  activeLoads: ReadonlyArray<ActiveLoadItem>;
  maintenance: ReadonlyArray<MaintWidgetItem>;
  brokerNames: ReadonlyArray<string>;
  activeTrips: ReadonlyArray<string>;
  countdownGoals: ReadonlyArray<CountdownGoal>;
  netPace: NetPace;
  currentCash: number;
};

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

export type ActiveLoadItem = {
  id: string;
  broker: string;
  lane: string;
  status: string;
  rateDisplay: string;
  rateConCount: number;
  bolCount: number;
  podCount: number;
  odoAssigned: number | null;
  odoLoaded: number | null;
  odoDelivered: number | null;
};

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
      <AlertBar
        newApplications={data.newApplicationCount}
        newQuotes={data.newQuoteCount}
      />
      <div className="mx-auto w-full max-w-5xl px-4 pb-4 pt-2.5 sm:px-6 lg:px-8">
        <h1 className="mb-3 text-[22px] font-bold leading-tight text-ink">
          Dashboard
        </h1>

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

/**
 * Top-of-dashboard alert bar. Quiet/slim when nothing is waiting; a prominent
 * red bar the moment there's a new job application or a new quote request,
 * with each count deep-linking to its tab.
 */
function AlertBar({
  newApplications,
  newQuotes,
}: {
  newApplications: number;
  newQuotes: number;
}) {
  const hasAlerts = newApplications > 0 || newQuotes > 0;

  if (!hasAlerts) {
    // All clear — a friendly, positive green banner (not a bare gray line).
    return (
      <div className="flex items-center justify-center gap-2 border-b border-ok/25 bg-ok-bg px-4 py-2">
        <span
          aria-hidden
          className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-ok text-white shadow-sm"
        >
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
            className="h-3 w-3"
          >
            <path
              fillRule="evenodd"
              d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.5 7.6a1 1 0 0 1-1.42.006l-3.5-3.5a1 1 0 1 1 1.414-1.414l2.79 2.79 6.796-6.886a1 1 0 0 1 1.414-.006z"
              clipRule="evenodd"
            />
          </svg>
        </span>
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ok">
          All clear — you&apos;re caught up
        </span>
      </div>
    );
  }

  // Attention state — bolder, with a count badge per segment and a clear
  // tap affordance to the relevant tab.
  const segments: ReactNode[] = [];
  if (newApplications > 0) {
    segments.push(
      <AlertChip
        key="apps"
        href="/admin/operations?tab=applications"
        count={newApplications}
        label={`new job application${newApplications === 1 ? "" : "s"}`}
      />,
    );
  }
  if (newQuotes > 0) {
    segments.push(
      <AlertChip
        key="quotes"
        href="/admin/operations?tab=quotes"
        count={newQuotes}
        label={`new quote request${newQuotes === 1 ? "" : "s"}`}
      />,
    );
  }

  return (
    <div
      role="alert"
      className="border-b border-accent-hover bg-accent text-white shadow-e2"
    >
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4 py-2.5">
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-white/90">
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
            className="h-4 w-4"
          >
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"
              clipRule="evenodd"
            />
          </svg>
          Needs attention
        </span>
        {segments}
      </div>
    </div>
  );
}

/**
 * One tappable alert segment: a count badge + label pill that deep-links to
 * its tab, with a chevron affordance so it clearly reads as actionable.
 */
function AlertChip({
  href,
  count,
  label,
}: {
  href: string;
  count: number;
  label: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 py-1 pl-1 pr-2.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-white/25 active:bg-white/30"
    >
      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-[12px] font-bold tabular-nums text-accent">
        {count}
      </span>
      <span className="whitespace-nowrap">{label}</span>
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden
        className="h-3.5 w-3.5 text-white/70"
      >
        <path
          fillRule="evenodd"
          d="M7.21 4.29a1 1 0 0 1 1.42 0l5 5a1 1 0 0 1 0 1.42l-5 5a1 1 0 1 1-1.42-1.42L11.5 10 7.21 5.71a1 1 0 0 1 0-1.42z"
          clipRule="evenodd"
        />
      </svg>
    </Link>
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

