"use server";

import { revalidatePath } from "next/cache";
import {
  createLoadDocUploadUrl as legacyCreateLoadDocUploadUrl,
  recordLoadDocuments as legacyRecordLoadDocuments,
  deleteLoadDocument as legacyDeleteLoadDocument,
  signBolRole as legacySignBolRole,
  type CreateUploadUrlResult,
  type DocUploadResult,
  type RecordDoc,
  type SignBolRolePayload,
  type BolPlacement,
} from "@/app/admin/(authed)/dispatch/loads/actions";

/**
 * Load-document writes for /tms-v2 — thin wrappers around V1's
 * signed-URL-upload + BOL-signature-compositing action layer
 * (src/app/admin/(authed)/dispatch/loads/actions.ts), per the phase brief:
 * "reuse existing legacy domain/business logic... port/reuse the logic,
 * don't reinvent or duplicate it." The upload/compositing pipeline (sharp,
 * pdf-lib, signed storage URLs) is genuinely complex and already correct —
 * these wrappers only add /tms-v2's own revalidatePath targets on top of
 * V1's. Not run through mutation() (src/lib/demo/mutation.ts): the legacy
 * functions already carry their own blockedByDemo() gate and return
 * non-throwing result unions, so wrapping again would just re-check demo
 * mode for no behavioral difference.
 */

export type { CreateUploadUrlResult, DocUploadResult, RecordDoc, SignBolRolePayload, BolPlacement };

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
  return legacyCreateLoadDocUploadUrl(loadId, fileName, mimeType, sizeBytes);
}

export async function recordLoadDocuments(loadId: string, kind: string, docs: RecordDoc[]): Promise<DocUploadResult> {
  const res = await legacyRecordLoadDocuments(loadId, kind, docs);
  if (res.ok) revalidateLoadDocPaths(loadId);
  return res;
}

export async function deleteLoadDocument(docId: string, loadId: string): Promise<void> {
  await legacyDeleteLoadDocument(docId, loadId);
  revalidateLoadDocPaths(loadId);
}

export async function signBolRole(
  loadId: string,
  originalDocId: string,
  role: string,
  payload: SignBolRolePayload,
): Promise<DocUploadResult> {
  const res = await legacySignBolRole(loadId, originalDocId, role, payload);
  if (res.ok) revalidateLoadDocPaths(loadId);
  return res;
}
