"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Record the metadata row for a commodity reference photo already uploaded
 * straight from the browser to Supabase Storage (bucket "crm-documents",
 * under `<org_id>/commodity-photos/<account_id>/<uuid>-<sanitizedFileName>`
 * — see CommodityPhotoTiles.tsx) — same crm_documents table and bucket the
 * BOL tab uses (see bol-actions.ts), just a different `kind`. No schema or
 * storage-policy change was needed: crm_documents.kind is a free-text
 * column, and the storage policy scopes only by the first path segment
 * (org_id), not by what comes after it.
 */
export async function createCommodityPhoto(
  accountId: string,
  input: {
    fileName: string;
    storagePath: string;
    mimeType: string | null;
    sizeBytes: number | null;
  },
): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { error } = await supabase.from("crm_documents").insert({
    org_id: user.orgId,
    account_id: accountId,
    user_id: user.id,
    kind: "commodity_photo",
    file_name: input.fileName,
    storage_path: input.storagePath,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
  });

  if (error) {
    return { ok: false, error: "Could not save the photo. Please try again." };
  }

  revalidatePath(`/crm/accounts/${accountId}`);
  return { ok: true };
}

/**
 * Soft-delete a commodity photo — clears it from the tile grid but leaves the
 * storage object in place (recoverable), same reasoning as
 * bol-actions.ts::deleteBolDocument. Operational, not a shared record — no
 * owner gate.
 */
export async function deleteCommodityPhoto(
  documentId: string,
  accountId: string,
): Promise<ActionResult> {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { error } = await supabase
    .from("crm_documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", documentId);

  if (error) {
    return { ok: false, error: "Could not delete the photo. Please try again." };
  }

  revalidatePath(`/crm/accounts/${accountId}`);
  return { ok: true };
}
