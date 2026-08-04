/**
 * Pipeline (lead-to-cash) data module — Phase 4a, `/tms-v2/operations`
 * (v2-design.md §13/§14, v2-architecture.md §3c). Reads `quote_requests`,
 * `dispatch_estimates`, `finalized_quotes`, `bills_of_lading`, `payments`,
 * `dispatch_events`, `shipment_intake`, and `applications` directly rather
 * than through the shared `DataSource` — those tables sit outside the
 * Phase-2 DataSource's entity set, same reasoning as `broker-profile.ts`
 * and `loads.ts`'s `getLoadDetail()`: branch on `isDemoMode()` locally
 * (matching `src/lib/dispatch/pipeline.ts`'s existing pattern) rather than
 * extend a shared interface mid-phase while other module sessions are
 * running concurrently.
 *
 * Business logic is NOT re-derived here. Lead status vocabulary, urgency
 * thresholds, and the payment-summary rule all come from the existing,
 * already-tested `/admin` primitives (`src/lib/dispatch/status.ts`,
 * `urgency.ts`, `payment.ts`) — the same one-truth-per-rule principle the
 * money engine applies to load net (v2-architecture.md §3a), applied here
 * to the pipeline's own business rules instead of restating them.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/admin/demo";
import { computeUrgency, topUrgency, type UrgencyChip } from "@/lib/dispatch/urgency";
import { type LeadStatus, isLeadStatus } from "@/lib/dispatch/status";
import { computePaymentSummary, type PaymentSummary } from "@/lib/dispatch/payment";
import type { DispatchEventKind } from "@/lib/dispatch/events";
import { pageRange, toPaginated, type Paginated } from "./pagination";

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function placeLabel(city: string | null, state: string | null, zip: string | null): string {
  const parts: string[] = [];
  if (city && city.trim()) parts.push(city.trim());
  if (state && state.trim()) parts.push(state.trim());
  if (parts.length > 0) return parts.join(", ");
  return zip?.trim() || "—";
}

function formatWeight(v: string | number | null): string {
  if (v == null) return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) {
    const s = String(v).trim();
    return s || "—";
  }
  return Math.round(n).toLocaleString() + " lbs";
}

// ---------------------------------------------------------------------------
// Quote requests (leads) list — Operations hub, Quote requests tab
// ---------------------------------------------------------------------------

export type LeadListRow = {
  id: string;
  createdAt: string;
  name: string;
  leadStatus: LeadStatus | string;
  leadStatusUpdatedAt: string | null;
  originLabel: string;
  destLabel: string;
  commodity: string;
  weight: string;
  topUrgency: UrgencyChip | null;
};

export type ListLeadsOptions = {
  page?: number;
  pageSize?: number;
  status?: string;
};

type LeadDbRow = {
  id: string;
  created_at: string;
  name: string | null;
  lead_status: string;
  lead_status_updated_at: string | null;
  commodity: string | null;
  weight: string | number | null;
  pickup_city: string | null;
  pickup_state: string | null;
  pickup_zip: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_zip: string | null;
};

const DEMO_LEADS: LeadDbRow[] = [
  {
    id: "demo-lead-1",
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    name: "J. Rivera (Demo)",
    lead_status: "estimate_sent",
    lead_status_updated_at: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
    commodity: "Machinery",
    weight: "18000",
    pickup_city: "Dallas",
    pickup_state: "TX",
    pickup_zip: "75201",
    delivery_city: "Memphis",
    delivery_state: "TN",
    delivery_zip: "38103",
  },
  {
    id: "demo-lead-2",
    created_at: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
    name: "M. Alvarez (Demo)",
    lead_status: "awaiting_payment",
    lead_status_updated_at: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
    commodity: "Steel coil",
    weight: "24000",
    pickup_city: "Memphis",
    pickup_state: "TN",
    pickup_zip: "38103",
    delivery_city: "Nashville",
    delivery_state: "TN",
    delivery_zip: "37201",
  },
  {
    id: "demo-lead-3",
    created_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    name: "T. Nguyen (Demo)",
    lead_status: "new",
    lead_status_updated_at: null,
    commodity: "Skid-steer",
    weight: "9000",
    pickup_city: "Tulsa",
    pickup_state: "OK",
    pickup_zip: "74103",
    delivery_city: "Dallas",
    delivery_state: "TX",
    delivery_zip: "75201",
  },
];

function enrichLead(row: LeadDbRow, urgency: { latestEstimateSentAt: string | null; intakeStartedAt: string | null; intakeSubmittedAt: string | null; latestFinalizedSentAt: string | null; latestBolSentAt: string | null }, now: Date): LeadListRow {
  const leadStatus = row.lead_status;
  const chips = isLeadStatus(leadStatus)
    ? computeUrgency({
        leadStatus,
        createdAt: row.created_at,
        latestEstimateSentAt: urgency.latestEstimateSentAt,
        intakeStartedAt: urgency.intakeStartedAt,
        intakeSubmittedAt: urgency.intakeSubmittedAt,
        latestFinalizedSentAt: urgency.latestFinalizedSentAt,
        latestBolSentAt: urgency.latestBolSentAt,
        leadStatusUpdatedAt: row.lead_status_updated_at,
        now,
      })
    : [];
  return {
    id: row.id,
    createdAt: row.created_at,
    name: row.name?.trim() || "Unnamed request",
    leadStatus,
    leadStatusUpdatedAt: row.lead_status_updated_at,
    originLabel: placeLabel(row.pickup_city, row.pickup_state, row.pickup_zip),
    destLabel: placeLabel(row.delivery_city, row.delivery_state, row.delivery_zip),
    commodity: row.commodity?.trim() || "—",
    weight: formatWeight(row.weight),
    topUrgency: topUrgency(chips),
  };
}

function demoListLeads(opts: ListLeadsOptions): Paginated<LeadListRow> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 25;
  const now = new Date();
  const filtered = opts.status ? DEMO_LEADS.filter((l) => l.lead_status === opts.status) : DEMO_LEADS;
  const rows = filtered.map((row) =>
    enrichLead(row, { latestEstimateSentAt: null, intakeStartedAt: null, intakeSubmittedAt: null, latestFinalizedSentAt: null, latestBolSentAt: null }, now),
  );
  const { from, to } = pageRange(page, pageSize);
  return toPaginated(rows.slice(from, to + 1), rows.length, page, pageSize);
}

/** Paginated, status-scoped lead list — the Operations hub's Quote
 * requests tab. Urgency enrichment (v2-design.md §13) is computed for
 * exactly the current page's leads, not the whole active set, so a
 * later page of an old/large pipeline doesn't force extra artifact
 * queries for rows that aren't even being displayed. */
