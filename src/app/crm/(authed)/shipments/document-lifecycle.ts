import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmDocType } from "./types";

/**
 * Shared plumbing for generating/versioning a Rate Confirmation or Bill of
 * Lading PDF — used by both rate-confirmation-actions.ts::generateRateConfirmation
 * and bol-actions.ts::generateBol (and signature-actions.ts::recordSignature,
 * which regenerates a signed version through the same path). Not a "use
 * server" file itself — it's a plain helper imported by the server actions
 * that are.
 *
 * Every call here is an INSERT, never an update-in-place: each generation
 * (or signing) writes a brand new Storage object and a brand new
 * crm_documents row, so a previously generated PDF is never overwritten —
 * only superseded by a newer crm_document_versions row and a newer
 * pdf_document_id/pdf_storage_path pointer on the parent RC/BOL. The
 * original stays downloadable via its own crm_documents row forever.
 */

export const CRM_DOCUMENTS_BUCKET = "crm-documents";

export type StoreDocumentVersionInput = {
  orgId: string;
  userId: string;
  docType: CrmDocType;
  docId: string;
  shipmentId: string;
  kind: "rate_con" | "bol";
  /** Human-facing file name, e.g. "RC-2026-0001 v2.pdf". */
  fileName: string;
  /** Storage folder the new object's uuid-prefixed name lands under, e.g.
   * `${orgId}/rate-con/${shipmentId}`. */
  storagePathPrefix: string;
  bytes: Uint8Array | Buffer;
  /** The exact data the PDF was rendered from — stored on the version row
   * as a permanent record of what that version actually said. */
  snapshot: Record<string, unknown>;
  version: number;
  rateConfirmationId?: string;
  billOfLadingId?: string;
};

export type StoreDocumentVersionResult =
  | { ok: true; documentId: string; storagePath: string }
  | { ok: false; error: string };

export async function storeDocumentVersion(
  supabase: SupabaseClient,
  input: StoreDocumentVersionInput,
): Promise<StoreDocumentVersionResult> {
  const storagePath = `${input.storagePathPrefix}/${crypto.randomUUID()}-${input.fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(CRM_DOCUMENTS_BUCKET)
    .upload(storagePath, input.bytes, { contentType: "application/pdf", upsert: false });
  if (uploadError) {
    return { ok: false, error: "Could not save the generated PDF. Please try again." };
  }

  const { data: docData, error: docError } = await supabase
    .from("crm_documents")
    .insert({
      org_id: input.orgId,
      user_id: input.userId,
      kind: input.kind,
      file_name: input.fileName,
      storage_path: storagePath,
      mime_type: "application/pdf",
      size_bytes: input.bytes.byteLength,
      shipment_id: input.shipmentId,
      rate_confirmation_id: input.rateConfirmationId ?? null,
      bill_of_lading_id: input.billOfLadingId ?? null,
    })
    .select("id")
    .single();
  if (docError || !docData) {
    return { ok: false, error: "Could not save the document record. Please try again." };
  }

  const { error: versionError } = await supabase.from("crm_document_versions").insert({
    org_id: input.orgId,
    doc_type: input.docType,
    doc_id: input.docId,
    version: input.version,
    storage_path: storagePath,
    snapshot: input.snapshot,
    created_by: input.userId,
  });
  if (versionError) {
    return { ok: false, error: "Document saved, but could not record its version history." };
  }

  return { ok: true, documentId: docData.id as string, storagePath };
}

/** Download an existing document's PDF bytes from Storage — used by
 * recordSignature() to fetch the current (unsigned or previously signed)
 * PDF it stamps a new signature onto. */
export async function downloadDocumentBytes(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<Uint8Array | null> {
  const { data, error } = await supabase.storage.from(CRM_DOCUMENTS_BUCKET).download(storagePath);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}
