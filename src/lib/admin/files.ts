import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  loadDocName,
  normalizeLoadDocKind,
  receiptName,
  shortDate,
} from "@/lib/admin/doc-name";

/**
 * Admin → Files: one newest-first timeline aggregating EVERY uploaded file
 * across the app, so Brent can find any document by (broker) load number.
 *
 * Sources aggregated (read-only — no writes, no new tables):
 *   1. load_documents        — rate con / BOL / POD / signed BOL (bucket
 *                              `load-documents`), tied to a load.
 *   2. repair_attachments    — maintenance receipts (bucket
 *                              `maintenance-receipts`), tied to a service.
 *   3. shipment_intake_uploads — customer quote/application uploads (bucket
 *                              `intake-uploads`), tied to a quote request.
 *
 * The loader returns lightweight METADATA only (no signed URLs, no bytes).
 * Signing is done lazily per visible page via the `signFiles` server action —
 * so search runs over the whole set client-side while storage work stays
 * bounded to what's on screen.
 */

/** Storage buckets we're allowed to sign for (guards the sign action). */
export const FILE_BUCKETS = {
  load: "load-documents",
  receipt: "maintenance-receipts",
  intake: "intake-uploads",
} as const;

export type FileSource = "load" | "receipt" | "intake";

/** Auto-derived category — drives the type chip AND the filter chips. */
export type FileCategory =
  | "rate_con"
  | "bol"
  | "signed_bol"
  | "pod"
  | "load_other"
  | "receipt"
  | "application";

export type FileItem = {
  /** Globally unique across sources: `${source}:${rowId}`. */
  id: string;
  source: FileSource;
  category: FileCategory;
  /** Chip text, e.g. "Rate con" / "Signed BOL" / "Receipt". */
  typeLabel: string;
  /** Auto-computed name (never the raw filename). */
  name: string;
  /** What it belongs to (load + lane, or the service/part, or the customer). */
  subtitle: string;
  /** Link to the parent record (load detail / maintenance / quote). */
  parentHref: string;
  /** Upload/created timestamp (ISO) — the sort key. */
  createdAt: string;
  /** Short display date, e.g. "Jul 9". */
  dateLabel: string;
  isImage: boolean;
  bucket: string;
  storagePath: string;
  /** Small WebP thumbnail path (images only; null for PDFs / intake). */
  thumbPath: string | null;
  /** Lowercased blob matched by the search box (load #, broker, lane, …). */
  searchText: string;
};

function isImageMime(mime: string | null): boolean {
  return (mime ?? "").startsWith("image/");
}

function loadDocType(kind: string, signed: boolean): {
  category: FileCategory;
  label: string;
} {
  if (kind === "rate_con") return { category: "rate_con", label: "Rate con" };
  if (kind === "bol")
    return signed
      ? { category: "signed_bol", label: "Signed BOL" }
      : { category: "bol", label: "BOL" };
  if (kind === "pod") return { category: "pod", label: "POD" };
  return { category: "load_other", label: "Doc" };
}

type LoadDocRow = {
  id: string;
  load_id: string;
  kind: string;
  original_filename: string | null;
  storage_path: string;
  thumb_path: string | null;
  mime_type: string | null;
  signed_from_doc_id: string | null;
  created_at: string;
};

type ReceiptRow = {
  id: string;
  service_id: string;
  file_path: string;
  thumb_path: string | null;
  file_name: string | null;
  content_type: string | null;
  created_at: string;
};

type IntakeRow = {
  id: string;
  quote_request_id: string;
  original_filename: string | null;
  mime_type: string | null;
  storage_path: string;
  note: string | null;
  source: "quick_quote" | "customer_intake" | null;
  created_at: string;
};

/**
 * Load the full aggregated timeline (metadata only), newest first. Cheap: a
 * handful of small-column queries plus in-memory joins. Documents whose parent
 * load or quote was (soft-)deleted are dropped so the timeline never links to a
 * trashed record.
 */
