"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";

export type ActionResult = { ok: true } | { ok: false; error: string };

const STORAGE_BUCKET = "crm-documents";

/**
 * Record the metadata row for a BOL that was already uploaded straight from
 * the browser to Supabase Storage (bucket "crm-documents", under
 * `<org_id>/bol/<account_id>/<uuid>-<sanitizedFileName>` — see BolSection.tsx)
 * — this action never sees file bytes, only writes the crm_documents row.
 * Server actions cap the request body around 1MB, well under a typical BOL
 * photo/PDF, which is exactly why the upload itself happens client-side
 * against the storage RLS policy instead of routing bytes through here.
 */
export async function createBolDocument(
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
    kind: "bol",
    file_name: input.fileName,
    storage_path: input.storagePath,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
  });

  if (error) {
    return { ok: false, error: "Could not save the file record. Please try again." };
  }

  revalidatePath(`/crm/accounts/${accountId}`);
  return { ok: true };
}

/**
 * Soft-delete a BOL — clears it from the list but leaves the storage object
 * in place (recoverable). Any org member may delete; a BOL is operational,
 * not a shared record like a company/contact/deal (same reasoning as
 * calls/actions.ts::deleteCall and accounts/actions.ts::deleteNote — no
 * owner gate).
 */
export async function deleteBolDocument(
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
    return { ok: false, error: "Could not delete the file. Please try again." };
  }

  revalidatePath(`/crm/accounts/${accountId}`);
  return { ok: true };
}
