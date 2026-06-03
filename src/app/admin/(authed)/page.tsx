import type { Metadata } from "next";
import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { formatTimestampShort, relativeTime } from "@/lib/admin/format";
import {
  LEAD_STATUS_LABELS,
  type LeadStatus,
} from "@/lib/dispatch/status";
import {
  computeUrgency,
  topUrgency,
  URGENCY_SEVERITY_CLASSES_LIGHT,
  type UrgencyChip,
} from "@/lib/dispatch/urgency";
import { validateEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: "Dispatch center",
  robots: { index: false, follow: false },
};

/**
 * Dispatch operations home — a dispatcher-first command center.
 *
 * Operational priority order on the page:
 *
 *   1. Needs attention   — any lead with a live urgency chip, ranked
 *      by severity then age. This is "what's broken or going stale".
 *
 *   2. Status buckets    — every active lead grouped by lead_status.
 *      Lean lists, lead-status as the spine of the funnel. Each row
 *      shows name, lane, time-in-status, and (if applicable) the
 *      top urgency chip for that lead.
 *
 *   3. Recent intake     — applications + raw quote feed for quick
 *      situational awareness. Lives at the bottom; the funnel above
 *      is where dispatch lives.
 *
 * Designed to be glanceable on a phone. No charts, no analytics.
 */

type LeadRow = {
  id: string;
  name: string;
  created_at: string;
  lead_status: LeadStatus;
  lead_status_updated_at: string | null;
  pickup_zip: string | null;
  delivery_zip: string | null;
  commodity: string;
  assigned_dispatcher: string | null;
  assigned_carrier: string | null;
};

type EstimateAgg = { quote_request_id: string; sent_at: string | null };
type FqAgg = { quote_request_id: string; sent_at: string | null };
type BolAgg = { quote_request_id: string; sent_at: string | null };
type IntakeAgg = {
  dispatch_estimate_id: string;
  status: "in_progress" | "submitted";
  created_at: string;
  submitted_at: string | null;
};
type EstimateForIntake = { id: string; quote_request_id: string };
type AppRecent = {
  id: string;
  created_at: string;
  name: string;
  equipment_type: string;
  cdl_status: string;
};

type EnrichedLead = {
  row: LeadRow;
  urgency: UrgencyChip[];
  top: UrgencyChip | null;
  intakeStartedAt: string | null;
  intakeSubmittedAt: string | null;
};

/**
 * Buckets shown on the funnel grid. The list is intentionally narrow —
 * archived / lost leads don't surface here because they're not
 * actionable. They live in /admin/quotes with the appropriate filter.
 */
const BUCKETS: { key: LeadStatus | "in_motion"; label: string; members: LeadStatus[] }[] = [
  { key: "new", label: "New", members: ["new"] },
  { key: "contacted", label: "Contacted", members: ["contacted"] },
  { key: "estimate_sent", label: "Estimate sent", members: ["estimate_sent"] },
  {
    key: "awaiting_confirmation",
    label: "Awaiting confirm",
    members: ["awaiting_confirmation"],
  },
  {
    key: "awaiting_payment",
    label: "Awaiting pay",
    members: ["awaiting_payment"],
  },
  {
    key: "ready_to_dispatch",
    label: "Ready to dispatch",
    members: ["ready_to_dispatch"],
  },
  {
    key: "in_motion",
    label: "In motion",
    members: ["dispatched", "picked_up", "in_transit"],
  },
  { key: "delivered", label: "Delivered", members: ["delivered"] },
];

