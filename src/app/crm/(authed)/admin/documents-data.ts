import { createCrmServerClient } from "@/lib/crm/auth";
import type { AdminBlankTemplate, AdminBlankTemplateType, AdminOrgUpload } from "./types";

export const STORAGE_BUCKET = "crm-documents";
const SIGNED_URL_TTL_SECONDS = 300;
/** Same suffix/convention as the old ../settings/page.tsx's THUMB_SUFFIX — a
 * `<storagePath>.thumb.v3.png` sibling object holding a pre-rendered PNG of
 * the PDF's first page.
 *
 * EXPORTED (2026-08-22), no longer a duplicated literal. It used to be
 * copied per file on the "use server"/plain-module split reasoning, but that
 * rule is about what a "use server" file may EXPORT — importing a constant
 * FROM a plain module INTO one is fine, and this file IS the plain module.
 * Now that ./documents/actions.ts WRITES this sibling and this file READS
 * it, the writer and the reader have to agree on the string exactly; a
 * drifting copy would silently produce thumbnails nothing ever looks up. */
export const THUMB_SUFFIX = ".thumb.v3.png";

/** The only two blank master templates the CRM's document generator
 * produces — matches ../settings/blankTemplates.ts's (removed)
 * GENERATED_TEMPLATE_LABELS exactly. Fixed, not a generic "every org_doc
 * kind" scan: Brent's explicit call is this tab shows ONLY the templates
 * that actually exist as real generator output, never a stray custom
 * "+ Add document" type from the old Settings library (none of those were
 * ever actually uploaded in prod — verified before writing this) and never
 * a POD placeholder (out of scope, no CRM POD source exists). */
const BLANK_TEMPLATES: { kind: string; label: string; docType: AdminBlankTemplateType }[] = [
  { kind: "org_doc:Rate Confirmation", label: "Rate Confirmation", docType: "rate_confirmation" },
  { kind: "org_doc:Bill of Lading", label: "Bill of Lading", docType: "bill_of_lading" },
];

/** Kind for an admin-uploaded org-level document (insurance certs, W9s,
 * agreements) — deliberately distinct from the two BLANK_TEMPLATES kinds
 * above so an upload can never collide with a generator template. */
export const ORG_UPLOAD_KIND = "org_doc:upload";

/** The two template kinds, exported so ./documents/actions.ts::
 * renameOrgDocument can allow renaming them too (titles are editable for
 * both templates and uploads; only deletion stays upload-only). */
export const TEMPLATE_KINDS = BLANK_TEMPLATES.map((t) => t.kind);

type OrgDocRow = { id: string; file_name: string; storage_path: string; created_at: string; is_public: boolean };

/**
 * Admin Account "Documents" tab — the org's blank master RC/BOL templates,
 * NOT per-shipment generated documents (that was the tab's first design;
 * Brent's explicit correction: this is a template library, not a job-output
 * library). Reads the exact crm_documents rows
 * ../settings/blankTemplates.ts's createBlankTemplateDocument wrote when
 * that Settings section still existed — org_doc:'Rate Confirmation' /
 * org_doc:'Bill of Lading', account_id/deal_id both null. Those rows (and
 * their `.thumb.v3.png` thumbnail siblings) are still sitting in Storage
 * from before that section was removed, so this reads them directly rather
 * than regenerating anything.
 *
 * If a label has no row yet (a brand-new org, or the row was somehow
 * deleted) this returns a card with every field null rather than
 * generating a fresh PDF — the task's explicit fallback: "render an empty
 * template preview labeled by type rather than inventing job data." Full
 * PDF generation (@react-pdf/renderer, CrmRateConfirmationPDF/
 * CrmShipmentBolPDF) stays a real capability of the codebase (the RC/BOL
 * generator itself, shipments/rate-confirmation-actions.ts and
 * bol-actions.ts) — this tab is deliberately just a READ of whatever blank
 * template already exists, not a second place that can create one.
 */
