"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { getBrokerProfile } from "../_shell/brokerProfile";
import { createBlankTemplateDocument } from "./blankTemplates";
import type { GeneratedTemplateLabel } from "./templateLabels";

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

  revalidatePath("/crm/settings");
  return { ok: true };
}

/** Soft-delete an org-level reference document. Admin-only, same gate as
 * createOrgDocument. Leaves the storage object in place (recoverable). */
export async function deleteOrgDocument(documentId: string): Promise<ActionResult> {
  const user = await requireCrmUser();
  if (user.role !== "owner") {
    return { ok: false, error: "Only an admin can manage documents." };
  }

  const supabase = await createCrmServerClient();
  const { error } = await supabase
    .from("crm_documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", documentId);

  if (error) {
    return { ok: false, error: "Could not delete the document. Please try again." };
  }

  revalidatePath("/crm/settings");
  return { ok: true };
}

/**
 * (Re)generate a blank RC/BOL template — the Bill of Lading and Rate
 * Confirmation cards' "Generate template"/"Regenerate" button. Renders
 * through the exact same PDF components the real shipment-based generator
 * uses (see blankTemplates.ts), with every field left blank, and stores it
 * as a new version of that card's document. Admin-only, same gate as every
 * other Documents-tab mutation.
 */
export async function generateBlankTemplate(label: GeneratedTemplateLabel): Promise<ActionResult> {
  const user = await requireCrmUser();
  if (user.role !== "owner") {
    return { ok: false, error: "Only an admin can manage documents." };
  }

  const supabase = await createCrmServerClient();
  const broker = await getBrokerProfile();
  const result = await createBlankTemplateDocument(supabase, user, label, broker);
  if (!result.ok) return result;

  revalidatePath("/crm/settings");
  return { ok: true };
}