export async function listLeads(opts: ListLeadsOptions = {}): Promise<Paginated<LeadListRow>> {
  if (await isDemoMode()) return demoListLeads(opts);

  const sb = createServiceRoleClient();
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 25;
  const { from, to } = pageRange(page, pageSize);
  const now = new Date();

  let query = sb
    .from("quote_requests")
    .select(
      "id, created_at, name, lead_status, lead_status_updated_at, commodity, weight, pickup_city, pickup_state, pickup_zip, delivery_city, delivery_state, delivery_zip",
      { count: "exact" },
    )
    .is("deleted_at", null);
  if (opts.status && isLeadStatus(opts.status)) query = query.eq("lead_status", opts.status);

  const { data, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to)
    .returns<LeadDbRow[]>();

  const rows = data ?? [];
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return toPaginated([], count ?? 0, page, pageSize);

  const [{ data: estRows }, { data: fqRows }, { data: bolRows }] = await Promise.all([
    sb
      .from("dispatch_estimates")
      .select("id, quote_request_id, sent_at")
      .in("quote_request_id", ids)
      .returns<{ id: string; quote_request_id: string; sent_at: string | null }[]>(),
    sb
      .from("finalized_quotes")
      .select("quote_request_id, sent_at")
      .in("quote_request_id", ids)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .returns<{ quote_request_id: string; sent_at: string | null }[]>(),
    sb
      .from("bills_of_lading")
      .select("quote_request_id, sent_at")
      .in("quote_request_id", ids)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .returns<{ quote_request_id: string; sent_at: string | null }[]>(),
  ]);

  const estimates = estRows ?? [];
  const latestEstimateSentAt = new Map<string, string>();
  for (const e of estimates) {
    if (e.sent_at && !latestEstimateSentAt.has(e.quote_request_id)) {
      latestEstimateSentAt.set(e.quote_request_id, e.sent_at);
    }
  }
  const latestFq = new Map<string, string>();
  for (const f of fqRows ?? []) {
    if (f.sent_at && !latestFq.has(f.quote_request_id)) latestFq.set(f.quote_request_id, f.sent_at);
  }
  const latestBol = new Map<string, string>();
  for (const b of bolRows ?? []) {
    if (b.sent_at && !latestBol.has(b.quote_request_id)) latestBol.set(b.quote_request_id, b.sent_at);
  }

  const estimateIdToLead = new Map(estimates.map((e) => [e.id, e.quote_request_id]));
  const estimateIds = estimates.map((e) => e.id);
  const intakeStarted = new Map<string, string>();
  const intakeSubmitted = new Map<string, string>();
  if (estimateIds.length > 0) {
    const { data: intakeRows } = await sb
      .from("shipment_intake")
      .select("dispatch_estimate_id, created_at, submitted_at")
      .in("dispatch_estimate_id", estimateIds)
      .returns<{ dispatch_estimate_id: string; created_at: string; submitted_at: string | null }[]>();
    for (const r of intakeRows ?? []) {
      const leadId = estimateIdToLead.get(r.dispatch_estimate_id);
      if (!leadId) continue;
      if (!intakeStarted.has(leadId)) intakeStarted.set(leadId, r.created_at);
      if (r.submitted_at && !intakeSubmitted.has(leadId)) intakeSubmitted.set(leadId, r.submitted_at);
    }
  }

  const enriched = rows.map((row) =>
    enrichLead(
      row,
      {
        latestEstimateSentAt: latestEstimateSentAt.get(row.id) ?? null,
        intakeStartedAt: intakeStarted.get(row.id) ?? null,
        intakeSubmittedAt: intakeSubmitted.get(row.id) ?? null,
        latestFinalizedSentAt: latestFq.get(row.id) ?? null,
        latestBolSentAt: latestBol.get(row.id) ?? null,
      },
      now,
    ),
  );

  return toPaginated(enriched, count ?? 0, page, pageSize);
}

