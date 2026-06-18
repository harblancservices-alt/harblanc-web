import type { ReactNode } from "react";
import Link from "next/link";
import { AddLoadButton } from "./dispatch/loads/AddLoadButton";
import type { PipelineCard } from "@/lib/dispatch/pipeline";

/**
 * Owner Dashboard — opportunity inbox (render layer).
 *
 * Two sections only: incoming quote requests as colour-coded cards (red =
 * never opened, amber = sent 24h+ ago and needs follow-up), and job
 * applications in their own separate area below. Bulk cleanup lives on the
 * Quotes and Applications tabs, not here.
 */

export type DashboardData = {
  expiredQuotes: ReadonlyArray<PipelineCard>;
  applications: ReadonlyArray<ApplicationItem>;
  activeLoads: ReadonlyArray<ActiveLoadItem>;
  brokerNames: ReadonlyArray<string>;
  activeTrips: ReadonlyArray<string>;
};

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

const APP_GRID =
  "180px 120px 44px 140px 200px 150px 230px minmax(0,1fr)";
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
          <div className="overflow-hidden rounded-xl border border-line bg-card shadow-md">
            <ListHeader grid={APP_GRID}>
              <span>Applicant</span>
              <span>Equipment</span>
              <span>Exp</span>
              <span>Phone</span>
              <span>Email</span>
              <span>Home base</span>
              <span>Received</span>
              <span />
            </ListHeader>
            {data.applications.map((a, i) => (
              <Link
                key={a.id}
                href={"/admin/applications/" + a.id}
                prefetch={false}
                className={
                  "grid items-center gap-3 px-3.5 py-2 text-[12.5px] transition-colors hover:bg-elevated " +
                  (i === data.applications.length - 1 ? "" : "border-b border-line")
                }
                style={{ gridTemplateColumns: APP_GRID }}
              >
                <span className="truncate font-semibold text-fg">{a.name}</span>
                <span className="truncate text-fg">{a.equipment}</span>
                <span className="truncate font-mono text-fg-muted">
                  {a.experience}
                </span>
                <span className="truncate font-mono text-blue-700">
                  {a.phone}
                </span>
                <span className="truncate text-blue-700">{a.email}</span>
                <span className="truncate text-fg-muted">{a.homeBase}</span>
                <span className="flex justify-start">
                  <DatePill dateLabel={a.dateLabel} ageLabel={a.ageLabel} />
                </span>
                <span />
              </Link>
            ))}
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
