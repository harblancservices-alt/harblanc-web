import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { SectionTabs } from "../SectionTabs";
import { QuoteListTable, type QuoteListRow } from "./QuoteListTable";
import { computeUrgency, topUrgency } from "@/lib/dispatch/urgency";
import type { LeadStatus } from "@/lib/dispatch/status";

export const metadata: Metadata = {
  title: "Quote requests",
  robots: { index: false, follow: false },
};

/**
 * Level 6.3 — Active Leads page.
 *
 * Loads every non-trashed quote_request, enriches each row with the same
 * urgency signal the dashboard uses (computeUrgency over the per-lead
 * artifact aggregates), and hands the enriched array to QuoteListTable
 * which groups, filters, and renders the workflow feed.
 *
 * The urgency enrichment is a deliberate duplication of the dashboard's
 * loadOps pattern (admin/(authed)/page.tsx). Per Level 6.2C audit: we
 * inline-replicate the exact same shape rather than refactor to a shared
 * helper, because the shared helper would touch files outside the locked
 * 6.3 scope. Future cleanup can extract this.
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

/**
 * Level 8.1 — dashboard counter links land here with a `?filter=` URL
 * param. Map the hyphenated dashboard slugs to the QuoteListTable
 * FilterChip union. Unknown / missing param defaults to "all".
 */
function mapFilterParam(raw: string | undefined): string {
  switch (raw) {
    case "needs-attention":
      return "needs";
    case "new-today":
      return "new";
    case "in-motion":
      return "motion";
    case "est":
    case "pay":
    case "ready":
    case "all":
      return raw;
    default:
      return "all";
  }
}

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { rows, trashCount, newToday } = await loadQuotes();
  const params = await searchParams;
  const initialFilter = mapFilterParam(params.filter);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      {/* V3 hero — eyebrow + bold title + right-aligned meta */}
      <header className="flex flex-wrap items-end justify-between gap-4 pb-5 sm:pb-6">
        <div>
          <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.28em] text-black">
            Quotes
          </p>
          <h1 className="mt-1 text-[30px] font-bold leading-none tracking-tight text-black sm:text-[36px] lg:text-[40px]">
            Active leads
          </h1>
        </div>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-black text-right leading-snug">
          {rows.length} active
          <br />
          {newToday} new today
        </p>
      </header>

      <SectionTabs
        tabs={[
          {
            label: "Active",
            href: "/admin/quotes",
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

      {rows.length === 0 ? (
        <p className="mt-12 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-black/55">
          No active quote requests.
        </p>
      ) : (
        <QuoteListTable rows={rows} initialFilter={initialFilter} />
      )}
    </div>
  );
}
