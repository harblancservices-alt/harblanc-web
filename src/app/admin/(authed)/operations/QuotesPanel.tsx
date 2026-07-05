import { createServiceRoleClient } from "@/lib/supabase/server";
import { SectionTabs } from "../SectionTabs";
import { QuoteListTable, type QuoteListRow } from "../quotes/QuoteListTable";
import { QuotesPipeline } from "../quotes/QuotesPipeline";
import { computeUrgency, topUrgency } from "@/lib/dispatch/urgency";
import { loadPipelineCards } from "@/lib/dispatch/pipeline";
import type { LeadStatus } from "@/lib/dispatch/status";

/**
 * Operations · Quotes tab.
 *
 * The former /admin/quotes list page, moved verbatim into the Operations
 * hub's Quotes tab. The data logic (loadQuotes) is unchanged — the same
 * urgency enrichment the dashboard uses; only the page chrome (PageHeader,
 * outer container) moved up to the hub, so this renders just the section's
 * inner content: Active/Trash tabs, the pipeline funnel, and the feed.
 */

type LeadRowDB = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  phone: string;
  commodity: string;
  weight: string;
  lead_status: LeadStatus;
  lead_status_updated_at: string | null;
  pickup_zip: string | null;
  delivery_zip: string | null;
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

async function loadQuotes(): Promise<{
  rows: QuoteListRow[];
  trashCount: number;
  newToday: number;
}> {
  const sb = createServiceRoleClient();
  const now = new Date();

  // 1. Active leads + trash count in parallel.
  const [{ data: leadRows }, { count: trashCount }] = await Promise.all([
    sb
      .from("quote_requests")
      .select(
        "id, created_at, name, email, phone, commodity, weight, lead_status, lead_status_updated_at, pickup_zip, delivery_zip",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .returns<LeadRowDB[]>(),
    sb
      .from("quote_requests")
      .select("*", { count: "exact", head: true })
      .not("deleted_at", "is", null),
  ]);

  const leads = leadRows ?? [];
  const leadIds = leads.map((l) => l.id);

  // 2. Per-artifact aggregations (same shape as dashboard's loadOps).
  //    Skip the queries entirely when there are no leads.
  const [
    { data: estimateAgg },
    { data: fqAgg },
    { data: bolAgg },
    { data: estimateForIntake },
  ] = leadIds.length === 0
    ? [
        { data: [] as EstimateAgg[] },
        { data: [] as FqAgg[] },
        { data: [] as BolAgg[] },
        { data: [] as EstimateForIntake[] },
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
      ]);

  // 3. Latest sent_at per lead — lists are already DESC, first wins.
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

  // 4. Intake state — fetch via the estimate IDs we just saw.
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

  // 5. Per-row urgency. Dashboard parity — same computeUrgency call.
  const enriched: QuoteListRow[] = leads.map((row) => {
    const urgencyChips = computeUrgency({
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
    const top = topUrgency(urgencyChips);
    return {
      id: row.id,
      created_at: row.created_at,
      name: row.name,
      email: row.email,
      phone: row.phone,
      commodity: row.commodity,
      weight: row.weight,
      lead_status: row.lead_status,
      lead_status_updated_at: row.lead_status_updated_at,
      pickup_zip: row.pickup_zip,
      delivery_zip: row.delivery_zip,
      urgencyChips,
      topUrgency: top,
    };
  });

  // 6. "new today" count - matches dashboard semantics.
  const dayAgo = now.getTime() - 24 * 60 * 60 * 1000;
  const newToday = enriched.filter(
    (e) => new Date(e.created_at).getTime() >= dayAgo,
  ).length;

  return { rows: enriched, trashCount: trashCount ?? 0, newToday };
}

export async function QuotesPanel() {
  // The funnel reuses the same pipeline cards the old /admin/loads page showed;
  // expired leads are a dead-end and stay off it (they surface in the
  // dashboard's "Expired quotes" table). Any legacy ?filter= URL param is now a
  // harmless no-op — the panel always shows all active leads.
  const [{ rows, trashCount, newToday }, pipelineCards] = await Promise.all([
    loadQuotes(),
    loadPipelineCards(),
  ]);
  const activePipeline = pipelineCards.filter((c) => c.status !== "expired");

  return (
    <div>
      <SectionTabs
        tabs={[
          {
            label: "Active",
            href: "/admin/operations?tab=quotes",
            count: rows.length,
            active: true,
          },
          {
            label: "Trash",
            href: "/admin/quotes/trash",
            count: trashCount,
          },
        ]}
      />

      <p className="mt-3 font-mono text-[11px] font-medium tabular-nums text-fg-subtle">
        {rows.length} active · {newToday} new today
      </p>

      {/* Pipeline funnel — moved here from the retired /admin/loads page. */}
      <div className="mt-4">
        <QuotesPipeline cards={activePipeline} />
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-fg-subtle">
          No active quote requests.
        </p>
      ) : (
        <QuoteListTable rows={rows} />
      )}
    </div>
  );
}
