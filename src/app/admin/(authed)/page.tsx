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
  type UrgencyChip,
} from "@/lib/dispatch/urgency";
import { validateEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: "Dispatch center",
  robots: { index: false, follow: false },
};

/**
 * Dispatch operations home — Level 6.1 redesign (task-list, no funnel).
 *
 * Render order (desktop + mobile identical):
 *
 *   1. Hero            — Dispatch center eyebrow + "Operations" title +
 *                        meta (N active / N new today).
 *   2. Needs attention — page anchor, hoisted above stats. Renders
 *                        always; empty state collapses to a single-row
 *                        "All clear" header.
 *   3. Stat strip      — Needs attention / New today / In motion /
 *                        Active total. Designed as future filter buttons.
 *   4. New leads (24h) — first-touch queue, derived from ops.newLeadsLast24h.
 *   5. In motion +     — situational + onboarding awareness. 2-col on lg,
 *      Recent apps       stacked on mobile.
 *
 * What this replaces (Level 6.1):
 *   - Action queue beige spotlight (volume-conditional list).
 *   - 8-column kanban funnel (BUCKETS, KanbanColumn, KanbanCard).
 *   - amber EnvBanner, font-display H1, zinc-bordered cards, gray text.
 *
 * Data layer (loadOps) is preserved verbatim except for one additive
 * field: newLeadsLast24h. No new queries. No schema changes.
 *
 * Designed to be glanceable on a phone. No horizontal scroll anywhere.
 * No charts, no analytics.
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

  // Pre-compute "new today" + the array form so the page render stays
  // pure (no Date.now() at component-render time). Both consumers read
  // the same predicate; the array variant feeds the New leads section
  // added in Level 6.1.
  const dayAgo = now.getTime() - 24 * 60 * 60 * 1000;
  const newLeadsLast24h = enriched.filter(
    (e) => new Date(e.row.created_at).getTime() >= dayAgo,
  );
  const newToday = newLeadsLast24h.length;

  return {
    enriched,
    recentApps: appRows ?? [],
    envIssues: validateEnv(),
    newToday,
    newLeadsLast24h,
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

  const newLeads = ops.newLeadsLast24h;
  const inMotionLeads = ops.enriched.filter((e) =>
    ["dispatched", "picked_up", "in_transit"].includes(e.row.lead_status),
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      {/* Env status banner — restyled to V3 */}
      {ops.envIssues.length > 0 ? <EnvBanner issues={ops.envIssues} /> : null}

      {/* HERO — eyebrow + title left; two-line meta right (no kanban-counts strip). */}
      <header className="flex flex-wrap items-end justify-between gap-4 pb-5 sm:pb-6">
        <div>
          <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.28em] text-black">
            Dispatch center
          </p>
          <h1 className="mt-1 text-[30px] font-bold leading-none tracking-tight text-black sm:text-[36px] lg:text-[40px]">
            Operations
          </h1>
        </div>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-black text-right leading-snug">
          {totalActive} active
          <br />
          {newToday} new today
        </p>
      </header>

      {/* 1. NEEDS ATTENTION — heavy command block. Stronger header band
          + stack of white attention cards (each lead is its own card)
          when populated; one-line "All clear" header when empty.
          Per admin-portal-palette: rail and accent bar are black; count
          stays red when > 0 because that count IS the alert signal. */}
      <section className="border-2 border-black border-l-4 border-l-black bg-[#fafaf6]">
        <div
          className={
            "flex flex-wrap items-baseline justify-between gap-3 px-5 pt-4 pb-2 sm:px-6 " +
            (needsAttn > 0 ? "border-b border-black/15" : "")
          }
        >
          <span className="flex items-baseline gap-2.5">
            <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-black">
              Needs attention
            </h2>
            {needsAttn > 0 ? (
              <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-black">
                &middot; {needsAttn} flagged
              </span>
            ) : (
              <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.22em] text-black/55">
                &middot; All clear
              </span>
            )}
          </span>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-black/50">
            Triage
          </span>
        </div>
        {needsAttn > 0 ? (
          <div className="space-y-3 p-3 sm:space-y-4 sm:p-4">
            {attention.slice(0, 8).map((e) => (
              <LeadRowItem key={e.row.id} enriched={e} showStatus />
            ))}
          </div>
        ) : null}
      </section>

      {/* 2. STATS strip — compact supporting numbers (~60 px tall). */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:grid-cols-4 sm:gap-2.5">
        {/* Level 8.1: counters become filter links into the Active Quotes
            feed. Each href maps to a FilterChip on /admin/quotes via URL
            param. "Active total" stays unfiltered. */}
        <Counter
          label="Needs attention"
          value={needsAttn}
          accent={needsAttn > 0 ? "alert" : undefined}
          href="/admin/quotes?filter=needs-attention"
        />
        <Counter
          label="New today"
          value={newToday}
          href="/admin/quotes?filter=new-today"
        />
        <Counter
          label="In motion"
          value={inMotion}
          href="/admin/quotes?filter=in-motion"
        />
        <Counter label="Active total" value={totalActive} href="/admin/quotes" />
      </div>

      {/* 3. NEW LEADS — medium-weight clickable card grid. Admin palette:
          rail and accent bar are black; empty state is muted black (not red)
          because "no new leads" is neutral information, not an alert. */}
      <section className="mt-3 border-2 border-black border-l-4 border-l-black bg-[#fafaf6] sm:mt-4">
        <div
          className={
            "flex flex-wrap items-baseline justify-between gap-3 px-4 py-3 sm:px-5 " +
            (newLeads.length > 0 ? "border-b border-black/15" : "")
          }
        >
          <span className="flex items-baseline gap-2">
            <span aria-hidden className="inline-block h-3.5 w-1 shrink-0 self-center bg-black" />
            <h2 className="font-mono text-[11.5px] font-bold uppercase tracking-[0.22em] text-black">
              New leads
            </h2>
            <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-black">
              &middot; last 24 h &middot; {newLeads.length}
            </span>
          </span>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-black/50">
            First touch
          </span>
        </div>
        {newLeads.length === 0 ? (
          <p className="px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-black/55 sm:px-5">
            No new leads in 24 h
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 p-3 sm:gap-3 sm:p-3.5 lg:grid-cols-2">
            {newLeads.map((e) => (
              <NewLeadRow key={e.row.id} enriched={e} />
            ))}
          </div>
        )}
      </section>

      {/* 4. IN MOTION + RECENT APPLICATIONS — light reference panels. */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-[1.2fr_1fr]">
        {/* In motion — admin palette: black rail and eyebrow; empty state muted black. */}
        <section className="border-2 border-black border-l-4 border-l-black bg-[#fafaf6]">
          <div className="flex flex-wrap items-baseline justify-between gap-3 px-4 py-2.5 sm:px-5 sm:py-3">
            <span className="flex items-baseline gap-2">
              <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.22em] text-black">
                In motion
              </span>
              <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-black">
                &middot; {inMotionLeads.length}
              </span>
            </span>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-black/50">
              Situational
            </span>
          </div>
          {inMotionLeads.length === 0 ? (
            <p className="border-t border-black/15 px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-black/55 sm:px-5">
              No loads in motion
            </p>
          ) : (
            <ul>
              {inMotionLeads.map((e) => (
                <InMotionRow key={e.row.id} enriched={e} />
              ))}
            </ul>
          )}
        </section>

        {/* Recent applications — admin palette: black rail and eyebrow; empty state muted black. */}
        <section className="border-2 border-black border-l-4 border-l-black bg-[#fafaf6]">
          <div className="flex flex-wrap items-baseline justify-between gap-3 px-4 py-2.5 sm:px-5 sm:py-3">
            <span className="flex items-baseline gap-2">
              <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.22em] text-black">
                Recent applications
              </span>
              <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-black">
                &middot; {ops.recentApps.length}
              </span>
            </span>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-black/50">
              Onboarding
            </span>
          </div>
          {ops.recentApps.length === 0 ? (
            <p className="border-t border-black/15 px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-black/55 sm:px-5">
              No incoming applications
            </p>
          ) : (
            <ul>
              {ops.recentApps.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/admin/applications/${r.id}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 border-t border-dashed border-black/15 px-4 py-2.5 transition-colors hover:bg-[#f3f1e9] sm:px-5 sm:py-3"
                  >
                    <span className="truncate text-[14px] font-bold text-black sm:text-[14.5px]">
                      {r.name}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] font-bold tabular-nums text-black">
                      {formatTimestampShort(r.created_at)}
                    </span>
                    <span className="col-span-2 truncate font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-black">
                      {[r.equipment_type, r.cdl_status]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

// ─── components ─────────────────────────────────────────────────────────────────────────────

/**
 * Counter — supporting stat cell. Compact (60–70 px tall), cream + red
 * bar, smaller number than 6.1A so the Needs Attention block above it
 * carries the visual weight. The hover surface change already signals
 * clickability when `href` is set; no chevron, no "Tap to filter" hint.
 *
 * Signature preserved verbatim. Existing call sites work unchanged.
 */
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
  // Admin-portal palette: label and rail are black. The number stays red
  // only when accent="alert" AND value > 0 — that count IS the alert.
  const valueColor =
    accent === "alert" && value > 0 ? "text-black" : "text-black";
  const inner = (
    <>
      <p className="truncate font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-black">
        {label}
      </p>
      <p
        className={
          "mt-1.5 font-mono text-[22px] font-bold leading-none tabular-nums tracking-tight sm:text-[24px] " +
          valueColor
        }
      >
        {value}
      </p>
    </>
  );
  const baseCls =
    "block border-2 border-black border-l-4 border-l-black bg-[#fafaf6] px-3.5 py-2.5 sm:px-4 sm:py-3 " +
    (href ? "transition-colors hover:bg-[#f3f1e9]" : "");
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
 * LeadRowItem — heavy Needs Attention CARD (6.1C). White background, 2 px
 * black border, 4 px red left bar so each flagged lead reads as a stacked
 * alert inside the section's own cream tray. Three vertical zones: header
 * (name + assigned + time), lane, then chip row + a solid-red OPEN LEAD →
 * action pill bottom-right. ~120 px tall — the visual weight of the
 * dashboard hero by design.
 *
 * Signature preserved: still receives `enriched` + `showStatus`. The
 * surrounding section no longer wraps it in a <ul> — see DashboardPage.
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
  const urgencyCls =
    top?.severity === "alert"
      ? "border border-black text-black"
      : "border border-black text-black";
  const assigned =
    row.assigned_dispatcher || row.assigned_carrier
      ? [row.assigned_dispatcher, row.assigned_carrier]
          .filter(Boolean)
          .join(" · ")
      : null;
  // Level 8.1: "Last touched" line. Renders ONLY when dispatcher +
  // status-updated-at are both populated. Uses already-loaded data; no
  // new queries. Falls back to the existing "Assigned · …" line when
  // either field is missing.
  const lastTouched =
    row.assigned_dispatcher && row.lead_status_updated_at
      ? `${row.assigned_dispatcher.toUpperCase()} · ${relativeTime(
          row.lead_status_updated_at,
        )}`
      : null;
  return (
    <Link
      href={`/admin/quotes/${row.id}`}
      className="group block border-2 border-black border-l-4 border-l-black bg-white px-5 py-4 transition-colors hover:bg-[#f3f1e9] sm:px-6 sm:py-5"
    >
      {/* Header zone — name on left, since-when on right */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[20px] font-bold leading-tight text-black sm:text-[22px]">
            {row.name}
          </h3>
          {lastTouched ? (
            <p className="mt-1 truncate font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-black/60">
              Last touched &middot; {lastTouched}
            </p>
          ) : assigned ? (
            <p className="mt-1 truncate font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-black">
              Assigned &middot; {assigned}
            </p>
          ) : null}
        </div>
        <p className="shrink-0 text-right font-mono text-[12px] font-bold tabular-nums text-black">
          {sinceStatus}
        </p>
      </div>

      {/* Lane zone — substantial mono weight */}
      <p className="mt-3 truncate font-mono text-[16px] font-bold tabular-nums text-black sm:text-[18px]">
        {lane}
      </p>

      {/* Action zone — chips left, solid-red Open Lead pill right */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {showStatus ? (
            <span className="inline-flex items-center bg-black px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-white">
              {LEAD_STATUS_LABELS[row.lead_status]}
            </span>
          ) : null}
          {top ? (
            <span
              className={
                "inline-flex items-center bg-white px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] " +
                urgencyCls
              }
            >
              {top.label}
            </span>
          ) : null}
        </div>
        <span className="inline-flex items-center border-2 border-black bg-white px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-black transition-colors group-hover:bg-black group-hover:text-white">
          Open lead &rarr;
        </span>
      </div>
    </Link>
  );
}

/**
 * NewLeadRow — medium clickable card for the New leads (last 24 h) grid
 * (6.1C). Each card has its own border + red rail, sits in a 2-col grid
 * on lg+. Two-zone layout: header (name + time) → footer (lane + Open).
 * Reads "tap me" without competing with the heavy attention cards above.
 *
 * Signature preserved. Surrounding section uses a grid wrapper, not a
 * <ul> — see DashboardPage.
 */
function NewLeadRow({ enriched }: { enriched: EnrichedLead }) {
  const { row } = enriched;
  const lane =
    row.pickup_zip && row.delivery_zip
      ? `${row.pickup_zip} → ${row.delivery_zip}`
      : "Lane TBD";
  const since = relativeTime(row.created_at);
  return (
    <Link
      href={`/admin/quotes/${row.id}`}
      className="block border border-black border-l-[3px] border-l-black bg-white px-4 py-3 transition-colors hover:bg-[#f3f1e9] sm:px-4 sm:py-3.5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="truncate text-[15.5px] font-bold leading-tight text-black sm:text-[16px]">
          {row.name}
        </h3>
        <p className="shrink-0 font-mono text-[11px] font-bold tabular-nums text-black">
          {since}
        </p>
      </div>
      <p className="mt-1.5 truncate font-mono text-[12.5px] font-bold tabular-nums text-black">
        {lane}
      </p>
      <p className="mt-2 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-black">
        Open &rarr;
      </p>
    </Link>
  );
}

/**
 * InMotionRow — light tabular row (6.1C). Single horizontal line, no
 * card border, no chips below the lane. 3-column grid: name → lane +
 * sub-stage → since. Intentionally minimal chrome so this section reads
 * as situational reference, not as something the dispatcher must act on.
 */
function InMotionRow({ enriched }: { enriched: EnrichedLead }) {
  const { row } = enriched;
  const lane =
    row.pickup_zip && row.delivery_zip
      ? `${row.pickup_zip} → ${row.delivery_zip}`
      : "Lane TBD";
  const since = row.lead_status_updated_at
    ? relativeTime(row.lead_status_updated_at)
    : relativeTime(row.created_at);
  return (
    <li>
      <Link
        href={`/admin/quotes/${row.id}`}
        className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 border-t border-dashed border-black/15 px-4 py-2.5 transition-colors hover:bg-[#f3f1e9] sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:px-5 sm:py-3"
      >
        <span className="truncate text-[14px] font-bold text-black sm:text-[14.5px]">
          {row.name}
        </span>
        <span className="font-mono text-[11.5px] font-bold uppercase tracking-[0.14em] tabular-nums text-black sm:order-2">
          {LEAD_STATUS_LABELS[row.lead_status]} &middot; {since}
        </span>
        <span className="col-span-2 truncate font-mono text-[12px] font-bold tabular-nums text-black sm:col-span-1 sm:order-1 sm:row-start-1 sm:col-start-2">
          {lane}
        </span>
      </Link>
    </li>
  );
}

/**
 * EnvBanner — env-config warning. Conditional render at the top of
 * DashboardPage when validateEnv() returns issues.
 */
function EnvBanner({ issues }: { issues: string[] }) {
  return (
    <div className="mb-5 border-2 border-black border-l-4 border-l-black bg-[#fafaf6] px-4 py-3 sm:px-5 sm:py-4">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-black">
        System check
      </p>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-black">
        Missing or invalid environment configuration. Some features may not
        work until these are set:
      </p>
      <ul className="mt-2 list-inside list-disc font-mono text-[12px] leading-relaxed text-black">
        {issues.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}
