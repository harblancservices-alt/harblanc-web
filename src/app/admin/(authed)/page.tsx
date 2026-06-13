import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { computeUrgency, type UrgencyChip } from "@/lib/dispatch/urgency";
import type { LeadStatus } from "@/lib/dispatch/status";
import {
  formatLoadRate,
  formatPlace,
  mapToDisplayStatus,
  type LoadDisplayStatus,
} from "@/lib/dispatch/loads-view";
import {
  chipToActionVerb,
  chipToProblemLabel,
  compareAttentionRows,
  pickCurrentLoad,
  pickPrimaryChip,
  recentAgeLabel,
  type AttentionRow,
} from "@/lib/dispatch/dashboard-view";
import { DashboardView, type DashboardData } from "./DashboardView";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

/**
 * Owner Dashboard — v0.
 *
 * Reuses the same urgency engine, status taxonomy, and rate format
 * helpers as the Loads page so attention semantics stay consistent
 * across the two views. This page does the data load + KPI math;
 * `DashboardView` is the dumb render layer.
 *
 * Net Revenue MTD is intentionally left null — we don't track
 * expenses yet, and the brief said no fake placeholder data.
 * `DashboardView` renders "—" in that slot until expenses land.
 *
 * AR Open is computed as the sum of `total_amount` on finalized
 * quotes whose lead is in `delivered` state (delivered but not yet
 * archived). This is an honest proxy — once an `invoices` table
 * exists, swap this for actual unpaid invoice totals.
 */

type LeadRowDB = {
  id: string;
  created_at: string;
  name: string;
  commodity: string;
  weight: string;
  lead_status: LeadStatus;
  lead_status_updated_at: string | null;
  pickup_city: string | null;
  pickup_state: string | null;
  pickup_zip: string | null;
  pickup_date: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_zip: string | null;
};

type EstimateRow = {
  id: string;
  quote_request_id: string;
  sent_at: string | null;
  linehaul_low: number | null;
  linehaul_high: number | null;
};

type FqRow = {
  quote_request_id: string;
  sent_at: string | null;
  total_amount: number | null;
};

type BolRow = {
  quote_request_id: string;
  sent_at: string | null;
};

type IntakeRow = {
  dispatch_estimate_id: string;
  status: "in_progress" | "submitted";
  created_at: string;
  submitted_at: string | null;
};

type ApplicationRow = {
  id: string;
  created_at: string;
  name: string;
  equipment_type: string | null;
  cdl_status: string | null;
};

const TERMINAL_STATUSES: ReadonlySet<LoadDisplayStatus> = new Set([
  "archived",
  "cancelled",
]);

const OPEN_QUOTE_STATUSES: ReadonlySet<LoadDisplayStatus> = new Set([
  "quoted",
]);

