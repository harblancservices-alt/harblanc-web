/**
 * Typed, paginated, scoped query module for `loads` (v2-architecture.md
 * §3c). This is the ONLY file a /tms-v2 screen imports to read load data —
 * it never constructs a Supabase client itself; every function resolves
 * the current `DataSource` (§10, real DB or demo dataset) and delegates.
 * That indirection is what makes demo-mode isolation and query-shape
 * scoping structural rather than a convention a future caller could skip.
 */

import { resolveDataSource } from "@/lib/demo/resolve";
import type { Paginated } from "./pagination";
import { computeCarrierAR, type LoadFinancials } from "@/lib/domain/money";
import { periodLabel, type Period } from "@/lib/domain/attribution";
import { isDemoMode } from "@/lib/admin/demo";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { loadDocName, normalizeLoadDocKind } from "@/lib/admin/doc-name";
import { buildDemoData } from "@/lib/demo/demo-dataset";
import { getBrokerById } from "./brokers";
import { listExpenses } from "./expenses";

export type LoadStatus = "pending" | "assigned" | "loaded" | "delivered" | "tonu";

export type LoadWithFinancials = {
  id: string;
  loadNumber: string | null;
  brokerId: string | null;
  brokerName: string | null;
  brokerFactoring: boolean;
  tripId: string | null;
  tripName: string | null;
  origin: string | null;
  destination: string | null;
  pickupDate: string | null;
  deliveryDate: string | null;
  status: LoadStatus;
  paymentStatus: "unpaid" | "paid";
  paidAt: string | null;
  createdAt: string | null;
  /** The load's period-attribution date (v2-architecture.md §3b) — pickup
   * date, always, with fallbacks only for legacy rows missing it. */
  attributionDate: string | null;
  /** Odometer readings — already part of every DataSource load query
   * (LOAD_COLUMNS), just not previously exposed on this base type. Lets a
   * list screen (Today's Active Loads) offer inline odometer entry without
   * a second per-row fetch. */
  odoAssigned: number | null;
  odoLoaded: number | null;
  odoDelivered: number | null;
  financials: LoadFinancials;
};

export type ListLoadsOptions = {
  page?: number;
  pageSize?: number;
  /** Clips the query to one calendar period by pickup_date — the one
   * profit-attribution rule, applied at the query layer so a period view
   * never reads rows outside it (v2-architecture.md §3b/§3c). */
  period?: Period;
  brokerId?: string;
  status?: LoadStatus;
};

export async function listLoads(opts: ListLoadsOptions = {}): Promise<Paginated<LoadWithFinancials>> {
  const ds = await resolveDataSource();
  return ds.listLoads(opts);
}

export async function getLoadById(id: string): Promise<LoadWithFinancials | null> {
  const ds = await resolveDataSource();
  return ds.getLoadById(id);
}

/** Loads not yet closed out (pending/assigned/loaded) — what's currently
 * on the road. Bounded by `limit`, not a status-filtered full scan. */
export async function listActiveLoads(limit = 20): Promise<LoadWithFinancials[]> {
  const ds = await resolveDataSource();
  return ds.listActiveLoads(limit);
}

export type ArchivedLoadRow = { id: string; loadNumber: string | null; brokerName: string | null; deletedAt: string };

/** Soft-deleted loads — the Load Board's trash section (Phase 6 item 4), a
 * genuinely new capability neither /admin nor tms-v2 had before this. */
export async function listArchivedLoads(): Promise<ArchivedLoadRow[]> {
  if (await isDemoMode()) return [];

  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("loads")
    .select("id, load_number, broker_name, deleted_at")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(50)
    .returns<{ id: string; load_number: string | null; broker_name: string | null; deleted_at: string | null }[]>();

  return (data ?? [])
    .filter((l) => l.deleted_at !== null)
    .map((l) => ({ id: l.id, loadNumber: l.load_number, brokerName: l.broker_name, deletedAt: l.deleted_at as string }));
}

// ---------------------------------------------------------------------------
// Load Board KPI strip (v2-design.md §4).
// ---------------------------------------------------------------------------

export type LoadBoardSummary = {
  period: Period;
  periodLabel: string;
  gross: number;
  net: number;
  loadsCount: number;
  ratePerMile: number | null;
  deadheadPct: number | null;
  arOutstanding: number;
};

/**
 * The Load Board's KPI strip (Gross/Net/Loads/$/mi/Deadhead/A-R), one
 * period at a time. Bounded to `pageSize: 200` — a realistic cap for a
 * one-truck operation's monthly volume, the same pattern
 * `getTodaySummary()` (lib/data/dashboard.ts) already uses for its own
 * period-scoped aggregate — never the whole `loads` table. The board's row
 * list itself is fetched separately via `listLoads()` at the display page
 * size, so KPI aggregation and row display can page independently.
 *
 * A/R here is scoped to THIS period's own closed-out loads (still the one
 * `computeCarrierAR` rule, v2-architecture.md §3a) so the whole KPI strip
 * stays period-consistent — an all-time carrier A/R figure belongs to a
 * dedicated Receivables screen (a later phase), not this month's board.
 */