// ---------------------------------------------------------------------------
// Applications list — Operations hub, Applications tab
// ---------------------------------------------------------------------------

export type ApplicationRow = {
  id: string;
  createdAt: string;
  name: string;
  phone: string;
  email: string;
  equipmentType: string;
  cdlStatus: string;
  yearsExperience: string | null;
  homeBase: string | null;
};

const DEMO_APPLICATIONS: ApplicationRow[] = [
  {
    id: "demo-app-1",
    createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    name: "D. Alvarez (Demo)",
    phone: "(555) 010-0142",
    email: "d.alvarez@example.com",
    equipmentType: "2019 Volvo",
    cdlStatus: "Class A",
    yearsExperience: "6",
    homeBase: "Fort Worth, TX",
  },
];

export type ListApplicationsOptions = { page?: number; pageSize?: number };

export async function listApplications(opts: ListApplicationsOptions = {}): Promise<Paginated<ApplicationRow>> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 25;

  if (await isDemoMode()) {
    const { from, to } = pageRange(page, pageSize);
    return toPaginated(DEMO_APPLICATIONS.slice(from, to + 1), DEMO_APPLICATIONS.length, page, pageSize);
  }

  const sb = createServiceRoleClient();
  const { from, to } = pageRange(page, pageSize);
  const { data, count } = await sb
    .from("applications")
    .select("id, created_at, name, phone, email, equipment_type, cdl_status, years_experience, home_base", { count: "exact" })
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, to)
    .returns<
      {
        id: string;
        created_at: string;
        name: string;
        phone: string;
        email: string;
        equipment_type: string;
        cdl_status: string;
        years_experience: string | null;
        home_base: string | null;
      }[]
    >();

  const rows: ApplicationRow[] = (data ?? []).map((a) => ({
    id: a.id,
    createdAt: a.created_at,
    name: a.name,
    phone: a.phone,
    email: a.email,
    equipmentType: a.equipment_type,
    cdlStatus: a.cdl_status,
    yearsExperience: a.years_experience,
    homeBase: a.home_base,
  }));

  return toPaginated(rows, count ?? 0, page, pageSize);
}

