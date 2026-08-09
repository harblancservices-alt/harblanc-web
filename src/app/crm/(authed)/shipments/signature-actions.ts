"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";
import { signPdfWithStamps, type SignatureStamp } from "@/lib/pdf/signDoc";
import { storeDocumentVersion, downloadDocumentBytes, CRM_DOCUMENTS_BUCKET } from "./document-lifecycle";
import type { CrmDocType, SignaturePlacementInput } from "./types";

/**
 * Signature capture, shared across Rate Confirmations and Bills of Lading.
 * Mirrors the composite-then-regenerate pattern in lib/pdf/signDoc.ts: the
 * signature PNG is uploaded and recorded as its own crm_signatures row, then
 * the doc's CURRENT pdf_storage_path is downloaded, stamped with the
 * signature via signPdfWithStamps (never mutating that file), and the
 * result is stored as a brand new document version — the pre-signature PDF
 * stays exactly as it was, downloadable via its own crm_documents row and
 * crm_document_versions entry forever.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

export type RecordSignatureResult =
  | { ok: true; signatureId: string; pdfDocumentId: string; pdfStoragePath: string; version: number }
  | { ok: false; error: string };

type DocLifecycleRow = {
  number: string;
  shipmentId: string;
  accountId: string | null;
  pdfDocumentId: string | null;
  pdfStoragePath: string | null;
  version: number;
};

async function loadDocForSigning(
  supabase: SupabaseClient,
  docType: CrmDocType,
  docId: string,
): Promise<DocLifecycleRow | null> {
  const table = docType === "rate_confirmation" ? "crm_rate_confirmations" : "crm_bills_of_lading";
  const numberColumn = docType === "rate_confirmation" ? "rc_number" : "bol_number";

  const { data } = await supabase
    .from(table)
    .select(`${numberColumn}, shipment_id, pdf_document_id, pdf_storage_path, version`)
    .eq("id", docId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const shipmentId = row.shipment_id as string;

  const { data: shipment } = await supabase
    .from("crm_shipments")
    .select("account_id")
    .eq("id", shipmentId)
    .maybeSingle();

  return {
    number: row[numberColumn] as string,
    shipmentId,
    accountId: (shipment?.account_id as string | null) ?? null,
    pdfDocumentId: (row.pdf_document_id as string | null) ?? null,
    pdfStoragePath: (row.pdf_storage_path as string | null) ?? null,
    version: (row.version as number) ?? 1,
  };
}

/** Decode a `data:image/png;base64,...` URL into raw PNG bytes. */
function decodePngDataUrl(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
  return new Uint8Array(Buffer.from(base64, "base64"));
}

/** Read width/height straight out of the PNG IHDR chunk (bytes 16–23 of any
 * valid PNG: 8-byte signature, 4-byte chunk length, 4-byte "IHDR" type, then
 * 4-byte width + 4-byte height, big-endian) — avoids pulling in an image
 * library just to learn a signature pad capture's aspect ratio. */
function pngAspectRatio(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (!width || !height) return 1;
  return height / width;
}

/**
 * Capture a signature for an RC or BOL, then regenerate that document's PDF
 * with the signature stamped in as a new version. `placement` is PDF
 * user-space (bottom-left origin) — the caller (a future signing UI) is
 * responsible for converting from screen/viewport space, same contract as
 * lib/pdf/signDoc.ts's SignaturePlacement.
 */
