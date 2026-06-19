import type { ReactNode } from "react";
import Link from "next/link";
import { AddLoadButton } from "./dispatch/loads/AddLoadButton";
import type { PipelineCard } from "@/lib/dispatch/pipeline";
import type { MaintStatus } from "@/lib/dispatch/maintenance";
import { IntervalBar } from "./maintenance/IntervalBar";

/**
 * Owner Dashboard — opportunity inbox (render layer).
 *
 * Two sections only: incoming quote requests as colour-coded cards (red =
 * never opened, amber = sent 24h+ ago and needs follow-up), and job
 * applications in their own separate area below. Bulk cleanup lives on the
 * Quotes and Applications tabs, not here.
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
  expiredQuotes: ReadonlyArray<PipelineCard>;
  applications: ReadonlyArray<ApplicationItem>;
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

const EXP_GRID =
  "160px 176px 150px 160px 130px 88px 66px 120px minmax(0,1fr)";

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

type ApplicationItem = {
  id: string;
  name: string;
  equipment: string;
  experience: string;
  phone: string;
  email: string;
  homeBase: string;
  ageLabel: string;
  dateLabel: string;
};

export function DashboardView({ data }: { data: DashboardData }) {
  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
        <SectionLabel title="Job applications" count={data.applications.length} />

        {data.applications.length === 0 ? (
          <EmptyCard text="No applications yet." />
        ) : (
          // Same presentation as the Active loads list below: one card
          // container, fluid flex rows that stack vertically and never scroll
          // sideways. Primary + secondary detail on the left, the received
          // date pill on the right.
          <div className="overflow-hidden rounded-xl border border-line bg-card shadow-md">
            {data.applications.map((a, i) => {
              const spec = [a.equipment, a.experience, a.homeBase]
                .filter((s) => s && s !== "—")
                .join(" · ");
              const contact = [a.phone, a.email]
                .filter((s) => s && s !== "—")
                .join(" · ");
              return (
                <Link
                  key={a.id}
                  href={"/admin/applications/" + a.id}
                  prefetch={false}
                  className={
                    "flex items-center justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-elevated " +
                    (i === data.applications.length - 1
                      ? ""
                      : "border-b border-line")
                  }
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-fg">
                      {a.name}
                    </span>
                    {spec ? (
                      <span className="block truncate text-[11px] text-fg-muted">
                        {spec}
                      </span>
                    ) : null}
                    {contact ? (
                      <span className="block truncate font-mono text-[11px] text-blue-700">
                        {contact}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0">
                    <DatePill dateLabel={a.dateLabel} ageLabel={a.ageLabel} />
                  </span>
                </Link>
              );
            })}
          </div>
        )}

        <div className="my-5 h-px bg-line" />
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
              <Link
                key={l.id}
                href={"/admin/dispatch/loads/" + l.id}
                prefetch={false}
                className={
                  "flex items-center justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-elevated " +
                  (i === data.activeLoads.length - 1 ? "" : "border-b border-line")
                }
              >
                <span className="flex min-w-0 items-center gap-2.5">
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
              <Link
                href="/admin/maintenance"
                prefetch={false}
                className="block px-3.5 py-2 text-center font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-indigo-600 transition-colors hover:bg-elevated"
              >
                View full schedule →
              </Link>
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
            <div className="overflow-hidden rounded-xl border border-line bg-card shadow-md">
              <ListHeader grid={EXP_GRID}>
                <span>Customer</span>
                <span>Expired</span>
                <span>Origin</span>
                <span>Destination</span>
                <span>Commodity</span>
                <span>Weight</span>
                <span>Miles</span>
                <span>Price</span>
                <span />
              </ListHeader>
              {data.expiredQuotes.map((q, i) => (
                <Link
                  key={q.leadId}
                  href={"/admin/quotes/" + q.leadId}
                  prefetch={false}
                  className={
                    "grid items-center gap-3 px-3.5 py-2 text-[12.5px] transition-colors hover:bg-elevated " +
                    (i === data.expiredQuotes.length - 1
                      ? ""
                      : "border-b border-line")
                  }
                  style={{ gridTemplateColumns: EXP_GRID }}
                >
                  <span className="truncate font-semibold text-fg">{q.name}</span>
                  <span>
                    <DatePill dateLabel={q.dateLabel} ageLabel={q.ageLabel} />
                  </span>
                  <span className="truncate font-mono text-blue-700">
                    {q.originZip}
                    {q.originPlace ? (
                      <span className="text-fg-muted"> · {q.originPlace}</span>
                    ) : null}
                  </span>
                  <span className="truncate font-mono text-blue-700">
                    {q.destZip}
                    {q.destPlace ? (
                      <span className="text-fg-muted"> · {q.destPlace}</span>
                    ) : null}
                  </span>
                  <span className="truncate text-fg">{q.commodity}</span>
                  <span className="font-mono tabular-nums text-fg-muted">
                    {q.weight}
                  </span>
                  <span className="font-mono tabular-nums text-fg-muted">
                    {q.miles != null
                      ? Math.round(q.miles).toLocaleString() + " mi"
                      : "—"}
                  </span>
                  <span className="whitespace-nowrap font-bold tabular-nums text-green-700">
                    {q.priceDisplay ?? "—"}
                  </span>
                  <span />
                </Link>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ListHeader({
  grid,
  children,
}: {
  grid: string;
  children: ReactNode;
}) {
  return (
    <div
      className="grid items-center gap-3 bg-bar px-3.5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-bar-fg"
      style={{ gridTemplateColumns: grid }}
    >
      {children}
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

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-card px-4 py-6 text-center font-mono text-[12px] text-fg-subtle">
      {text}
    </div>
  );
}