export async function getLoadBoardSummary(period: Period): Promise<LoadBoardSummary> {
  const { rows } = await listLoads({ period, pageSize: 200 });
  const gross = rows.reduce((s, l) => s + l.financials.gross, 0);
  const net = rows.reduce((s, l) => s + l.financials.net, 0);
  const loadedMiles = rows.reduce((s, l) => s + l.financials.loadedMiles, 0);
  const deadheadMiles = rows.reduce((s, l) => s + l.financials.deadheadMiles, 0);
  const totalMiles = loadedMiles + deadheadMiles;
  const ar = computeCarrierAR(
    rows.map((l) => ({
      id: l.id,
      status: l.status,
      paymentStatus: l.paymentStatus,
      deliveryDate: l.deliveryDate,
      // financials.gross already resolves to "rate, or tonu_amount when
      // TONU'd" — computeCarrierAR only reads whichever of the two its own
      // status check picks, so passing the same resolved figure for both
      // raw inputs yields the identical amount either branch takes.
      rate: l.financials.gross,
      tonuAmount: l.financials.gross,
    })),
  );
  return {
    period,
    periodLabel: periodLabel(period),
    gross,
    net,
    loadsCount: rows.length,
    ratePerMile: loadedMiles > 0 ? gross / loadedMiles : null,
    deadheadPct: totalMiles > 0 ? (deadheadMiles / totalMiles) * 100 : null,
    arOutstanding: ar.totalOutstanding,
  };
}

// ---------------------------------------------------------------------------
// Load Detail (v2-design.md §5) — the base DataSource-backed financials
// (works in both live and demo mode, via getLoadById above) plus a handful
// of detail-only fields the shared DataSource interface doesn't expose yet:
// equipment, ZIPs, odometer readings, broker contact info, itemized
// expenses, and documents. v2-architecture.md §10 expects the interface to
// grow with the first caller that needs a method; this phase's single-file
// scope (loads.ts only — see the phase brief's concurrency note) fetches
// them directly instead, bounded to one load at a time and branching on
// `isDemoMode()` the same way src/lib/dispatch/pipeline.ts already does, so
// demo mode still never reaches Supabase. Folding this into the DataSource
// interface properly is a follow-up once that shared file isn't locked by
// concurrent work.
// ---------------------------------------------------------------------------

export type LoadExpenseItem = {
  id: string;
  category: string | null;
  amount: number;
  note: string | null;
};

export type LoadDocumentItem = {
  id: string;
  kind: string;
  name: string;
  url: string | null;
  sizeBytes: number | null;
  mime: string | null;
  /** Roles (receiver/carrier) signed on this BOL, resolved via its original
   * doc when this row IS a signed output. Ordered receiver-first. */
  signedRoles: string[];
  /** Set on a generated "— signed.pdf": the original doc it was stamped from. */
  signedFromDocId: string | null;
};

export const LOAD_DOC_KIND_LABEL: Record<string, string> = {
  rate_con: "Rate confirmation",
  bol: "Bill of lading",
  pod: "Proof of delivery",
};

export type LoadDetail = LoadWithFinancials & {
  equipment: string | null;
  originZip: string | null;
  destZip: string | null;
  odoAssigned: number | null;
  odoLoaded: number | null;
  odoDelivered: number | null;
  brokerMcNumber: string | null;
  brokerDotNumber: string | null;
  brokerPhone: string | null;
  brokerEmail: string | null;
  expenseItems: LoadExpenseItem[];
  documents: LoadDocumentItem[];
};

