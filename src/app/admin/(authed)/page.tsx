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
    label: "Awaiting confirmation",
    members: ["awaiting_confirmation"],
  },
  {
    key: "awaiting_payment",
    label: "Awaiting payment",
    members: ["awaiting_payment"],
  },
  {
    key: "ready_to_dispatch",
    label: "Ready to dispatch",
    members: ["ready_to_dispatch"],
  },
  {
    key: "in_motion",
    label: "In motion (dispatched / picked up / in transit)",
    members: ["dispatched", "picked_up", "in_transit"],
  },
  { key: "delivered", label: "Delivered — close out", members: ["delivered"] },
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

  // Lead with any urgency chip — top of page, ranked alert→warn, age desc.
  const attention = ops.enriched
    .filter((e) => e.top !== null)
    .sort((a, b) => {
      const sevA = a.top!.severity === "alert" ? 0 : 1;
      const sevB = b.top!.severity === "alert" ? 0 : 1;
      if (sevA !== sevB) return sevA - sevB;
      return b.top!.ageHours - a.top!.ageHours;
    });

  // Counters
  const totalActive = ops.enriched.length;
  const newToday = ops.newToday;
  const needsAttn = attention.length;
  const inMotion = ops.enriched.filter((e) =>
    ["dispatched", "picked_up", "in_transit"].includes(e.row.lead_status),
  ).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      {/* Env status banner — only renders when there's a problem */}
      {ops.envIssues.length > 0 ? <EnvBanner issues={ops.envIssues} /> : null}

      <header>
        <p className="font-mono text-xs tracking-[0.12em] text-red-600 uppercase">
          Overview
        </p>
        <h1 className="mt-2 text-2xl font-display tracking-tight text-zinc-900 sm:text-3xl">
          Dispatch center
        </h1>
      </header>

      {/* Counters */}
      <div className="mt-6 grid grid-cols-2 border border-zinc-200 bg-white sm:grid-cols-4">
        <Counter label="Active leads" value={totalActive} href="/admin/quotes" />
        <Counter label="New today" value={newToday} href="/admin/quotes" divider />
        <Counter
          label="Needs attention"
          value={needsAttn}
          accent={needsAttn > 0 ? "alert" : undefined}
          divider
        />
        <Counter label="In motion" value={inMotion} divider />
      </div>

      {/* Needs attention */}
      {attention.length > 0 ? (
        <section className="mt-10">
          <header className="flex items-baseline justify-between">
            <h2 className="label-cap">
              Needs attention
            </h2>
            <p className="label-cap text-zinc-600">
              {attention.length} lead{attention.length === 1 ? "" : "s"}
            </p>
          </header>
          <ul className="mt-3 divide-y divide-zinc-200 border-y border-zinc-200 bg-white">
            {attention.slice(0, 8).map((e) => (
              <LeadRowItem key={e.row.id} enriched={e} showStatus />
            ))}
          </ul>
          {attention.length > 8 ? (
            <p className="mt-3 text-right label-cap text-zinc-600">
              + {attention.length - 8} more
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Funnel buckets */}
      <section className="mt-10">
        <h2 className="label-cap">
          Active funnel
        </h2>
        <div className="mt-4 space-y-6">
          {BUCKETS.map((bucket) => {
            const inBucket = ops.enriched.filter((e) =>
              bucket.members.includes(e.row.lead_status),
            );
            return <Bucket key={bucket.key} label={bucket.label} leads={inBucket} />;
          })}
        </div>
      </section>

      {/* Recent applications */}
      <section className="mt-10">
        <h2 className="label-cap text-zinc-600">
          Recent applications
        </h2>
        <ul className="mt-3 divide-y divide-zinc-200 border-y border-zinc-200 bg-white">
          {ops.recentApps.length === 0 ? (
            <li className="px-1 py-3 text-sm text-zinc-600">No incoming applications.</li>
          ) : (
            ops.recentApps.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/applications/${r.id}`}
                  className="block px-1 py-2.5 transition-colors hover:bg-zinc-100"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm text-zinc-900">{r.name}</span>
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
  );
}

// ─── components ──────────────────────────────────────────────────────────

function Counter({
  label,
  value,
  href,
  divider = false,
  accent,
}: {
  label: string;
  value: number;
  href?: string;
  divider?: boolean;
  accent?: "alert";
}) {
  const valueColor =
    accent === "alert" && value > 0
      ? "text-red-600"
      : value > 0
        ? "text-zinc-900"
        : "text-zinc-600";
  const inner = (
    <>
      <p className="label-cap">
        {label}
      </p>
      <p className={"mt-3 font-mono text-3xl tracking-tight " + valueColor}>
        {value}
      </p>
    </>
  );
  const baseCls =
    "block px-4 py-5 sm:px-5 sm:py-6 " +
    (divider ? "border-l border-zinc-200 " : "") +
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

function Bucket({ label, leads }: { label: string; leads: EnrichedLead[] }) {
  if (leads.length === 0) {
    return (
      <section className="border border-zinc-200 bg-zinc-50">
        <header className="flex items-baseline justify-between px-4 py-3">
          <h3 className="label-cap text-zinc-600">
            {label}
          </h3>
          <span className="font-mono text-xs tracking-[0.12em] text-zinc-500 uppercase">
            0
          </span>
        </header>
      </section>
    );
  }

  const visible = leads.slice(0, 5);
  const remaining = leads.length - visible.length;

  return (
    <section className="border border-zinc-200 bg-white">
      <header className="flex items-baseline justify-between border-b border-zinc-200 px-4 py-3">
        <h3 className="label-cap">
          {label}
        </h3>
        <span className="font-mono text-xs tracking-[0.12em] text-zinc-600 uppercase">
          {leads.length}
        </span>
      </header>
      <ul className="divide-y divide-zinc-200">
        {visible.map((e) => (
          <LeadRowItem key={e.row.id} enriched={e} />
        ))}
      </ul>
      {remaining > 0 ? (
        <p className="border-t border-zinc-200 px-4 py-2 text-right label-cap text-zinc-600">
          + {remaining} more
        </p>
      ) : null}
    </section>
  );
}

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
            <span className="truncate text-sm font-medium text-zinc-900">
              {row.name}
            </span>
            <span className="font-mono text-xs text-zinc-600">{lane}</span>
          </div>
          <span className="font-mono text-xs tracking-[0.12em] text-zinc-600 uppercase shrink-0">
            {sinceStatus}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {showStatus ? (
            <span className="font-mono text-xs tracking-[0.12em] text-zinc-600 uppercase">
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
      <p className="text-xs font-semibold tracking-[0.12em] text-amber-800 uppercase">
        System check
      </p>
      <p className="mt-1 text-sm leading-relaxed text-amber-900">
        Missing or invalid environment configuration. Some features may not
        work until these are set:
      </p>
      <ul className="mt-2 list-inside list-disc font-mono text-xs text-amber-800">
        {issues.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}