// ---------------------------------------------------------------------------
// Accounting summary — Operations hub, Accounting summary tab
// ---------------------------------------------------------------------------

export type AccountingKpis = {
  monthLabel: string;
  collectedMtd: number;
  outstandingAr: number;
  unpaidCount: number;
};

export type PaymentLedgerRow = {
  id: string;
  leadId: string | null;
  customerName: string;
  date: string | null;
  amount: number;
  method: string;
  status: string;
};

function demoAccountingKpis(now: Date): AccountingKpis {
  return {
    monthLabel: now.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    collectedMtd: 1650,
    outstandingAr: 1650,
    unpaidCount: 1,
  };
}

/** Collected-this-month and outstanding-A/R KPIs — real aggregate queries,
 * not a capped client-side reduce (the audit's confirmed >100-row MTD
 * undercount bug this rebuild exists to fix, current-tms-audit.md §19).
 * Outstanding A/R is scoped to finalized quotes sent in the last 180 days
 * — a real one-operator business's genuinely open A/R is recent business,
 * and an unbounded all-time scan isn't needed to answer "what's owed now"
 * (v2-architecture.md §3c's date-scoped-by-default rule). */
export async function getAccountingKpis(): Promise<AccountingKpis> {
  const now = new Date();
  if (await isDemoMode()) return demoAccountingKpis(now);

  const sb = createServiceRoleClient();
  const monthStartIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const windowStartIso = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: mtdPayments }, { data: fqRows }] = await Promise.all([
    sb
      .from("payments")
      .select("amount, status, received_at")
      .is("deleted_at", null)
      .gte("received_at", monthStartIso)
      .returns<{ amount: number | string; status: string | null; received_at: string | null }[]>(),
    sb
      .from("finalized_quotes")
      .select("id, total_amount, sent_at")
      .not("sent_at", "is", null)
      .gte("sent_at", windowStartIso)
      .order("sent_at", { ascending: false })
      .limit(500)
      .returns<{ id: string; total_amount: number | string | null; sent_at: string | null }[]>(),
  ]);

  const collectedMtd = (mtdPayments ?? [])
    .filter((p) => (p.status ?? "completed") === "completed")
    .reduce((s, p) => s + num(p.amount), 0);

  const fqs = fqRows ?? [];
  const fqIds = fqs.map((f) => f.id);
  const paidByFq = new Map<string, number>();
  if (fqIds.length > 0) {
    const { data: fqPayments } = await sb
      .from("payments")
      .select("finalized_quote_id, amount, status")
      .is("deleted_at", null)
      .in("finalized_quote_id", fqIds)
      .returns<{ finalized_quote_id: string; amount: number | string; status: string | null }[]>();
    for (const p of fqPayments ?? []) {
      if ((p.status ?? "completed") !== "completed") continue;
      paidByFq.set(p.finalized_quote_id, (paidByFq.get(p.finalized_quote_id) ?? 0) + num(p.amount));
    }
  }

  let outstandingAr = 0;
  let unpaidCount = 0;
  for (const fq of fqs) {
    const total = numOrNull(fq.total_amount);
    if (total == null) continue;
    const paid = paidByFq.get(fq.id) ?? 0;
    const outstanding = Math.max(0, total - paid);
    if (outstanding > 0.5) {
      outstandingAr += outstanding;
      unpaidCount += 1;
    }
  }

  return {
    monthLabel: now.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    collectedMtd,
    outstandingAr,
    unpaidCount,
  };
}

