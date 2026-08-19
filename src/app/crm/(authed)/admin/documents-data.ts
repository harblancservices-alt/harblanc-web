import { createCrmServerClient } from "@/lib/crm/auth";
import { renderPdfFirstPageToPng } from "@/lib/pdf/pdfPageThumbnail";
import type { AdminDocumentCard } from "./types";

const STORAGE_BUCKET = "crm-documents";
const SIGNED_URL_TTL_SECONDS = 300;
/** Same suffix/convention as ../settings/page.tsx's THUMB_SUFFIX — a
 * `<storagePath>.thumb.v3.png` sibling object holding a pre-rendered PNG of
 * the PDF's first page. Duplicated (not imported) because that file isn't
 * a shared module — same "one literal, several call sites" tradeoff already
 * accepted across the CRM's document code (see that file's own header). */
const THUMB_SUFFIX = ".thumb.v3.png";
/** Bounds how many missing thumbnails get rendered+uploaded on a single page
 * load — the org's RC/BOL volume has no cap, and a naive "backfill every
 * doc with no thumbnail yet" loop would make the Documents tab's render time
 * grow unboundedly as the library grows. Once a doc's thumbnail is rendered
 * once, every later visit finds it instantly via the plain signed-URL check
 * above — this only ever cost-bites the newest N documents that predate this
 * feature shipping, once each. */
const MAX_THUMB_BACKFILL_PER_LOAD = 40;

type RcRow = {
  id: string;
  shipment_id: string;
  rc_number: string;
  status: string;
  pdf_document_id: string | null;
  pdf_storage_path: string | null;
  created_by: string | null;
  created_at: string;
};

type BolRow = {
  id: string;
  shipment_id: string;
  bol_number: string;
  status: string;
  pdf_document_id: string | null;
  pdf_storage_path: string | null;
  created_by: string | null;
  created_at: string;
};

type ShipmentRow = { id: string; shipment_number: string; account_id: string | null; customer_name: string | null };
type ProfileRow = { id: string; full_name: string | null; email: string | null };

function profileName(p: ProfileRow | undefined): string | null {
  if (!p) return null;
  return p.full_name || p.email || "Unnamed";
}

/**
 * The Admin Account "Documents" tab — every Rate Confirmation + Bill of
 * Lading ever generated across every shipment in the org (crm_rate_
 * confirmations / crm_bills_of_lading, the same two tables
 * ../shipments/document-history-actions.ts::listAllDocuments reads), but
 * shaped for the approved mockup's preview-card grid rather than a table:
 * each card carries a rendered first-page thumbnail (same lazy
 * render-once-then-cache convention as ../settings/page.tsx's
 * OrgDocumentsSection backfill), the uploader's name (created_by joined
 * against crm_profiles), and the linked shipment + company.
 *
 * "pod" is a real option in AdminDocumentType/the page's type filter (the
 * approved mockup's RateCon/BOL/POD chip set), but this function can never
 * return one — proof-of-delivery has no crm_* table of its own; it only
 * exists in tms-v2 (a fully separate app/DB scope this feature must never
 * import from — see AGENTS.md's CRM/TMS separation and the task's explicit
 * "zero imports from src/app/tms-v2/**"). If CRM ever grows its own POD
 * concept, this is the one place a third query needs to join in.
 */
