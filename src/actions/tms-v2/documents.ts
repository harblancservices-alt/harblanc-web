"use server";

import { revalidatePath } from "next/cache";
import {
  createLoadDocUploadUrl as createLoadDocUploadUrlShared,
  recordLoadDocuments as recordLoadDocumentsShared,
  deleteLoadDocument as deleteLoadDocumentShared,
  type CreateUploadUrlResult,
  type DocUploadResult,
  type RecordDoc,
} from "@/lib/domain/load-documents";
import {
  signBolRole as signBolRoleShared,
  type SignBolRolePayload,
} from "@/lib/domain/bol-signing";

/**
 * Load-document writes for /tms-v2 — thin wrappers around the neutral
 * signed-URL-upload + canonical-named-insert + delete core
 * (src/lib/domain/load-documents.ts) and the neutral BOL-signing core
 * (src/lib/domain/bol-signing.ts), shared with /admin's own wrapper
 * (src/app/admin/(authed)/dispatch/loads/actions.ts). /tms-v2 has no demo
 * mode of its own, so unlike admin's wrapper these call the shared core
 * directly with no demo gate. Not run through mutation()
 * (src/lib/demo/mutation.ts): these already return non-throwing result
 * unions, so wrapping again would add nothing.
 */

function revalidateLoadDocPaths(loadId: string) {
  revalidatePath(`/tms-v2/loads/${loadId}`);
  revalidatePath("/tms-v2/loads");
  revalidatePath("/tms-v2");
}

export async function createLoadDocUploadUrl(
  loadId: string,
  fileName: string,
  mimeType: string,
  sizeBytes: number,
): Promise<CreateUploadUrlResult> {
  return createLoadDocUploadUrlShared(loadId, fileName, mimeType, sizeBytes);
}

export async function recordLoadDocuments(loadId: string, kind: string, docs: RecordDoc[]): Promise<DocUploadResult> {
  const res = await recordLoadDocumentsShared(loadId, kind, docs);
  if (res.ok) revalidateLoadDocPaths(loadId);
  return res;
}

export async function deleteLoadDocument(docId: string, loadId: string): Promise<DocUploadResult> {
  const res = await deleteLoadDocumentShared(docId, loadId);
  if (res.ok) revalidateLoadDocPaths(loadId);
  return res;
}

export async function signBolRole(
  loadId: string,
  originalDocId: string,
  role: string,
  payload: SignBolRolePayload,
): Promise<DocUploadResult> {
  const res = await signBolRoleShared(loadId, originalDocId, role, payload);
  if (res.ok) revalidateLoadDocPaths(loadId);
  return res;
}