async function loadDashboard(): Promise<DashboardData> {
  const sb = createServiceRoleClient();
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0),
  ).toISOString();

  // 1. Leads + applications in parallel.
  const [
    { data: leadRows },
    { data: appsRows },
  ] = await Promise.all([
    sb
      .from("quote_requests")
      .select(
        "id, created_at, name, commodity, weight, lead_status, lead_status_updated_at, pickup_city, pickup_state, pickup_zip, pickup_date, delivery_city, delivery_state, delivery_zip",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .returns<LeadRowDB[]>(),
    sb
      .from("applications")
      .select("id, created_at, name, equipment_type, cdl_status")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(4)
      .returns<ApplicationRow[]>(),
  ]);

  const leads = leadRows ?? [];
  const apps = appsRows ?? [];
  const leadIds = leads.map((l) => l.id);

  // 2. Artifact aggregations.
  let estimates: EstimateRow[] = [];
  let fqs: FqRow[] = [];
  let bols: BolRow[] = [];
  let intakes: IntakeRow[] = [];

  if (leadIds.length > 0) {
    const [
      { data: e },
      { data: f },
      { data: b },
    ] = await Promise.all([
      sb
        .from("dispatch_estimates")
        .select("id, quote_request_id, sent_at, linehaul_low, linehaul_high")
        .in("quote_request_id", leadIds)
        .order("sent_at", { ascending: false, nullsFirst: false })
        .returns<EstimateRow[]>(),
      sb
        .from("finalized_quotes")
        .select("quote_request_id, sent_at, total_amount")
        .in("quote_request_id", leadIds)
        .order("sent_at", { ascending: false, nullsFirst: false })
        .returns<FqRow[]>(),
      sb
        .from("bills_of_lading")
        .select("quote_request_id, sent_at")
        .in("quote_request_id", leadIds)
        .not("sent_at", "is", null)
        .order("sent_at", { ascending: false })
        .returns<BolRow[]>(),
    ]);
    estimates = e ?? [];
    fqs = f ?? [];
    bols = b ?? [];

    const estimateIds = estimates.map((row) => row.id);
    if (estimateIds.length > 0) {
      const { data: ir } = await sb
        .from("shipment_intake")
        .select("dispatch_estimate_id, status, created_at, submitted_at")
        .in("dispatch_estimate_id", estimateIds)
        .returns<IntakeRow[]>();
      intakes = ir ?? [];
    }
  }

  // 3. Per-lead lookups (latest-of-each).
  const latestEstSent = new Map<string, string>();
  const latestEstLow = new Map<string, number | null>();
  const latestEstHigh = new Map<string, number | null>();
  const estIdToLead = new Map<string, string>();
  for (const e of estimates) {
    estIdToLead.set(e.id, e.quote_request_id);
    if (!latestEstSent.has(e.quote_request_id)) {
      if (e.sent_at) latestEstSent.set(e.quote_request_id, e.sent_at);
      latestEstLow.set(e.quote_request_id, e.linehaul_low ?? null);
      latestEstHigh.set(e.quote_request_id, e.linehaul_high ?? null);
    }
  }

  const latestFqSent = new Map<string, string>();
  const latestFqTotal = new Map<string, number | null>();
  for (const r of fqs) {
    if (!latestFqSent.has(r.quote_request_id)) {
      if (r.sent_at) latestFqSent.set(r.quote_request_id, r.sent_at);
      latestFqTotal.set(r.quote_request_id, r.total_amount ?? null);
    }
  }

  const latestBolSent = new Map<string, string>();
  for (const r of bols) {
    if (r.sent_at && !latestBolSent.has(r.quote_request_id)) {
      latestBolSent.set(r.quote_request_id, r.sent_at);
    }
  }

  const intakeStarted = new Map<string, string>();
  const intakeSubmitted = new Map<string, string>();
  for (const r of intakes) {
    const leadId = estIdToLead.get(r.dispatch_estimate_id);
    if (!leadId) continue;
    if (!intakeStarted.has(leadId)) {
      intakeStarted.set(leadId, r.created_at);
    }
    if (r.submitted_at && !intakeSubmitted.has(leadId)) {
      intakeSubmitted.set(leadId, r.submitted_at);
    }
  }

  // 4. Enrich each lead with urgency chips + display status.
  type EnrichedLead = {
    lead: LeadRowDB;
    displayStatus: LoadDisplayStatus;
    chips: UrgencyChip[];
    rate: number | null;
    rateDisplay: string | null;
    laneLabel: string;
  };
  const enriched: EnrichedLead[] = leads.map((lead) => {
    const chips = computeUrgency({
      leadStatus: lead.lead_status,
      createdAt: lead.created_at,
      latestEstimateSentAt: latestEstSent.get(lead.id) ?? null,
      intakeStartedAt: intakeStarted.get(lead.id) ?? null,
      intakeSubmittedAt: intakeSubmitted.get(lead.id) ?? null,
      latestFinalizedSentAt: latestFqSent.get(lead.id) ?? null,
      latestBolSentAt: latestBolSent.get(lead.id) ?? null,
      leadStatusUpdatedAt: lead.lead_status_updated_at,
      now,
    });
    const rateDisplay = formatLoadRate({
      finalizedTotal: latestFqTotal.get(lead.id) ?? null,
      estimateLow: latestEstLow.get(lead.id) ?? null,
      estimateHigh: latestEstHigh.get(lead.id) ?? null,
    });
    const pickup =
      formatPlace(lead.pickup_city, lead.pickup_state, lead.pickup_zip) ?? "";
    const delivery =
      formatPlace(
        lead.delivery_city,
        lead.delivery_state,
        lead.delivery_zip,
      ) ?? "";
    const laneLabel =
      pickup && delivery ? pickup + " → " + delivery : pickup || delivery || "Lane TBD";

    return {
      lead,
      displayStatus: mapToDisplayStatus(lead.lead_status),
      chips,
      rate: latestFqTotal.get(lead.id) ?? latestEstLow.get(lead.id) ?? null,
      rateDisplay,
      laneLabel,
    };
  });

  // 5. KPIs.
  let grossMtd = 0;
  for (const f of fqs) {
    if (f.sent_at && f.sent_at >= monthStart && f.total_amount != null) {
      grossMtd += f.total_amount;
    }
  }
  const activeLoads = enriched.filter(
    (e) => !TERMINAL_STATUSES.has(e.displayStatus),
  ).length;
  const openQuotes = enriched.filter(
    (e) => OPEN_QUOTE_STATUSES.has(e.displayStatus),
  ).length;
  const arOpen = enriched
    .filter((e) => e.displayStatus === "delivered")
    .reduce((sum, e) => sum + (e.rate ?? 0), 0);
  const applicationsCount = apps.length;

  // 6. Attention rows — collapsed by lead.
  const attentionRows: AttentionRow[] = [];
  for (const e of enriched) {
    if (e.chips.length === 0) continue;
    const primary = pickPrimaryChip(e.chips);
    const flagLabels = e.chips.map((c) => chipToProblemLabel(c.kind));
    attentionRows.push({
      leadId: e.lead.id,
      problemLabel: chipToProblemLabel(primary.kind),
      severity: primary.severity,
      ageSubtitle: primary.label,
      flagLabels,
      customerName: e.lead.name,
      laneLabel: e.laneLabel,
      rateDisplay: e.rateDisplay,
      actionVerb: chipToActionVerb(primary.kind),
    });
  }
  attentionRows.sort(compareAttentionRows);
  const attentionTotal = attentionRows.length;
  const attentionTopFive = attentionRows.slice(0, 5);

  // 7. Current load.
  const currentLoadPick = pickCurrentLoad(
    enriched.map((e) => ({
      leadId: e.lead.id,
      displayStatus: e.displayStatus,
      leadStatusUpdatedAt: e.lead.lead_status_updated_at,
      createdAt: e.lead.created_at,
    })),
  );
  const currentLoadEnriched = currentLoadPick
    ? enriched.find((e) => e.lead.id === currentLoadPick.leadId) ?? null
    : null;
  const currentLoad = currentLoadEnriched
    ? {
        leadId: currentLoadEnriched.lead.id,
        laneLabel: currentLoadEnriched.laneLabel,
        customerName: currentLoadEnriched.lead.name,
        rateDisplay: currentLoadEnriched.rateDisplay,
        displayStatus: currentLoadEnriched.displayStatus,
        pickupDate: currentLoadEnriched.lead.pickup_date,
        nextActionVerb: chipToActionVerb(
          currentLoadEnriched.chips.length > 0
            ? pickPrimaryChip(currentLoadEnriched.chips).kind
            : fallbackVerbKind(currentLoadEnriched.displayStatus),
        ),
      }
    : null;

  // 8. Recent quotes — newest 4.
  const recentQuotes = enriched.slice(0, 4).map((e) => ({
    leadId: e.lead.id,
    ageLabel: recentAgeLabel(e.lead.created_at, now),
    customerName: e.lead.name,
    laneLabel: e.laneLabel,
    rateDisplay: e.rateDisplay,
    displayStatus: e.displayStatus,
  }));

  // 9. Recent applications — already limited to 4 in the query.
  const recentApplications = apps.map((a) => ({
    id: a.id,
    ageLabel: recentAgeLabel(a.created_at, now),
    name: a.name,
    role: pickApplicantRole(a),
  }));

  return {
    monthLabel: formatMonthLabel(now),
    kpis: {
      grossMtd,
      netMtd: null,
      activeLoads,
      openQuotes,
      arOpen,
      applications: applicationsCount,
    },
    attentionRows: attentionTopFive,
    attentionTotal,
    currentLoad,
    recentQuotes,
    recentApplications,
  };
}

function fallbackVerbKind(
  status: LoadDisplayStatus,
): UrgencyChip["kind"] {
  switch (status) {
    case "scheduled":
    case "booked":
      return "dispatched_no_pickup";
    case "at_pickup":
      return "dispatched_no_pickup";
    case "in_transit":
      return "in_transit_stale";
    case "delivered":
      return "delivered_unconfirmed";
    case "quoted":
      return "stale_estimate";
    case "archived":
    case "cancelled":
      return "new_lead_stale";
  }
}

function pickApplicantRole(row: ApplicationRow): string {
  if (row.equipment_type && row.equipment_type.trim().length > 0) {
    return row.equipment_type;
  }
  if (row.cdl_status && row.cdl_status.trim().length > 0) {
    return "Driver · " + row.cdl_status;
  }
  return "Applicant";
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatMonthLabel(d: Date): string {
  return MONTHS[d.getUTCMonth()]! + " " + d.getUTCFullYear();
}

export default async function DashboardPage() {
  const data = await loadDashboard();
  return <DashboardView data={data} />;
}