function demoPaymentLedger(page: number, pageSize: number): Paginated<PaymentLedgerRow> {
  const rows: PaymentLedgerRow[] = [
    {
      id: "demo-payment-1",
      leadId: "demo-lead-2",
      customerName: "M. Alvarez (Demo)",
      date: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
      amount: 1650,
      method: "card_in_person",
      status: "completed",
    },
  ];
  const { from, to } = pageRange(page, pageSize);
  return toPaginated(rows.slice(from, to + 1), rows.length, page, pageSize);
}

/** Recent payments ledger, paginated (v2-architecture.md §3c) — every
 * method (wire/ACH/check/card/Stripe), newest received first. */
export async function listPaymentLedger(opts: { page?: number; pageSize?: number } = {}): Promise<Paginated<PaymentLedgerRow>> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 25;
  if (await isDemoMode()) return demoPaymentLedger(page, pageSize);

  const sb = createServiceRoleClient();
  const { from, to } = pageRange(page, pageSize);
  const { data, count } = await sb
    .from("payments")
    .select("id, quote_request_id, amount, method, status, received_at, recorded_at", { count: "exact" })
    .is("deleted_at", null)
    .order("received_at", { ascending: false, nullsFirst: false })
    .range(from, to)
    .returns<
      {
        id: string;
        quote_request_id: string | null;
        amount: number | string;
        method: string | null;
        status: string | null;
        received_at: string | null;
        recorded_at: string | null;
      }[]
    >();

  const rows = data ?? [];
  const leadIds = Array.from(new Set(rows.map((r) => r.quote_request_id).filter((x): x is string => !!x)));
  const nameById = new Map<string, string>();
  if (leadIds.length > 0) {
    const { data: leads } = await sb.from("quote_requests").select("id, name").in("id", leadIds).returns<{ id: string; name: string | null }[]>();
    for (const l of leads ?? []) nameById.set(l.id, l.name?.trim() || "—");
  }

  const ledger: PaymentLedgerRow[] = rows.map((p) => ({
    id: p.id,
    leadId: p.quote_request_id,
    customerName: p.quote_request_id ? nameById.get(p.quote_request_id) ?? "—" : "—",
    date: p.received_at ?? p.recorded_at,
    amount: num(p.amount),
    method: (p.method ?? "other").trim(),
    status: (p.status ?? "completed").trim(),
  }));

  return toPaginated(ledger, count ?? 0, page, pageSize);
}

// ---------------------------------------------------------------------------
// Pipeline detail — /tms-v2/operations/[id] (v2-design.md §14, read-only)
// ---------------------------------------------------------------------------

export type EstimateSummary = {
  id: string;
  sentAt: string | null;
  linehaulLow: number | null;
  linehaulHigh: number | null;
  expirationAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
};

export type FinalizedQuoteSummary = {
  id: string;
  number: string;
  sentAt: string | null;
  totalAmount: number | null;
  confirmedAt: string | null;
  paymentDueAt: string | null;
};

export type BolSummary = {
  id: string;
  number: string;
  sentAt: string | null;
  issueDate: string | null;
};

export type PaymentEntry = {
  id: string;
  amount: number;
  method: string;
  status: string;
  receivedAt: string | null;
  reference: string | null;
};

export type PipelineEventEntry = {
  id: string;
  kind: DispatchEventKind | string;
  payload: unknown;
  createdAt: string;
};

export type ShipmentIntakeSummary = {
  status: "in_progress" | "submitted";
  pickup: { company: string | null; contactName: string | null; contactPhone: string | null; address: string | null; window: string | null };
  delivery: { company: string | null; contactName: string | null; contactPhone: string | null; address: string | null; window: string | null };
  commodityDetails: string | null;
  dimensions: string | null;
  exactWeightLbs: number | null;
  loadingResponsibility: string | null;
  unloadingResponsibility: string | null;
  specialRequirements: string | null;
  notes: string | null;
  submittedAt: string | null;
};

