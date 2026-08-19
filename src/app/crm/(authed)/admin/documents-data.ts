import { createCrmServerClient } from "@/lib/crm/auth";
import type { AdminBlankTemplate, AdminBlankTemplateType } from "./types";

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

type OrgDocRow = { file_name: string; storage_path: string; created_at: string };

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
        .select("file_name, storage_path, created_at")
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
    docType: def.docType,
    label: def.label,
    fileName: row?.file_name ?? null,
    storagePath: row?.storage_path ?? null,
    thumbUrl: row ? (thumbByPath.get(`${row.storage_path}${THUMB_SUFFIX}`) ?? null) : null,
    createdAt: row?.created_at ?? null,
  }));
}
