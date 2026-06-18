import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { computeUrgency, topUrgency } from "@/lib/dispatch/urgency";
import type { LeadStatus } from "@/lib/dispatch/status";
import {
  formatLoadRate,
  formatPlace,
  mapToDisplayStatus,
  nextAction,
} from "@/lib/dispatch/loads-view";
import { LoadsListTable, type LoadListRow } from "./LoadsListTable";
import { QuotesPipeline } from "../quotes/QuotesPipeline";
import { loadPipelineCards } from "@/lib/dispatch/pipeline";

export const metadata: Metadata = {
  title: "Loads",
  robots: { index: false, follow: false },
};

/**
 * Dispatch Loads page — V0.
 *
 * Work-queue oriented view of every active load. Reuses the same
 * urgency enrichment as the Quotes page (computeUrgency over per-lead
 * artifact aggregates) so attention semantics stay consistent across
 * the two views.
 *
 * Per the design brief: status and flags are SEPARATE. Status is the
 * coarse display bucket (Quoted / Booked / Scheduled / At pickup /
 * In transit / Delivered / Archived / Cancelled) derived from
 * `lead_status`. Flags are the urgency chips already computed by
 * `computeUrgency` — surfaced as attention indicators per row.
 *
 * Row click links to the existing /admin/quotes/[id] workspace. A
 * right-side drawer is the eventual target but not built in V0 — the
 * existing detail page covers full-edit needs today.
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

async function loadLoads(): Promise<{
  rows: LoadListRow[];
  counts: { active: number; attention: number };
}> {
  const sb = createServiceRoleClient();
  const now = new Date();

  // 1. Active leads. Same WHERE clause as the Quotes page — soft-deleted
  //    rows excluded; trashed loads never appear in the work queue.
  const { data: leadRows } = await sb
    .from("quote_requests")
    .select(
      "id, created_at, name, commodity, weight, lead_status, lead_status_updated_at, pickup_city, pickup_state, pickup_zip, delivery_city, delivery_state, delivery_zip",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .returns<LeadRowDB[]>();

  const leads = leadRows ?? [];
  const leadIds = leads.map((l) => l.id);

  if (leadIds.length === 0) {
    return { rows: [], counts: { active: 0, attention: 0 } };
  }

  // 2. Artifact aggregations in parallel — estimates (with rate),
  //    finalized quotes (with total), BOLs (sent_at only). Intake
  //    rows are fetched via estimate IDs in step 3 below.
  const [
    { data: estimateRows },
    { data: fqRows },
    { data: bolRows },
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

  // 3. Intake state — needed by `intake_in_progress` urgency. Fetched
  //    via the estimate IDs we just saw.
  const estimateIds: string[] = [];
  const estimateIdToLead = new Map<string, string>();
  for (const e of estimateRows ?? []) {
    estimateIds.push(e.id);
    estimateIdToLead.set(e.id, e.quote_request_id);
  }

  let intakeRows: IntakeRow[] = [];
  if (estimateIds.length > 0) {
    const { data } = await sb
      .from("shipment_intake")
      .select("dispatch_estimate_id, status, created_at, submitted_at")
      .in("dispatch_estimate_id", estimateIds)
      .returns<IntakeRow[]>();
    intakeRows = data ?? [];
  }

  // 4. Latest-sent and latest-rate lookups per lead. Lists are DESC by
  //    sent_at, so first match wins.
  const latestEstimateSentAt = new Map<string, string>();
  const latestEstimateLow = new Map<string, number | null>();
  const latestEstimateHigh = new Map<string, number | null>();
  for (const e of estimateRows ?? []) {
    if (!latestEstimateSentAt.has(e.quote_request_id)) {
      if (e.sent_at) {
        latestEstimateSentAt.set(e.quote_request_id, e.sent_at);
      }
      latestEstimateLow.set(e.quote_request_id, e.linehaul_low ?? null);
      latestEstimateHigh.set(e.quote_request_id, e.linehaul_high ?? null);
    }
  }

  const latestFqSentAt = new Map<string, string>();
  const latestFqTotal = new Map<string, number | null>();
  for (const r of fqRows ?? []) {
    if (!latestFqSentAt.has(r.quote_request_id)) {
      if (r.sent_at) {
        latestFqSentAt.set(r.quote_request_id, r.sent_at);
      }
      latestFqTotal.set(r.quote_request_id, r.total_amount ?? null);
    }
  }

  const latestBolSentAt = new Map<string, string>();
  for (const r of bolRows ?? []) {
    if (r.sent_at && !latestBolSentAt.has(r.quote_request_id)) {
      latestBolSentAt.set(r.quote_request_id, r.sent_at);
    }
  }

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

  // 5. Per-row enrichment. Urgency chips reuse the existing helper —
  //    we don't fork the attention semantics; the Loads view and the
  //    Quotes view share the same definition of "needs attention".
  const rows: LoadListRow[] = leads.map((lead) => {
    const urgencyChips = computeUrgency({
      leadStatus: lead.lead_status,
      createdAt: lead.created_at,
      latestEstimateSentAt: latestEstimateSentAt.get(lead.id) ?? null,
      intakeStartedAt: intakeStarted.get(lead.id) ?? null,
      intakeSubmittedAt: intakeSubmitted.get(lead.id) ?? null,
      latestFinalizedSentAt: latestFqSentAt.get(lead.id) ?? null,
      latestBolSentAt: latestBolSentAt.get(lead.id) ?? null,
      leadStatusUpdatedAt: lead.lead_status_updated_at,
      now,
    });
    const top = topUrgency(urgencyChips);
    const displayStatus = mapToDisplayStatus(lead.lead_status);
    const action = nextAction(lead.lead_status, top?.label ?? null);
    const rateDisplay = formatLoadRate({
      finalizedTotal: latestFqTotal.get(lead.id) ?? null,
      estimateLow: latestEstimateLow.get(lead.id) ?? null,
      estimateHigh: latestEstimateHigh.get(lead.id) ?? null,
    });

    return {
      id: lead.id,
      pickup: formatPlace(lead.pickup_city, lead.pickup_state, lead.pickup_zip),
      delivery: formatPlace(
        lead.delivery_city,
        lead.delivery_state,
        lead.delivery_zip,
      ),
      customerName: lead.name,
      commodity: lead.commodity,
      lead_status: lead.lead_status,
      displayStatus,
      created_at: lead.created_at,
      lead_status_updated_at: lead.lead_status_updated_at,
      urgencyChips,
      topUrgency: top,
      nextActionVerb: action.verb,
      nextActionSubtitle: action.subtitle,
      rateDisplay,
    };
  });

  // 6. Counts for the page header. "Active" excludes terminal states;
  //    "Attention" counts rows with at least one urgency chip.
  const active = rows.filter(
    (r) => r.displayStatus !== "archived" && r.displayStatus !== "cancelled",
  ).length;
  const attention = rows.filter((r) => r.topUrgency != null).length;

  return { rows, counts: { active, attention } };
}

export default async function LoadsPage() {
  const [{ rows, counts }, pipelineCards] = await Promise.all([
    loadLoads(),
    loadPipelineCards(),
  ]);
  // Funnel shows the live pipeline; expired leads are a dead-end and stay off
  // it (they surface in the dashboard's "Expired quotes" table).
  const activePipeline = pipelineCards.filter((c) => c.status !== "expired");
  return (
    <LoadsListTable
      rows={rows}
      counts={counts}
      pipeline={<QuotesPipeline cards={activePipeline} />}
    />
  );
}