export type PipelineDetail = {
  identity: {
    id: string;
    name: string;
    email: string;
    phone: string;
    commodity: string;
    weight: string;
    notes: string | null;
    leadStatus: LeadStatus | string;
    leadStatusUpdatedAt: string | null;
    createdAt: string;
    originLabel: string;
    destLabel: string;
    pickupDate: string | null;
    miles: number | null;
  };
  shipment: ShipmentIntakeSummary | null;
  estimates: EstimateSummary[];
  finalizedQuotes: FinalizedQuoteSummary[];
  bols: BolSummary[];
  payment: { summary: PaymentSummary; entries: PaymentEntry[] };
  events: PipelineEventEntry[];
};

function addressLine(company: string | null, line1: string | null, city: string | null, state: string | null, zip: string | null): string | null {
  const cityState = [city, state].filter(Boolean).join(", ");
  const parts = [company, line1, [cityState, zip].filter(Boolean).join(" ")].filter((p) => p && p.trim());
  return parts.length > 0 ? parts.join(" · ") : null;
}

function demoPipelineDetail(id: string): PipelineDetail | null {
  const lead = DEMO_LEADS.find((l) => l.id === id);
  if (!lead) return null;
  const now = new Date();
  return {
    identity: {
      id: lead.id,
      name: lead.name ?? "Unnamed request",
      email: "demo@example.com",
      phone: "(555) 010-0100",
      commodity: lead.commodity?.trim() || "—",
      weight: formatWeight(lead.weight),
      notes: "Demo lead — no changes are saved.",
      leadStatus: lead.lead_status,
      leadStatusUpdatedAt: lead.lead_status_updated_at,
      createdAt: lead.created_at,
      originLabel: placeLabel(lead.pickup_city, lead.pickup_state, lead.pickup_zip),
      destLabel: placeLabel(lead.delivery_city, lead.delivery_state, lead.delivery_zip),
      pickupDate: null,
      miles: 420,
    },
    shipment: null,
    estimates:
      lead.lead_status === "new"
        ? []
        : [
            {
              id: "demo-estimate-1",
              sentAt: new Date(now.getTime() - 30 * 60 * 60 * 1000).toISOString(),
              linehaulLow: 1400,
              linehaulHigh: 1650,
              expirationAt: null,
              acceptedAt: null,
              declinedAt: null,
            },
          ],
    finalizedQuotes:
      lead.lead_status === "awaiting_payment"
        ? [
            {
              id: "demo-fq-1",
              number: "RC-2026-0001",
              sentAt: new Date(now.getTime() - 20 * 60 * 60 * 1000).toISOString(),
              totalAmount: 1650,
              confirmedAt: null,
              paymentDueAt: null,
            },
          ]
        : [],
    bols: [],
    payment: {
      summary: computePaymentSummary(lead.lead_status === "awaiting_payment" ? 1650 : null, []),
      entries: [],
    },
    events: [
      { id: "demo-event-1", kind: "lead_received", payload: { source: "quick_quote_form" }, createdAt: lead.created_at },
    ],
  };
}

