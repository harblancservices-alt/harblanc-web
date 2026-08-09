"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";

export type ActionResult = { ok: true } | { ok: false; error: string };

export const UPGRADE_STATUSES = ["new", "in_review", "done"] as const;
export type UpgradeStatus = (typeof UPGRADE_STATUSES)[number];

/**
 * Post a new Upgrades request (crm_upgrade_requests). Any active CRM member
 * can post — this is a team-wide feedback board, not owner-gated. Returns the
 * new row's id so the caller (UpgradeComposer) can upload screenshots
 * straight to Storage under `<org_id>/upgrades/<request_id>/...` afterward —
 * same two-step shape as BOL/commodity-photo uploads (bol-actions.ts),
 * except here the request itself has to exist first since screenshots are
 * scoped to it, not to an account.
 */
export async function createUpgradeRequest(input: {
  title: string;
  body: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireCrmUser();
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Tell us what you'd like changed or removed." };

  const supabase = await createCrmServerClient();
  const { data, error } = await supabase
    .from("crm_upgrade_requests")
    .insert({
      org_id: user.orgId,
      author_id: user.id,
      title,
      body: input.body?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: "Could not post the request. Please try again." };
  }

  revalidatePath("/crm/upgrades");
  return { ok: true, id: data.id as string };
}

/**
 * Record the metadata row for a screenshot already uploaded straight from the
 * browser to Supabase Storage (bucket "crm-documents", under
 * `<org_id>/upgrades/<request_id>/<uuid>-<sanitizedFileName>` — see
 * UpgradeComposer.tsx) — this action never sees file bytes, same reasoning as
 * bol-actions.ts::createBolDocument (server actions cap the request body well
 * under a typical screenshot).
 */
export async function addUpgradeAttachment(
  requestId: string,
  input: {
    fileName: string;
    storagePath: string;
    mimeType: string | null;
    sizeBytes: number | null;
  },
): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { error } = await supabase.from("crm_upgrade_attachments").insert({
    org_id: user.orgId,
    request_id: requestId,
    user_id: user.id,
    file_name: input.fileName,
    storage_path: input.storagePath,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
  });

  if (error) {
    return { ok: false, error: "Could not attach the screenshot. Please try again." };
  }

  revalidatePath("/crm/upgrades");
  return { ok: true };
}

/**
 * Change a request's status — owner-only (Brent triages the board). The
 * status pills are visible to everyone, but only an owner session can
 * actually move one; enforced here, not just hidden in the UI, since this is
 * a real permission boundary rather than a display preference.
 */
export async function updateUpgradeStatus(
  requestId: string,
  status: UpgradeStatus,
): Promise<ActionResult> {
  const user = await requireCrmUser();
  if (user.role !== "owner") {
    return { ok: false, error: "Only Brent can change a request's status." };
  }
  if (!UPGRADE_STATUSES.includes(status)) {
    return { ok: false, error: "Invalid status." };
  }

  const supabase = await createCrmServerClient();
  const { error } = await supabase
    .from("crm_upgrade_requests")
    .update({ status })
    .eq("id", requestId);

  if (error) {
    return { ok: false, error: "Could not update the status. Please try again." };
  }

  revalidatePath("/crm/upgrades");
  return { ok: true };
}