export async function recordSignature(
  docType: CrmDocType,
  docId: string,
  role: string,
  signerName: string | null,
  pngDataUrl: string,
  placement: SignaturePlacementInput,
): Promise<RecordSignatureResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const doc = await loadDocForSigning(supabase, docType, docId);
  if (!doc) return { ok: false, error: "Document not found." };
  if (!doc.pdfStoragePath) {
    return { ok: false, error: "Generate the document before capturing a signature." };
  }

  const pngBytes = decodePngDataUrl(pngDataUrl);
  const aspect = pngAspectRatio(pngBytes);

  const signaturePath = `${user.orgId}/signatures/${docId}/${crypto.randomUUID()}-${role}.png`;
  const { error: sigUploadError } = await supabase.storage
    .from(CRM_DOCUMENTS_BUCKET)
    .upload(signaturePath, pngBytes, { contentType: "image/png", upsert: false });
  if (sigUploadError) return { ok: false, error: "Could not save the signature. Please try again." };

  const { data: sigData, error: sigInsertError } = await supabase
    .from("crm_signatures")
    .insert({
      org_id: user.orgId,
      doc_type: docType,
      doc_id: docId,
      role,
      signer_name: signerName,
      image_path: signaturePath,
      placement,
    })
    .select("id")
    .single();
  if (sigInsertError || !sigData) {
    return { ok: false, error: "Could not record the signature. Please try again." };
  }

  const originalBytes = await downloadDocumentBytes(supabase, doc.pdfStoragePath);
  if (!originalBytes) {
    return { ok: false, error: "Signature saved, but could not read the document to stamp it onto." };
  }

  const stamp: SignatureStamp = {
    pageIndex: placement.pageIndex,
    place: {
      cx: placement.cx,
      cy: placement.cy,
      rotationDeg: placement.rotationDeg,
      widthPts: placement.widthPts,
    },
    content: {
      pngBytes,
      aspect,
      printName: signerName ?? undefined,
      dateStr: new Date().toLocaleDateString("en-US"),
    },
  };

  let signedBytes: Uint8Array;
  try {
    signedBytes = await signPdfWithStamps(originalBytes, [stamp]);
  } catch {
    return { ok: false, error: "Signature saved, but could not stamp it onto the document." };
  }

  const nextVersion = doc.version + 1;
  const kind = docType === "rate_confirmation" ? "rate_con" : "bol";
  const folder = docType === "rate_confirmation" ? "rate-con" : "bol";
  const fileName = `${doc.number} v${nextVersion} (signed).pdf`;

  const stored = await storeDocumentVersion(supabase, {
    orgId: user.orgId,
    userId: user.id,
    docType,
    docId,
    shipmentId: doc.shipmentId,
    kind,
    fileName,
    storagePathPrefix: `${user.orgId}/${folder}/${doc.shipmentId}`,
    bytes: signedBytes,
    snapshot: { signedFrom: doc.pdfStoragePath, role, signerName, placement },
    version: nextVersion,
    ...(docType === "rate_confirmation" ? { rateConfirmationId: docId } : { billOfLadingId: docId }),
  });
  if (!stored.ok) return stored;

  const table = docType === "rate_confirmation" ? "crm_rate_confirmations" : "crm_bills_of_lading";
  const updatePayload: Record<string, unknown> = {
    pdf_document_id: stored.documentId,
    pdf_storage_path: stored.storagePath,
    version: nextVersion,
  };
  if (docType === "bill_of_lading") updatePayload.signed_at = new Date().toISOString();

  const { error: updateError } = await supabase.from(table).update(updatePayload).eq("id", docId);
  if (updateError) {
    return { ok: false, error: "Signed PDF saved, but could not update the document record." };
  }

  if (doc.accountId) {
    // No dedicated "rate_confirmation_signed" kind — a carrier signature on
    // an RC is functionally its acceptance, so it reuses that kind.
    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId: doc.accountId,
      kind: docType === "bill_of_lading" ? CRM_ACTIVITY.bolSigned : CRM_ACTIVITY.rateConfirmationAccepted,
      summary: `${docType === "bill_of_lading" ? "Bill of lading" : "Rate confirmation"} signed by ${role}: ${doc.number}`,
    });
  }

  return {
    ok: true,
    signatureId: sigData.id as string,
    pdfDocumentId: stored.documentId,
    pdfStoragePath: stored.storagePath,
    version: nextVersion,
  };
}
