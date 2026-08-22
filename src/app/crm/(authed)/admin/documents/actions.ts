"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { ORG_UPLOAD_KIND, TEMPLATE_KINDS } from "../documents-data";

/** Titles are editable for both uploads AND the two blank templates —
 * deletion stays upload-only (see deleteOrgDocument below). */
const RENAMEABLE_KINDS = [ORG_UPLOAD_KIND, ...TEMPLATE_KINDS];
import type { ActionResult } from "../types";

/**
 * Admin Account "Documents" tab — org-level uploads (insurance certs, W9s,
 * agreements). The two blank master templates (../documents-data.ts's
 * BLANK_TEMPLATES) are read-only and not managed here. Every write
 * independently re-verifies role==='owner' itself, per this repo's
 * crm/admin/**\/actions.ts convention — never trusts the page/layout gate
 * alone.
 */

async function requireAdminUser() {
  const user = await requireCrmUser();
  if (user.role !== "owner") throw new Error("Only an admin can manage Documents.");
  return user;
}

function revalidateDocuments() {
  revalidatePath("/crm/admin/documents");
}

export async function createOrgDocument(input: {
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
}): Promise<ActionResult> {
  const user = await requireAdminUser();
  const supabase = await createCrmServerClient();

  const { error } = await supabase.from("crm_documents").insert({
    org_id: user.orgId,
    account_id: null,
    deal_id: null,
    user_id: user.id,
    kind: ORG_UPLOAD_KIND,
    file_name: input.fileName,
    storage_path: input.storagePath,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
  });

  if (error) return { ok: false, error: "Could not save the file record. Please try again." };

  revalidateDocuments();
  return { ok: true };
}

/** Renames a document's display name (file_name) only — the storage object
 * and its path are untouched, so this never risks breaking the signed-URL
 * lookup. Allows both upload AND template kinds (titles are editable for
 * both); deletion stays upload-only, see deleteOrgDocument below. */
export async function renameOrgDocument(documentId: string, fileName: string): Promise<ActionResult> {
  await requireAdminUser();
  const trimmed = fileName.trim();
  if (!trimmed) return { ok: false, error: "File name can't be empty." };

  const supabase = await createCrmServerClient();
  const { error } = await supabase
    .from("crm_documents")
    .update({ file_name: trimmed })
    .eq("id", documentId)
    .in("kind", RENAMEABLE_KINDS);

  if (error) return { ok: false, error: "Could not rename the file. Please try again." };

  revalidateDocuments();
  return { ok: true };
}

/** Soft-delete only, matching every other CRM document delete (e.g.
 * accounts/[id]/bol-actions.ts's deleteBolDocument) — the storage object
 * stays in place, the row just stops showing up. */
export async function deleteOrgDocument(documentId: string): Promise<ActionResult> {
  await requireAdminUser();
  const supabase = await createCrmServerClient();

  const { error } = await supabase
    .from("crm_documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("kind", ORG_UPLOAD_KIND);

  if (error) return { ok: false, error: "Could not delete the file. Please try again." };

  revalidateDocuments();
  return { ok: true };
}