export async function loadAllFiles(): Promise<FileItem[]> {
  const sb = createServiceRoleClient();

  const [
    { data: loadDocRows },
    { data: liveLoadRows },
    { data: receiptRows },
    { data: serviceRows },
    { data: entryRows },
    { data: intakeRows },
    { data: liveQuoteRows },
  ] = await Promise.all([
    sb
      .from("load_documents")
      .select(
        "id, load_id, kind, original_filename, storage_path, thumb_path, mime_type, signed_from_doc_id, created_at",
      )
      .order("created_at", { ascending: false })
      .returns<LoadDocRow[]>(),
    sb
      .from("loads")
      .select("id, load_number, broker_name, origin, destination")
      .is("deleted_at", null)
      .returns<{
        id: string;
        load_number: string | null;
        broker_name: string | null;
        origin: string | null;
        destination: string | null;
      }[]>(),
    sb
      .from("repair_attachments")
      .select(
        "id, service_id, file_path, thumb_path, file_name, content_type, created_at",
      )
      .order("created_at", { ascending: false })
      .returns<ReceiptRow[]>(),
    sb
      .from("repair_services")
      .select("id, service_date, shop")
      .returns<{ id: string; service_date: string | null; shop: string | null }[]>(),
    sb
      .from("repair_entries")
      .select("id, service_id, description")
      .is("deleted_at", null)
      // Ascending so names[0] / firstEntryId are the FIRST part on the service.
      .order("created_at", { ascending: true })
      .returns<{ id: string; service_id: string; description: string | null }[]>(),
    sb
      .from("shipment_intake_uploads")
      .select(
        "id, quote_request_id, original_filename, mime_type, storage_path, note, source, created_at",
      )
      .order("created_at", { ascending: false })
      .returns<IntakeRow[]>(),
    sb
      .from("quote_requests")
      .select(
        "id, name, email, commodity, pickup_city, pickup_state, delivery_city, delivery_state",
      )
      .is("deleted_at", null)
      .returns<{
        id: string;
        name: string | null;
        email: string | null;
        commodity: string | null;
        pickup_city: string | null;
        pickup_state: string | null;
        delivery_city: string | null;
        delivery_state: string | null;
      }[]>(),
  ]);

  const loadById = new Map((liveLoadRows ?? []).map((l) => [l.id, l]));
  const serviceById = new Map((serviceRows ?? []).map((s) => [s.id, s]));
  const quoteById = new Map((liveQuoteRows ?? []).map((q) => [q.id, q]));

  // service_id → its parts (first entry id anchors the parent link).
  const partsByService = new Map<
    string,
    { names: string[]; firstEntryId: string | null }
  >();
  for (const e of entryRows ?? []) {
    const bucket = partsByService.get(e.service_id) ?? {
      names: [],
      firstEntryId: null,
    };
    const name = e.description?.trim();
    if (name) bucket.names.push(name);
    if (!bucket.firstEntryId) bucket.firstEntryId = e.id;
    partsByService.set(e.service_id, bucket);
  }

  // Number same-type (and same signed-ness) load docs per load, in UPLOAD order,
  // so the canonical name gets "RC 1 / RC 2 …" only when siblings exist. Display
  // is authoritative — it recomputes numbering for old files too.
  const loadDocSeq = new Map<string, { index: number; total: number }>();
  {
    const groups = new Map<string, LoadDocRow[]>();
    for (const d of loadDocRows ?? []) {
      const key = `${d.load_id}|${normalizeLoadDocKind(d.kind)}|${d.signed_from_doc_id ? "s" : "u"}`;
      const arr = groups.get(key) ?? [];
      arr.push(d);
      groups.set(key, arr);
    }
    for (const arr of groups.values()) {
      arr.sort((a, b) =>
        a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
      );
      arr.forEach((d, i) =>
        loadDocSeq.set(d.id, { index: i + 1, total: arr.length }),
      );
    }
  }

  const items: FileItem[] = [];

  // ── Load documents ────────────────────────────────────────────────────────
  for (const d of loadDocRows ?? []) {
    const load = loadById.get(d.load_id);
    if (!load) continue; // parent load deleted → skip
    const signed = !!d.signed_from_doc_id;
    const { category, label } = loadDocType(d.kind, signed);
    const loadNumber = load.load_number?.trim() || "—";
    const broker = load.broker_name?.trim() || "";
    const origin = load.origin?.trim() || "";
    const destination = load.destination?.trim() || "";
    const lane = origin && destination ? `${origin} → ${destination}` : origin || destination;
    const subtitle = [broker, lane].filter(Boolean).join(" · ") || "Load";
    const seq = loadDocSeq.get(d.id) ?? { index: 1, total: 1 };
    const name = loadDocName({
      kind: normalizeLoadDocKind(d.kind),
      loadNumber: load.load_number,
      broker: load.broker_name,
      signed,
      index: seq.index,
      total: seq.total,
    });
    items.push({
      id: `load:${d.id}`,
      source: "load",
      category,
      typeLabel: label,
      name,
      subtitle,
      parentHref: `/admin/dispatch/loads/${d.load_id}`,
      createdAt: d.created_at,
      dateLabel: shortDate(d.created_at),
      isImage: isImageMime(d.mime_type),
      bucket: FILE_BUCKETS.load,
      storagePath: d.storage_path,
      thumbPath: d.thumb_path,
      searchText: [
        name,
        loadNumber,
        broker,
        origin,
        destination,
        label,
        d.original_filename ?? "",
      ]
        .join(" ")
        .toLowerCase(),
    });
  }

  // ── Maintenance receipts ──────────────────────────────────────────────────
  for (const r of receiptRows ?? []) {
    const service = serviceById.get(r.service_id);
    const parts = partsByService.get(r.service_id);
    const partNames =
      parts && parts.names.length > 0 ? parts.names.join(", ") : "Service";
    const svcDate = service?.service_date ?? r.created_at;
    const shop = service?.shop?.trim() || "";
    const parentHref = parts?.firstEntryId
      ? `/admin/maintenance/${parts.firstEntryId}`
      : "/admin/maintenance";
    // Canonical: "<first part name> - <service date>".
    const name = receiptName({
      firstPartName: parts?.names[0] ?? null,
      date: svcDate,
    });
    items.push({
      id: `receipt:${r.id}`,
      source: "receipt",
      category: "receipt",
      typeLabel: "Receipt",
      name,
      subtitle: shop ? `Maintenance · ${shop}` : "Maintenance",
      parentHref,
      // Sort by upload time (the attachment's own created_at).
      createdAt: r.created_at,
      dateLabel: shortDate(r.created_at),
      isImage: isImageMime(r.content_type),
      bucket: FILE_BUCKETS.receipt,
      storagePath: r.file_path,
      thumbPath: r.thumb_path,
      searchText: [name, partNames, shop, "receipt maintenance", r.file_name ?? ""]
        .join(" ")
        .toLowerCase(),
    });
  }

  // ── Customer quote / application uploads ──────────────────────────────────
  for (const u of intakeRows ?? []) {
    const quote = quoteById.get(u.quote_request_id);
    if (!quote) continue; // parent quote deleted → skip
    const typeLabel = u.source === "quick_quote" ? "Quote" : "Application";
    const customer = quote.name?.trim() || "Customer";
    const origin =
      quote.pickup_city && quote.pickup_state
        ? `${quote.pickup_city}, ${quote.pickup_state}`
        : "";
    const destination =
      quote.delivery_city && quote.delivery_state
        ? `${quote.delivery_city}, ${quote.delivery_state}`
        : "";
    const lane = origin && destination ? `${origin} → ${destination}` : "";
    const subtitle =
      lane || quote.commodity?.trim() || "Quote request";
    items.push({
      id: `intake:${u.id}`,
      source: "intake",
      category: "application",
      typeLabel,
      name: `${customer} · ${typeLabel} · ${shortDate(u.created_at)}`,
      subtitle,
      parentHref: `/admin/quotes/${u.quote_request_id}`,
      createdAt: u.created_at,
      dateLabel: shortDate(u.created_at),
      isImage: isImageMime(u.mime_type),
      bucket: FILE_BUCKETS.intake,
      storagePath: u.storage_path,
      thumbPath: null,
      searchText: [
        customer,
        quote.email ?? "",
        quote.commodity ?? "",
        origin,
        destination,
        typeLabel,
        u.original_filename ?? "",
      ]
        .join(" ")
        .toLowerCase(),
    });
  }

  // One newest-first timeline across all sources.
  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return items;
}
