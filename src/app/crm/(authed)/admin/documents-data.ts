import { createCrmServerClient } from "@/lib/crm/auth";
import type { AdminBlankTemplate, AdminBlankTemplateType, AdminOrgUpload } from "./types";

const STORAGE_BUCKET = "crm-documents";
const SIGNED_URL_TTL_SECONDS = 300;
/** Same suffix/convention as the old ../settings/page.tsx's THUMB_SUFFIX — a
 * `<storagePath>.thumb.v3.png` sibling object holding a pre-rendered PNG of
 * the PDF's first page, written when the template was generated
 * (../settings/blankTemplates.ts, before that Settings section was
 * removed). Duplicated literal, not imported — same "use server"/plain-
 * module split reasoning as everywhere else this suffix appears. */
const THUMB_SUFFIX = ".thumb.v3.png";

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

type OrgDocRow = { id: string; file_name: string; storage_path: string; created_at: string };

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
        .select("id, file_name, storage_path, created_at")
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
  const thumbByPath = new Map<string, string>();
  if (withPath.length) {
    const thumbPaths = withPath.map((r) => `${r.row!.storage_path}${THUMB_SUFFIX}`);
    const { data: signedRows } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrls(thumbPaths, SIGNED_URL_TTL_SECONDS);
    for (const s of signedRows ?? []) {
      if (s.signedUrl && s.path) thumbByPath.set(s.path, s.signedUrl);
    }
  }

  return rows.map(({ def, row }) => ({
    id: row?.id ?? null,
    docType: def.docType,
    label: def.label,
    fileName: row?.file_name ?? null,
    storagePath: row?.storage_path ?? null,
    thumbUrl: row ? (thumbByPath.get(`${row.storage_path}${THUMB_SUFFIX}`) ?? null) : null,
    createdAt: row?.created_at ?? null,
  }));
}

/**
 * Org-level uploaded documents (insurance certs, W9s, agreements — anything
 * not tied to a company). Same crm_documents table, kind=ORG_UPLOAD_KIND,
 * account_id/deal_id both null so they never show up on a company profile.
 * Admin-managed: uploaded/deleted via ./documents/actions.ts.
 */
export async function listOrgUploads(): Promise<AdminOrgUpload[]> {
  const supabase = await createCrmServerClient();
  const { data } = await supabase
    .from("crm_documents")
    .select("id, file_name, storage_path, mime_type, size_bytes, created_at")
    .eq("kind", ORG_UPLOAD_KIND)
    .is("account_id", null)
    .is("deal_id", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id as string,
    fileName: r.file_name as string,
    storagePath: r.storage_path as string,
    mimeType: r.mime_type as string | null,
    sizeBytes: r.size_bytes as number | null,
    createdAt: r.created_at as string,
  }));
}