async function loadOps() {
  const sb = createServiceRoleClient();
  const now = new Date();

  // 1. Active leads — exclude archived/lost so the home isn't cluttered.
  const ACTIVE_STATUSES: LeadStatus[] = [
    "new",
    "contacted",
    "estimate_sent",
    "awaiting_confirmation",
    "awaiting_payment",
    "ready_to_dispatch",
    "dispatched",
    "picked_up",
    "in_transit",
    "delivered",
  ];

  const { data: leadRows } = await sb
    .from("quote_requests")
    .select(
      "id, name, created_at, lead_status, lead_status_updated_at, pickup_zip, delivery_zip, commodity, assigned_dispatcher, assigned_carrier",
    )
    .is("deleted_at", null)
    .in("lead_status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false })
    .returns<LeadRow[]>();

  const leads = leadRows ?? [];
  const leadIds = leads.map((l) => l.id);

  // 2. Aggregations to feed the urgency helper. Empty-leads short-circuit.
  const [
    { data: estimateAgg },
    { data: fqAgg },
    { data: bolAgg },
    { data: estimateForIntake },
    { data: appRows },
  ] = leadIds.length === 0
    ? [
        { data: [] as EstimateAgg[] },
        { data: [] as FqAgg[] },
        { data: [] as BolAgg[] },
        { data: [] as EstimateForIntake[] },
        { data: [] as AppRecent[] },
      ]
    : await Promise.all([
        sb
          .from("dispatch_estimates")
          .select("quote_request_id, sent_at")
          .in("quote_request_id", leadIds)
          .not("sent_at", "is", null)
          .order("sent_at", { ascending: false })
          .returns<EstimateAgg[]>(),
        sb
          .from("finalized_quotes")
          .select("quote_request_id, sent_at")
          .in("quote_request_id", leadIds)
          .not("sent_at", "is", null)
          .order("sent_at", { ascending: false })
          .returns<FqAgg[]>(),
        sb
          .from("bills_of_lading")
          .select("quote_request_id, sent_at")
          .in("quote_request_id", leadIds)
          .not("sent_at", "is", null)
          .order("sent_at", { ascending: false })
          .returns<BolAgg[]>(),
        sb
          .from("dispatch_estimates")
          .select("id, quote_request_id")
          .in("quote_request_id", leadIds)
          .returns<EstimateForIntake[]>(),
        sb
          .from("applications")
          .select("id, created_at, name, equipment_type, cdl_status")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(5)
          .returns<AppRecent[]>(),
      ]);

  // Latest sent_at per lead. Lists are ordered desc; first wins.
  const latestEstimate = new Map<string, string>();
  for (const r of estimateAgg ?? []) {
    if (r.sent_at && !latestEstimate.has(r.quote_request_id)) {
      latestEstimate.set(r.quote_request_id, r.sent_at);
    }
  }
  const latestFq = new Map<string, string>();
  for (const r of fqAgg ?? []) {
    if (r.sent_at && !latestFq.has(r.quote_request_id)) {
      latestFq.set(r.quote_request_id, r.sent_at);
    }
  }
  const latestBol = new Map<string, string>();
  for (const r of bolAgg ?? []) {
    if (r.sent_at && !latestBol.has(r.quote_request_id)) {
      latestBol.set(r.quote_request_id, r.sent_at);
    }
  }

  // Intake state — fetch intake rows for the estimate IDs we just saw,
  // then map back to the lead.
  const estimateIdToLead = new Map<string, string>();
  for (const r of estimateForIntake ?? []) {
    estimateIdToLead.set(r.id, r.quote_request_id);
  }
  const estimateIds = Array.from(estimateIdToLead.keys());

  let intakeRows: IntakeAgg[] = [];
  if (estimateIds.length > 0) {
    const { data } = await sb
      .from("shipment_intake")
      .select("dispatch_estimate_id, status, created_at, submitted_at")
      .in("dispatch_estimate_id", estimateIds)
      .returns<IntakeAgg[]>();
    intakeRows = data ?? [];
  }

  // intakeStarted: any intake row for the lead with a created_at.
  // intakeSubmitted: most recent submitted intake.
  const intakeStarted = new Map<string, string>();
  const intakeSubmitted = new Map<string, string>();
  for (const r of intakeRows) {
    const leadId = estimateIdToLead.get(r.dispatch_estimate_id);
    if (!leadId) continue;
    if (!intakeStarted.has(leadId)) {
      intakeStarted.set(leadId, r.created_at);
    }
    if (r.submitted_at && !intakeSubmitted.has(leadId)) {
      intakeSubmitted.set(leadId, r.submitted_at);
    }
  }

  // 3. Build enriched list.
  const enriched: EnrichedLead[] = leads.map((row) => {
    const urgency = computeUrgency({
      leadStatus: row.lead_status,
      createdAt: row.created_at,
      latestEstimateSentAt: latestEstimate.get(row.id) ?? null,
      intakeStartedAt: intakeStarted.get(row.id) ?? null,
      intakeSubmittedAt: intakeSubmitted.get(row.id) ?? null,
      latestFinalizedSentAt: latestFq.get(row.id) ?? null,
      latestBolSentAt: latestBol.get(row.id) ?? null,
      leadStatusUpdatedAt: row.lead_status_updated_at,
      now,
    });
    return {
      row,
      urgency,
      top: topUrgency(urgency),
      intakeStartedAt: intakeStarted.get(row.id) ?? null,
      intakeSubmittedAt: intakeSubmitted.get(row.id) ?? null,
    };
  });

  // Pre-compute "new today" here so the page render stays pure (no
  // Date.now() at component-render time).
  const dayAgo = now.getTime() - 24 * 60 * 60 * 1000;
  const newToday = enriched.filter(
    (e) => new Date(e.row.created_at).getTime() >= dayAgo,
  ).length;

  return {
    enriched,
    recentApps: appRows ?? [],
    envIssues: validateEnv(),
    newToday,
  };
}

export default async function DashboardPage() {
  const ops = await loadOps();

  const attention = ops.enriched
    .filter((e) => e.top !== null)
    .sort((a, b) => {
      const sevA = a.top!.severity === "alert" ? 0 : 1;
      const sevB = b.top!.severity === "alert" ? 0 : 1;
      if (sevA !== sevB) return sevA - sevB;
      return b.top!.ageHours - a.top!.ageHours;
    });

  const totalActive = ops.enriched.length;
  const newToday = ops.newToday;
  const needsAttn = attention.length;
  const inMotion = ops.enriched.filter((e) =>
    ["dispatched", "picked_up", "in_transit"].includes(e.row.lead_status),
  ).length;

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        {/* Env status banner */}
        {ops.envIssues.length > 0 ? <EnvBanner issues={ops.envIssues} /> : null}

        {/* Header — single bold line, no eyebrow */}
        <header className="flex items-end justify-between gap-4 border-b-2 border-zinc-300 pb-5">
          <h1 className="text-3xl font-display font-bold tracking-tight text-black sm:text-4xl lg:text-5xl">
            Dispatch center
          </h1>
          <p className="hidden font-mono text-xs tracking-[0.18em] text-zinc-600 uppercase sm:block">
            {totalActive} active &middot; {newToday} new today
          </p>
        </header>

        {/* Stats strip — 4 counters in a row across the top */}
        <div className="mt-6 grid grid-cols-2 gap-px border border-zinc-300 bg-zinc-300 sm:grid-cols-4">
          <Counter label="Active leads" value={totalActive} href="/admin/quotes" />
          <Counter label="New today" value={newToday} href="/admin/quotes" />
          <Counter
            label="Needs attention"
            value={needsAttn}
            accent={needsAttn > 0 ? "alert" : undefined}
          />
          <Counter label="In motion" value={inMotion} />
        </div>

        {/* Action queue — featured beige spotlight when 1-5 active leads.
            Pulls the actual work to the top so the dispatcher doesn't
            scan 8 funnel stages to find what's live. */}
        {totalActive > 0 && totalActive < 6 ? (
          <section className="mt-10">
            <header className="flex items-baseline justify-between border-b-2 border-zinc-300 pb-3">
              <h2 className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-black">
                <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
                Action queue
              </h2>
              <p className="font-mono text-[11px] tracking-[0.18em] text-red-700 uppercase">
                {totalActive} live
              </p>
            </header>
            <ul className="mt-4 divide-y divide-black/10 border border-black/30 border-l-4 border-l-red-600 bg-[#dcd5c2]">
              {ops.enriched.map((e) => (
                <li key={e.row.id}>
                  <Link
                    href={`/admin/quotes/${e.row.id}`}
                    className="block px-4 py-3 transition-colors hover:bg-[#cfc6b0]"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <div className="flex min-w-0 items-baseline gap-3">
                        <span className="truncate text-base font-bold text-black">
                          {e.row.name}
                        </span>
                        <span className="font-mono text-sm text-zinc-700">
                          {e.row.pickup_zip && e.row.delivery_zip
                            ? `${e.row.pickup_zip} → ${e.row.delivery_zip}`
                            : "Lane TBD"}
                        </span>
                        <span className="font-mono text-[11px] font-bold tracking-[0.18em] text-red-700 uppercase">
                          {LEAD_STATUS_LABELS[e.row.lead_status]}
                        </span>
                      </div>
                      <span className="font-mono text-xs tracking-[0.12em] text-zinc-600 uppercase shrink-0">
                        {e.row.lead_status_updated_at
                          ? relativeTime(e.row.lead_status_updated_at)
                          : relativeTime(e.row.created_at)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Needs attention — only when there are urgent leads */}
        {attention.length > 0 ? (
          <section className="mt-10">
            <header className="flex items-baseline justify-between border-b-2 border-zinc-300 pb-3">
              <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-black">
                Needs attention
              </h2>
              <p className="font-mono text-[11px] tracking-[0.18em] text-red-700 uppercase">
                {attention.length} flagged
              </p>
            </header>
            <ul className="mt-4 divide-y divide-zinc-200 border border-zinc-300 border-l-4 border-l-red-600 bg-white">
              {attention.slice(0, 8).map((e) => (
                <LeadRowItem key={e.row.id} enriched={e} showStatus />
              ))}
            </ul>
          </section>
        ) : null}

        {/* Active funnel — horizontal kanban. Each bucket becomes a
            column. Empty columns dim, populated columns get a red top
            accent and a stacked card list. Mobile: horizontal scroll
            via overflow-x-auto. Desktop: 8 columns fit in the max-w-7xl. */}
        <section className="mt-10">
          <header className="flex items-baseline justify-between border-b-2 border-zinc-300 pb-3">
            <h2 className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-black">
              <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
              Active funnel
            </h2>
            <p className="font-mono text-[11px] tracking-[0.18em] text-zinc-600 uppercase">
              Lane status board
            </p>
          </header>
          <div className="mt-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className="flex min-w-[900px] gap-2 lg:min-w-0">
              {BUCKETS.map((bucket) => {
                const inBucket = ops.enriched.filter((e) =>
                  bucket.members.includes(e.row.lead_status),
                );
                return (
                  <KanbanColumn
                    key={bucket.key}
                    label={bucket.label}
                    leads={inBucket}
                  />
                );
              })}
            </div>
          </div>
        </section>

        {/* Recent applications — bottom strip */}
        <section className="mt-10 mb-2">
          <header className="flex items-baseline justify-between border-b-2 border-zinc-300 pb-3">
            <h2 className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-black">
              <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
              Recent applications
            </h2>
            <p className="font-mono text-[11px] tracking-[0.18em] text-zinc-600 uppercase">
              {ops.recentApps.length} recent
            </p>
          </header>
          <ul className="mt-4 divide-y divide-zinc-200 border border-zinc-300 bg-white">
            {ops.recentApps.length === 0 ? (
              <li className="px-4 py-3 text-sm text-zinc-600">No incoming applications.</li>
            ) : (
              ops.recentApps.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/admin/applications/${r.id}`}
                    className="block px-4 py-2.5 transition-colors hover:bg-zinc-100"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-black">{r.name}</span>
                      <span className="font-mono text-xs tracking-[0.12em] text-zinc-600 uppercase shrink-0">
                        {formatTimestampShort(r.created_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-xs tracking-[0.12em] text-zinc-600 uppercase">
                      {[r.equipment_type, r.cdl_status].filter(Boolean).join(" · ")}
                    </p>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}

// ─── components ─────────────────────────────────────────────────────────────────────────────

function Counter({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: number;
  href?: string;
  accent?: "alert";
}) {
  const valueColor =
    accent === "alert" && value > 0
      ? "text-red-600"
      : value > 0
        ? "text-black"
        : "text-zinc-400";
  const inner = (
    <>
      <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-700">
        <span aria-hidden className="inline-block h-3 w-[3px] shrink-0 bg-red-600" />
        {label}
      </p>
      <p className={"mt-2 font-display text-4xl font-bold tabular-nums tracking-tight " + valueColor}>
        {value}
      </p>
    </>
  );
  const baseCls =
    "block bg-white px-4 py-5 sm:px-5 sm:py-6 " +
    (href ? "transition-colors hover:bg-zinc-100" : "");
  if (href) {
    return (
      <Link href={href} className={baseCls}>
        {inner}
      </Link>
    );
  }
  return <div className={baseCls}>{inner}</div>;
}

/**
 * KanbanColumn — one vertical column per funnel stage. Empty columns
 * collapse to a thin dim header. Populated columns get a red top
 * accent bar and a stacked list of compact cards.
 */
function KanbanColumn({ label, leads }: { label: string; leads: EnrichedLead[] }) {
  const isEmpty = leads.length === 0;
  return (
    <section
      className={
        "flex min-h-[200px] w-[140px] shrink-0 flex-col border bg-white sm:w-[160px] lg:w-auto lg:flex-1 " +
        (isEmpty ? "border-zinc-200" : "border-red-600 shadow-[0_2px_8px_-2px_rgba(220,38,38,0.18)]")
      }
    >
      {/* Top accent bar — thicker + red for populated, dim hairline for empty */}
      <div className={isEmpty ? "h-[3px] w-full bg-zinc-200" : "h-[3px] w-full bg-red-600"} />
      {/* Header — min-h locks every column header to the same height so
          short labels and longer labels still align at the bottom rule */}
      <header
        className={
          "flex min-h-[42px] items-center justify-between border-b border-zinc-200 px-3 " +
          (isEmpty ? "bg-zinc-50" : "bg-red-50")
        }
      >
        <h3
          className={
            "font-mono text-[10px] font-bold uppercase tracking-[0.16em] leading-tight " +
            (isEmpty ? "text-zinc-500" : "text-black")
          }
        >
          {label}
        </h3>
        <span
          className={
            "ml-2 font-mono text-xs font-bold tabular-nums " +
            (isEmpty ? "text-zinc-400" : "text-red-700")
          }
        >
          {leads.length}
        </span>
      </header>
      <ul className="flex flex-1 flex-col divide-y divide-zinc-200">
        {isEmpty ? (
          <li className="flex flex-1 items-center justify-center px-3 py-4 font-mono text-[10px] tracking-[0.18em] text-zinc-300 uppercase">
            —
          </li>
        ) : (
          leads.map((e) => <KanbanCard key={e.row.id} enriched={e} />)
        )}
      </ul>
    </section>
  );
}

/**
 * Compact card for the kanban columns. Name, lane, time-in-status,
 * and the top urgency chip if any.
 */
function KanbanCard({ enriched }: { enriched: EnrichedLead }) {
  const { row, top } = enriched;
  const lane =
    row.pickup_zip && row.delivery_zip
      ? `${row.pickup_zip} → ${row.delivery_zip}`
      : "Lane TBD";
  const sinceStatus = row.lead_status_updated_at
    ? relativeTime(row.lead_status_updated_at)
    : relativeTime(row.created_at);
  return (
    <li>
      <Link
        href={`/admin/quotes/${row.id}`}
        className="block px-3 py-3 transition-colors hover:bg-zinc-50"
      >
        <p className="truncate text-sm font-bold text-black">{row.name}</p>
        <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-700">{lane}</p>
        <p className="mt-1 font-mono text-[10px] tracking-[0.12em] text-zinc-500 uppercase">
          {sinceStatus}
        </p>
        {top ? (
          <span
            className={
              "mt-2 inline-flex items-center border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.12em] uppercase " +
              URGENCY_SEVERITY_CLASSES_LIGHT[top.severity]
            }
          >
            {top.label}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

/**
 * LeadRowItem — used by the Needs attention list (when populated).
 * Wide row layout with status + urgency chips inline.
 */
function LeadRowItem({
  enriched,
  showStatus = false,
}: {
  enriched: EnrichedLead;
  showStatus?: boolean;
}) {
  const { row, top } = enriched;
  const lane =
    row.pickup_zip && row.delivery_zip
      ? `${row.pickup_zip} → ${row.delivery_zip}`
      : "Lane TBD";
  const sinceStatus = row.lead_status_updated_at
    ? relativeTime(row.lead_status_updated_at)
    : relativeTime(row.created_at);
  return (
    <li>
      <Link
        href={`/admin/quotes/${row.id}`}
        className="block px-4 py-3 transition-colors hover:bg-zinc-100"
      >
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-sm font-semibold text-black">
              {row.name}
            </span>
            <span className="font-mono text-xs text-zinc-700">{lane}</span>
          </div>
          <span className="font-mono text-xs tracking-[0.12em] text-zinc-600 uppercase shrink-0">
            {sinceStatus}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {showStatus ? (
            <span className="font-mono text-xs font-bold tracking-[0.18em] text-red-700 uppercase">
              {LEAD_STATUS_LABELS[row.lead_status]}
            </span>
          ) : null}
          {top ? (
            <span
              className={
                "inline-flex items-center border px-2 py-0.5 font-mono text-xs tracking-[0.12em] uppercase " +
                URGENCY_SEVERITY_CLASSES_LIGHT[top.severity]
              }
            >
              {top.label}
            </span>
          ) : null}
          {row.assigned_dispatcher || row.assigned_carrier ? (
            <span className="font-mono text-xs tracking-[0.12em] text-zinc-600 uppercase">
              {row.assigned_dispatcher || ""}
              {row.assigned_dispatcher && row.assigned_carrier ? " · " : ""}
              {row.assigned_carrier || ""}
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

function EnvBanner({ issues }: { issues: string[] }) {
  return (
    <div className="mb-6 border border-amber-300 bg-amber-50 p-4">
      <p className="font-mono text-[11px] font-bold tracking-[0.22em] text-amber-800 uppercase">
        System check
      </p>
      <p className="mt-2 text-sm leading-relaxed text-amber-900">
        Missing or invalid environment configuration. Some features may not
        work until these are set:
      </p>
      <ul className="mt-2 list-inside list-disc font-mono text-xs leading-relaxed text-amber-800">
        {issues.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}