export async function listBlankTemplates(): Promise<AdminBlankTemplate[]> {
  const supabase = await createCrmServerClient();

  const rows = await Promise.all(
    BLANK_TEMPLATES.map(async (t) => {
      const { data } = await supabase
        .from("crm_documents")
        .select("id, file_name, storage_path, created_at, is_public")
        .eq("kind", t.kind)
        .is("account_id", null)
        .is("deal_id", null)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return { def: t, row: data as OrgDocRow | null };
    }),
  );

  const withPath = rows.filter((r) => r.row);
  const signedByPath = new Map<string, string>();
  if (withPath.length) {
    // Sign the thumbnail sibling AND the original, in one call — the
    // original is what _shell/DocThumb.tsx falls back to rastering in the
    // browser if the sibling has gone missing, so a template can never
    // degrade to an unexplained empty tile.
    const paths = [
      ...withPath.map((r) => `${r.row!.storage_path}${THUMB_SUFFIX}`),
      ...withPath.map((r) => r.row!.storage_path),
    ];
    const { data: signedRows } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    for (const s of signedRows ?? []) {
      if (s.signedUrl && s.path) signedByPath.set(s.path, s.signedUrl);
    }
  }

  return rows.map(({ def, row }) => ({
    id: row?.id ?? null,
    docType: def.docType,
    label: def.label,
    fileName: row?.file_name ?? null,
    storagePath: row?.storage_path ?? null,
    thumbUrl: row ? (signedByPath.get(`${row.storage_path}${THUMB_SUFFIX}`) ?? null) : null,
    previewUrl: row ? (signedByPath.get(row.storage_path) ?? null) : null,
    createdAt: row?.created_at ?? null,
    // No row means no document to publish; false is the honest state and
    // the grid renders that card's toggle disabled.
    isPublic: row?.is_public ?? false,
  }));
}

/**
 * Org-level uploaded documents (insurance certs, W9s, agreements — anything
 * not tied to a company). Same crm_documents table, kind=ORG_UPLOAD_KIND,
 * account_id/deal_id both null so they never show up on a company profile.
 * Admin-managed: uploaded/deleted via ./documents/actions.ts.
 *
 * Returns TWO signed URLs per row, both through the same batched
 * `createSignedUrls` call listBlankTemplates() above already uses:
 *
 *   thumbUrl   — the `<storagePath>.thumb.v3.png` sibling, when one exists.
 *   previewUrl — the ORIGINAL object, always.
 *
 * Both are needed because the thumbnail sibling is NOT guaranteed. Commit
 * 966cc15 (the Admin Account section) replaced the old
 * settings/documents-actions.ts upload path — which rendered that sibling on
 * every PDF upload — with ./documents/actions.ts::createOrgDocument, which
 * was written without the step. Every document uploaded between then and the
 * fix has no sibling object, and a Storage object can't be backfilled with
 * SQL. So _shell/DocThumb.tsx falls back to previewUrl: straight into an
 * <img> for an image, or a browser-side first-page raster for a PDF.
 * createSignedUrls reports per-item errors (signedUrl comes back null for an
 * object that isn't there), so a missing sibling yields null here rather
 * than a URL that would 404 into a broken image.
 */
export async function listOrgUploads(): Promise<AdminOrgUpload[]> {
  return readOrgUploads({ publicOnly: false });
}

/**
 * The SALES-AGENT view of the same library — only documents an admin has
 * explicitly published (is_public = true). Backs Operations → Documents
 * (/crm/operations/documents), where a rep picks documents to bundle into a
 * vendor packet.
 *
 * A separate NAMED function rather than an optional `publicOnly` argument on
 * listOrgUploads(): with a flag, a future caller who forgets to pass it
 * silently exposes every private document, and the failure is invisible in
 * review. With two functions, the agent-facing read path is impossible to
 * reach by accident — you have to type "public" to get the public list.
 *
 * This is the presentation filter. The packet DOWNLOAD route
 * (operations/documents/packet/route.ts) re-applies the same is_public
 * predicate to the ids it's handed, so hiding a document here also makes it
 * genuinely unreachable rather than merely unlisted.
 */
export async function listPublicOrgDocuments(): Promise<AdminOrgUpload[]> {
  return readOrgUploads({ publicOnly: true });
}

async function readOrgUploads({ publicOnly }: { publicOnly: boolean }): Promise<AdminOrgUpload[]> {
  const supabase = await createCrmServerClient();
  let query = supabase
    .from("crm_documents")
    .select("id, file_name, storage_path, mime_type, size_bytes, created_at, is_public")
    .eq("kind", ORG_UPLOAD_KIND)
    .is("account_id", null)
    .is("deal_id", null)
    .is("deleted_at", null);
  if (publicOnly) query = query.eq("is_public", true);
  const { data } = await query.order("created_at", { ascending: false });

  const rows = (data ?? []) as (OrgDocRow & { mime_type: string | null; size_bytes: number | null })[];
  if (rows.length === 0) return [];

  const signedByPath = new Map<string, string>();
  const paths = [
    ...rows.map((r) => r.storage_path),
    ...rows.map((r) => `${r.storage_path}${THUMB_SUFFIX}`),
  ];
  const { data: signedRows } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  for (const s of signedRows ?? []) {
    if (s.signedUrl && s.path) signedByPath.set(s.path, s.signedUrl);
  }

  return rows.map((r) => ({
    id: r.id,
    fileName: r.file_name,
    storagePath: r.storage_path,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at,
    thumbUrl: signedByPath.get(`${r.storage_path}${THUMB_SUFFIX}`) ?? null,
    previewUrl: signedByPath.get(r.storage_path) ?? null,
    isPublic: r.is_public,
  }));
}
