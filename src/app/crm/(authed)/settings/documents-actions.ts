"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { renderPdfFirstPageToPng } from "@/lib/pdf/pdfPageThumbnail";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** crm_documents.kind prefix that scopes a row to the Settings → Documents
 * library — org-wide reference documents (account_id/deal_id both null),
 * distinct from the account-scoped 'bol'/'commodity_photo' kinds and the
 * shipment-scoped 'rate_con'/'bol' kinds the RC/BOL generator writes. The
 * label typed into "Add document" is stored verbatim after this prefix, so
 * no separate lookup table is needed for custom types Brent adds later.
 * Not exported — a "use server" file may only export async functions, so
 * this literal is duplicated wherever it's needed (settings/page.tsx,
 * OrgDocumentsSection.tsx), same as STORAGE_BUCKET across bol-actions.ts. */
const ORG_DOC_KIND_PREFIX = "org_doc:";

/**
 * Record the metadata row for an org-level reference document already
 * uploaded straight from the browser to Supabase Storage (bucket
 * "crm-documents", under `<org_id>/org-docs/<slug>/<uuid>-<name>` — see
 * OrgDocumentsSection.tsx). Admin-only, same rationale as
 * updateBrokerProfile in ./actions: RLS only scopes crm_documents to the
 * org, not by role, so this app-layer check is what keeps the document
 * library admin-managed.
 */
export async function createOrgDocument(
  label: string,
  input: {
    fileName: string;
    storagePath: string;
    mimeType: string | null;
    sizeBytes: number | null;
  },
): Promise<ActionResult> {
  const user = await requireCrmUser();
  if (user.role !== "owner") {
    return { ok: false, error: "Only an admin can manage documents." };
  }

  const trimmedLabel = label.trim();
  if (!trimmedLabel) {
    return { ok: false, error: "A document type name is required." };
  }

  const supabase = await createCrmServerClient();
  const { error } = await supabase.from("crm_documents").insert({
    org_id: user.orgId,
    user_id: user.id,
    kind: `${ORG_DOC_KIND_PREFIX}${trimmedLabel}`,
    file_name: input.fileName,
    storage_path: input.storagePath,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
  });

  if (error) {
    return { ok: false, error: "Could not save the document. Please try again." };
  }

  // Card thumbnail — best-effort, same convention as blankTemplates.ts:
  // `<storagePath>.thumb.png`. The file's already in Storage (uploaded
  // browser-side before this action ran), so it has to be downloaded back
  // to rasterize it; a failure here never fails the upload itself.
  if (input.mimeType === "application/pdf") {
    const { data: pdfBlob } = await supabase.storage.from("crm-documents").download(input.storagePath);
    if (pdfBlob) {
      const thumbResult = await renderPdfFirstPageToPng(new Uint8Array(await pdfBlob.arrayBuffer()));
      if (thumbResult.ok) {
        await supabase.storage
          .from("crm-documents")
          .upload(`${input.storagePath}.thumb.png`, thumbResult.png, { contentType: "image/png", upsert: false });
      }
    }
  }

  revalidatePath("/crm/settings");
  return { ok: true };
}