export async function getPipelineDetail(id: string): Promise<PipelineDetail | null> {
  if (await isDemoMode()) return demoPipelineDetail(id);

  const sb = createServiceRoleClient();

  const { data: lead } = await sb
    .from("quote_requests")
    .select(
      "id, created_at, name, email, phone, commodity, weight, notes, lead_status, lead_status_updated_at, pickup_city, pickup_state, pickup_zip, delivery_city, delivery_state, delivery_zip, pickup_date, calculated_miles, deleted_at",
    )
    .eq("id", id)
    .maybeSingle<
      LeadDbRow & {
        email: string;
        phone: string;
        notes: string | null;
        pickup_date: string | null;
        calculated_miles: number | string | null;
        deleted_at: string | null;
      }
    >();

  if (!lead || lead.deleted_at) return null;

  const [{ data: estimateRows }, { data: fqRows }, { data: bolRows }, { data: paymentRows }, { data: eventRows }] = await Promise.all([
    sb
      .from("dispatch_estimates")
      .select("id, sent_at, linehaul_low, linehaul_high, expiration_at, accepted_at, declined_at, created_at")
      .eq("quote_request_id", id)
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<
        { id: string; sent_at: string | null; linehaul_low: number | string | null; linehaul_high: number | string | null; expiration_at: string | null; accepted_at: string | null; declined_at: string | null; created_at: string }[]
      >(),
    sb
      .from("finalized_quotes")
      .select("id, finalized_quote_number, sent_at, total_amount, confirmed_at, payment_due_at, created_at")
      .eq("quote_request_id", id)
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<
        { id: string; finalized_quote_number: string; sent_at: string | null; total_amount: number | string | null; confirmed_at: string | null; payment_due_at: string | null; created_at: string }[]
      >(),
    sb
      .from("bills_of_lading")
      .select("id, bol_number, sent_at, issue_date, created_at")
      .eq("quote_request_id", id)
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<{ id: string; bol_number: string; sent_at: string | null; issue_date: string | null; created_at: string }[]>(),
    sb
      .from("payments")
      .select("id, amount, method, status, received_at, reference, finalized_quote_id")
      .eq("quote_request_id", id)
      .is("deleted_at", null)
      .order("received_at", { ascending: false, nullsFirst: false })
      .limit(50)
      .returns<{ id: string; amount: number | string; method: string | null; status: string | null; received_at: string | null; reference: string | null; finalized_quote_id: string }[]>(),
    sb
      .from("dispatch_events")
      .select("id, kind, payload, created_at")
      .eq("quote_request_id", id)
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<{ id: string; kind: string; payload: unknown; created_at: string }[]>(),
  ]);

  const estimates = estimateRows ?? [];
  const finalizedQuotes = fqRows ?? [];

  // Shipment intake is keyed by dispatch_estimate_id — pull it for
  // whichever estimate has one, most recent first (mirrors the audit's
  // "one row per estimate" note, current-tms-audit.md §28).
  let shipment: ShipmentIntakeSummary | null = null;
  if (estimates.length > 0) {
    const { data: intakeRows } = await sb
      .from("shipment_intake")
      .select(
        "dispatch_estimate_id, status, pickup_company, pickup_contact_name, pickup_contact_phone, pickup_address_line1, pickup_city, pickup_state, pickup_zip, pickup_window, delivery_company, delivery_contact_name, delivery_contact_phone, delivery_address_line1, delivery_city, delivery_state, delivery_zip, delivery_window, commodity_details, length_in, width_in, height_in, exact_weight_lbs, loading_responsibility, unloading_responsibility, special_requirements, notes, submitted_at, created_at",
      )
      .in(
        "dispatch_estimate_id",
        estimates.map((e) => e.id),
      )
      .order("created_at", { ascending: false })
      .limit(5)
      .returns<
        {
          dispatch_estimate_id: string;
          status: "in_progress" | "submitted";
          pickup_company: string | null;
          pickup_contact_name: string | null;
          pickup_contact_phone: string | null;
          pickup_address_line1: string | null;
          pickup_city: string | null;
          pickup_state: string | null;
          pickup_zip: string | null;
          pickup_window: string | null;
          delivery_company: string | null;
          delivery_contact_name: string | null;
          delivery_contact_phone: string | null;
          delivery_address_line1: string | null;
          delivery_city: string | null;
          delivery_state: string | null;
          delivery_zip: string | null;
          delivery_window: string | null;
          commodity_details: string | null;
          length_in: number | string | null;
          width_in: number | string | null;
          height_in: number | string | null;
          exact_weight_lbs: number | string | null;
          loading_responsibility: string | null;
          unloading_responsibility: string | null;
          special_requirements: string | null;
          notes: string | null;
          submitted_at: string | null;
          created_at: string;
        }[]
      >();
    const intake = (intakeRows ?? [])[0];
    if (intake) {
      const dims = [intake.length_in, intake.width_in, intake.height_in].map(numOrNull);
      const dimensions = dims.every((d) => d != null) ? `${dims[0]}" × ${dims[1]}" × ${dims[2]}"` : null;
      shipment = {
        status: intake.status,
        pickup: {
          company: intake.pickup_company,
          contactName: intake.pickup_contact_name,
          contactPhone: intake.pickup_contact_phone,
          address: addressLine(null, intake.pickup_address_line1, intake.pickup_city, intake.pickup_state, intake.pickup_zip),
          window: intake.pickup_window,
        },
        delivery: {
          company: intake.delivery_company,
          contactName: intake.delivery_contact_name,
          contactPhone: intake.delivery_contact_phone,
          address: addressLine(null, intake.delivery_address_line1, intake.delivery_city, intake.delivery_state, intake.delivery_zip),
          window: intake.delivery_window,
        },
        commodityDetails: intake.commodity_details,
        dimensions,
        exactWeightLbs: numOrNull(intake.exact_weight_lbs),
        loadingResponsibility: intake.loading_responsibility,
        unloadingResponsibility: intake.unloading_responsibility,
        specialRequirements: intake.special_requirements,
        notes: intake.notes,
        submittedAt: intake.submitted_at,
      };
    }
  }

  // Payment summary — total from the most recently SENT finalized quote;
  // payments span every finalized quote on this lead (re-issues share the
  // lead), matching computePaymentSummary's contract (src/lib/dispatch/payment.ts).
  const latestSentFq = finalizedQuotes.find((f) => f.sent_at != null) ?? null;
  const payments = paymentRows ?? [];
  const paymentSummary = computePaymentSummary(
    numOrNull(latestSentFq?.total_amount),
    payments.filter((p) => (p.status ?? "completed") === "completed").map((p) => ({ amount: num(p.amount) })),
  );

  return {
    identity: {
      id: lead.id,
      name: lead.name?.trim() || "Unnamed request",
      email: lead.email,
      phone: lead.phone,
      commodity: lead.commodity?.trim() || "—",
      weight: formatWeight(lead.weight),
      notes: lead.notes,
      leadStatus: lead.lead_status,
      leadStatusUpdatedAt: lead.lead_status_updated_at,
      createdAt: lead.created_at,
      originLabel: placeLabel(lead.pickup_city, lead.pickup_state, lead.pickup_zip),
      destLabel: placeLabel(lead.delivery_city, lead.delivery_state, lead.delivery_zip),
      pickupDate: lead.pickup_date,
      miles: numOrNull(lead.calculated_miles),
    },
    shipment,
    estimates: estimates.map((e) => ({
      id: e.id,
      sentAt: e.sent_at,
      linehaulLow: numOrNull(e.linehaul_low),
      linehaulHigh: numOrNull(e.linehaul_high),
      expirationAt: e.expiration_at,
      acceptedAt: e.accepted_at,
      declinedAt: e.declined_at,
    })),
    finalizedQuotes: finalizedQuotes.map((f) => ({
      id: f.id,
      number: f.finalized_quote_number,
      sentAt: f.sent_at,
      totalAmount: numOrNull(f.total_amount),
      confirmedAt: f.confirmed_at,
      paymentDueAt: f.payment_due_at,
    })),
    bols: (bolRows ?? []).map((b) => ({ id: b.id, number: b.bol_number, sentAt: b.sent_at, issueDate: b.issue_date })),
    payment: {
      summary: paymentSummary,
      entries: payments.map((p) => ({
        id: p.id,
        amount: num(p.amount),
        method: (p.method ?? "other").trim(),
        status: (p.status ?? "completed").trim(),
        receivedAt: p.received_at,
        reference: p.reference,
      })),
    },
    events: (eventRows ?? []).map((e) => ({ id: e.id, kind: e.kind, payload: e.payload, createdAt: e.created_at })),
  };
}