export async function getLoadDetail(id: string): Promise<LoadDetail | null> {
  const base = await getLoadById(id);
  if (!base) return null;

  const [broker, expensesPage] = await Promise.all([
    base.brokerId ? getBrokerById(base.brokerId) : Promise.resolve(null),
    listExpenses({ loadId: id, pageSize: 100 }),
  ]);
  const expenseItems: LoadExpenseItem[] = expensesPage.rows.map((e) => ({
    id: e.id,
    category: e.category,
    amount: e.amount,
    note: e.note,
  }));
  const brokerMcNumber = broker?.mcNumber ?? null;
  const brokerDotNumber = broker?.dotNumber ?? null;
  const brokerPhone = broker?.phone ?? null;
  const brokerEmail = broker?.email ?? null;

  if (await isDemoMode()) {
    const { loads } = buildDemoData();
    const demoLoad = loads.find((l) => l.id === id);
    return {
      ...base,
      equipment: null,
      originZip: null,
      destZip: null,
      odoAssigned: demoLoad?.odoAssigned ?? null,
      odoLoaded: demoLoad?.odoLoaded ?? null,
      odoDelivered: demoLoad?.odoDelivered ?? null,
      brokerMcNumber,
      brokerDotNumber,
      brokerPhone,
      brokerEmail,
      expenseItems,
      documents: [], // demo dataset ships no fake documents (v2-design.md's demo mode section)
    };
  }

  const sb = createServiceRoleClient();
  const [{ data: extraRow }, { data: docRows }, { data: sigRows }] = await Promise.all([
    sb
      .from("loads")
      .select("equipment, origin_zip, dest_zip, odo_assigned, odo_loaded, odo_delivered")
      .eq("id", id)
      .maybeSingle<{
        equipment: string | null;
        origin_zip: string | null;
        dest_zip: string | null;
        odo_assigned: number | null;
        odo_loaded: number | null;
        odo_delivered: number | null;
      }>(),
    sb
      .from("load_documents")
      .select("id, kind, original_filename, storage_path, size_bytes, mime_type, signed_from_doc_id")
      .eq("load_id", id)
      .order("created_at", { ascending: true })
      .returns<
        {
          id: string;
          kind: string;
          original_filename: string;
          storage_path: string;
          size_bytes: number | null;
          mime_type: string | null;
          signed_from_doc_id: string | null;
        }[]
      >(),
    sb.from("bol_signatures").select("doc_id, role").eq("load_id", id).returns<{ doc_id: string; role: string }[]>(),
  ]);

  // Which roles (receiver/carrier) are signed on each BOL, keyed by the
  // ORIGINAL doc — matches /admin's role-badge resolution exactly.
  const ROLE_ORDER = ["receiver", "carrier"];
  const rolesByDoc = new Map<string, string[]>();
  for (const s of sigRows ?? []) {
    const arr = rolesByDoc.get(s.doc_id) ?? [];
    if (!arr.includes(s.role)) arr.push(s.role);
    rolesByDoc.set(s.doc_id, arr);
  }

  const docs = docRows ?? [];
  let signedByPath = new Map<string, string>();
  if (docs.length > 0) {
    const { data: signedList } = await sb.storage
      .from("load-documents")
      .createSignedUrls(docs.map((d) => d.storage_path), 3600);
    signedByPath = new Map(
      (signedList ?? [])
        .filter((s): s is { path: string; signedUrl: string; error: null } => !!s.path && !!s.signedUrl && !s.error)
        .map((s) => [s.path, s.signedUrl]),
    );
  }
  // Numbering ("RC 1"/"RC 2" …) matches /admin's existing convention
  // (lib/admin/doc-name.ts): same-kind, same-signedness siblings numbered
  // in upload order, unnumbered when there's only one.
  const seqByGroup = new Map<string, number>();
  const totalByGroup = new Map<string, number>();
  for (const d of docs) {
    const key = `${d.kind}|${d.signed_from_doc_id ? "s" : "u"}`;
    totalByGroup.set(key, (totalByGroup.get(key) ?? 0) + 1);
  }
  const documents: LoadDocumentItem[] = docs.map((d) => {
    const key = `${d.kind}|${d.signed_from_doc_id ? "s" : "u"}`;
    const index = (seqByGroup.get(key) ?? 0) + 1;
    seqByGroup.set(key, index);
    const anchorId = d.signed_from_doc_id ?? d.id;
    const signedRoles = (rolesByDoc.get(anchorId) ?? [])
      .slice()
      .sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
    return {
      id: d.id,
      kind: d.kind,
      name: loadDocName({
        kind: normalizeLoadDocKind(d.kind),
        loadNumber: base.loadNumber,
        broker: base.brokerName,
        signed: !!d.signed_from_doc_id,
        index,
        total: totalByGroup.get(key) ?? 1,
      }),
      url: signedByPath.get(d.storage_path) ?? null,
      sizeBytes: d.size_bytes,
      mime: d.mime_type,
      signedRoles,
      signedFromDocId: d.signed_from_doc_id,
    };
  });

  return {
    ...base,
    equipment: extraRow?.equipment ?? null,
    originZip: extraRow?.origin_zip ?? null,
    destZip: extraRow?.dest_zip ?? null,
    odoAssigned: extraRow?.odo_assigned ?? null,
    odoLoaded: extraRow?.odo_loaded ?? null,
    odoDelivered: extraRow?.odo_delivered ?? null,
    brokerMcNumber,
    brokerDotNumber,
    brokerPhone,
    brokerEmail,
    expenseItems,
    documents,
  };
}
