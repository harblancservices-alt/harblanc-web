import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { AddLoadButton } from "./dispatch/loads/AddLoadButton";
import { ActiveLoadDocButton } from "./ActiveLoadDocActions";
import { OdometerStatusCard } from "./dispatch/loads/[id]/OdometerStatusCard";
import type { PipelineCard } from "@/lib/dispatch/pipeline";
import type { MaintStatus } from "@/lib/dispatch/maintenance";
import { IntervalBar } from "./maintenance/IntervalBar";

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
};

const MAINT_PILL: Record<MaintStatus, string> = {
  overdue: "bg-red-100 text-red-700",
  soon: "bg-amber-100 text-amber-700",
  ok: "bg-green-100 text-green-700",
  baseline: "bg-blue-100 text-blue-700",
};
const MAINT_LABEL: Record<MaintStatus, string> = {
  overdue: "Overdue",
  soon: "Due soon",
  ok: "OK",
  baseline: "Set baseline",
};

function maintRemaining(m: MaintWidgetItem): { text: string; color: string } {
  if (m.milesRemaining == null) {
    return { text: "no baseline", color: "text-blue-700" };
  }
  if (m.milesRemaining <= 0) {
    return {
      text: `${Math.abs(m.milesRemaining).toLocaleString()} mi over`,
      color: "text-red-700",
    };
  }
  return {
    text: `${m.milesRemaining.toLocaleString()} mi left`,
    color: m.status === "soon" ? "text-amber-700" : "text-green-700",
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

const LOAD_STATUS_PILL: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  assigned: "bg-amber-100 text-amber-700",
  loaded: "bg-blue-100 text-blue-700",
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
      <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
        <SectionLabel title="Active loads" count={data.activeLoads.length} />
        {data.activeLoads.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-card px-4 py-10 text-center">
            <p className="font-mono text-[12px] text-fg-subtle">
              No active loads.
            </p>
            <AddLoadButton
              brokerNames={data.brokerNames}
              activeTrips={data.activeTrips}
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-card shadow-md">
            {data.activeLoads.map((l, i) => (
              <div
                key={l.id}
                className={
                  "px-3.5 py-2.5 " +
                  (i === data.activeLoads.length - 1 ? "" : "border-b border-line")
                }
              >
                {/* Whole top info area opens the load — broker, lane AND the
                    rate are one big tap target. The odometer + doc buttons
                    below are separate siblings, so their own controls run
                    without navigating. */}
                <Link
                  href={"/admin/dispatch/loads/" + l.id}
                  prefetch={false}
                  className="-mx-1 flex items-center justify-between gap-3 rounded-md px-1 py-1 transition-colors hover:bg-elevated"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2.5">
                    <span
                      className={
                        "shrink-0 rounded-sm px-1.5 py-[1px] font-mono text-[10px] font-bold uppercase tracking-[0.06em] " +
                        (LOAD_STATUS_PILL[l.status] ?? "bg-elevated text-fg-muted")
                      }
                    >
                      {LOAD_STATUS_LABEL[l.status] ?? l.status}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-fg">
                        {l.broker}
                      </span>
                      <span className="block truncate text-[11px] text-fg-muted">
                        {l.lane}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[13px] font-bold tabular-nums text-green-700">
                    {l.rateDisplay}
                  </span>
                </Link>

                {/* Inline odometer — the EXACT same component + action the load
                    page uses, so the two always mirror. Collapsed by default;
                    the pencil opens straight into the odometer entry. Sits
                    ABOVE the doc buttons. */}
                <div className="mt-2.5">
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

                {/* Three doc-upload buttons — same multi-file flow + action as
                    the load page, one per kind. Moved to the bottom, below the
                    odometer. */}
                <div className="mt-2.5 grid grid-cols-3 gap-2">
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

        {data.maintenance.length > 0 ? (
          <>
            <div className="my-5 h-px bg-line" />
            <SectionLabel
              title="Truck maintenance"
              count={data.maintenance.length}
            />
            <div className="overflow-hidden rounded-xl border border-line bg-card shadow-md">
              {data.maintenance.map((m) => {
                const rem = maintRemaining(m);
                return (
                  <Link
                    key={m.id}
                    href="/admin/maintenance"
                    prefetch={false}
                    className="block border-b border-line px-3.5 py-2.5 transition-colors hover:bg-elevated"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={
                            "shrink-0 rounded-sm px-1.5 py-[1px] font-mono text-[10px] font-bold uppercase tracking-[0.06em] " +
                            MAINT_PILL[m.status]
                          }
                        >
                          {MAINT_LABEL[m.status]}
                        </span>
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
                  className="block rounded-md border border-line bg-card p-3 shadow-sm transition-colors hover:bg-elevated"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 rounded-sm bg-amber-100 px-1.5 py-[1px] font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-amber-700">
                        Expired
                      </span>
                      <h3 className="truncate text-[14px] font-semibold text-fg">
                        {q.name}
                      </h3>
                    </span>
                    <span className="shrink-0 font-mono text-[15px] font-bold tabular-nums text-green-700">
                      {q.priceDisplay ?? "—"}
                    </span>
                  </div>

                  <p className="mt-1 truncate font-mono text-[12px] tabular-nums text-fg-muted">
                    <span className="text-blue-700">{q.originZip}</span>
                    {q.originPlace ? (
                      <span> · {q.originPlace}</span>
                    ) : null}
                    <span className="text-fg-subtle"> → </span>
                    <span className="text-blue-700">{q.destZip}</span>
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
    return (
      <div className="flex items-center justify-center gap-1.5 border-b border-line bg-elevated px-4 py-1.5">
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-green-500"
        />
        <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-fg-subtle">
          All clear · no new applications or quote requests
        </span>
      </div>
    );
  }

  const segments: ReactNode[] = [];
  if (newApplications > 0) {
    segments.push(
      <Link
        key="apps"
        href="/admin/applications"
        prefetch={false}
        className="whitespace-nowrap underline-offset-2 hover:underline"
      >
        <span className="font-bold tabular-nums">{newApplications}</span> new job
        application{newApplications === 1 ? "" : "s"}
      </Link>,
    );
  }
  if (newQuotes > 0) {
    segments.push(
      <Link
        key="quotes"
        href="/admin/quotes"
        prefetch={false}
        className="whitespace-nowrap underline-offset-2 hover:underline"
      >
        <span className="font-bold tabular-nums">{newQuotes}</span> new quote
        request{newQuotes === 1 ? "" : "s"}
      </Link>,
    );
  }

  return (
    <div
      role="alert"
      className="border-b border-red-800 bg-red-600 text-white shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px] font-semibold">
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-white/85">
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
            className="h-3.5 w-3.5"
          >
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"
              clipRule="evenodd"
            />
          </svg>
          Needs attention
        </span>
        {segments.map((seg, i) => (
          <span key={i} className="inline-flex items-center gap-3">
            {i > 0 ? (
              <span aria-hidden className="text-white/50">
                ·
              </span>
            ) : null}
            {seg}
          </span>
        ))}
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
      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-600">
        {title}
      </span>
      <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
        · {count}
      </span>
    </div>
  );
}