export async function listOperationalDocuments(): Promise<AdminDocumentCard[]> {
  const supabase = await createCrmServerClient();

  const [{ data: rcRows }, { data: bolRows }] = await Promise.all([
    supabase
      .from("crm_rate_confirmations")
      .select("id, shipment_id, rc_number, status, pdf_document_id, pdf_storage_path, created_by, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("crm_bills_of_lading")
      .select("id, shipment_id, bol_number, status, pdf_document_id, pdf_storage_path, created_by, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const shipmentIds = Array.from(
    new Set([
      ...((rcRows ?? []) as RcRow[]).map((r) => r.shipment_id),
      ...((bolRows ?? []) as BolRow[]).map((r) => r.shipment_id),
    ]),
  );
  const userIds = Array.from(
    new Set(
      [...((rcRows ?? []) as RcRow[]), ...((bolRows ?? []) as BolRow[])]
        .map((r) => r.created_by)
        .filter((v): v is string => !!v),
    ),
  );

  const [{ data: shipmentRows }, { data: profileRows }] = await Promise.all([
    shipmentIds.length
      ? supabase.from("crm_shipments").select("id, shipment_number, account_id, customer_name").in("id", shipmentIds)
      : Promise.resolve({ data: [] as ShipmentRow[] }),
    userIds.length
      ? supabase.from("crm_profiles").select("id, full_name, email").in("id", userIds)
      : Promise.resolve({ data: [] as ProfileRow[] }),
  ]);

  const shipmentById = new Map(((shipmentRows ?? []) as ShipmentRow[]).map((s) => [s.id, s]));
  const profileById = new Map(((profileRows ?? []) as ProfileRow[]).map((p) => [p.id, p]));

  const rcCards: AdminDocumentCard[] = ((rcRows ?? []) as RcRow[]).map((r) => {
    const shipment = shipmentById.get(r.shipment_id);
    return {
      id: r.id,
      docType: "rate_confirmation",
      number: r.rc_number,
      status: r.status,
      createdAt: r.created_at,
      shipmentId: r.shipment_id,
      shipmentNumber: shipment?.shipment_number ?? null,
      companyId: shipment?.account_id ?? null,
      companyName: shipment?.customer_name ?? null,
      uploadedById: r.created_by,
      uploadedByName: profileName(profileById.get(r.created_by ?? "")),
      pdfStoragePath: r.pdf_storage_path,
      thumbUrl: null,
    };
  });

  const bolCards: AdminDocumentCard[] = ((bolRows ?? []) as BolRow[]).map((r) => {
    const shipment = shipmentById.get(r.shipment_id);
    return {
      id: r.id,
      docType: "bill_of_lading",
      number: r.bol_number,
      status: r.status,
      createdAt: r.created_at,
      shipmentId: r.shipment_id,
      shipmentNumber: shipment?.shipment_number ?? null,
      companyId: shipment?.account_id ?? null,
      companyName: shipment?.customer_name ?? null,
      uploadedById: r.created_by,
      uploadedByName: profileName(profileById.get(r.created_by ?? "")),
      pdfStoragePath: r.pdf_storage_path,
      thumbUrl: null,
    };
  });

  const cards = [...rcCards, ...bolCards].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const withPdf = cards.filter((c) => c.pdfStoragePath);
  if (withPdf.length === 0) return cards;

  const thumbPaths = withPdf.map((c) => `${c.pdfStoragePath}${THUMB_SUFFIX}`);
  const { data: signedRows } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrls(thumbPaths, SIGNED_URL_TTL_SECONDS);
  const signedByPath = new Map<string, string>();
  for (const row of signedRows ?? []) {
    if (row.signedUrl && row.path) signedByPath.set(row.path, row.signedUrl);
  }
  for (const card of cards) {
    if (!card.pdfStoragePath) continue;
    const url = signedByPath.get(`${card.pdfStoragePath}${THUMB_SUFFIX}`);
    if (url) card.thumbUrl = url;
  }

  const missing = withPdf.filter((c) => !c.thumbUrl).slice(0, MAX_THUMB_BACKFILL_PER_LOAD);
  await Promise.all(
    missing.map(async (card) => {
      if (!card.pdfStoragePath) return;
      const { data: pdfBlob } = await supabase.storage.from(STORAGE_BUCKET).download(card.pdfStoragePath);
      if (!pdfBlob) return;
      const thumbResult = await renderPdfFirstPageToPng(new Uint8Array(await pdfBlob.arrayBuffer()));
      if (!thumbResult.ok) return;

      const thumbPath = `${card.pdfStoragePath}${THUMB_SUFFIX}`;
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(thumbPath, thumbResult.png, { contentType: "image/png", upsert: false });
      if (uploadError) return;

      const { data: thumbSigned } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(thumbPath, SIGNED_URL_TTL_SECONDS);
      if (thumbSigned?.signedUrl) card.thumbUrl = thumbSigned.signedUrl;
    }),
  );

  return cards;
}
