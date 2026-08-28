"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { isUpgradeStatus, type UpgradeStatus } from "./status";

export type ActionResult = { ok: true } | { ok: false; error: string };

const STORAGE_BUCKET = "crm-documents";

export type NewAttachment = {
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
};

/**
 * Post a new Upgrades request, WITH its screenshots, in one call.
 *
 * This used to be two steps — create the row, then upload and attach each
 * screenshot afterwards — and that ordering is what let the portal tell a
 * salesperson "posted" while their screenshot had silently failed to upload.
 * The request already existed by then, so there was nothing to undo and no
 * way to retry; the evidence was just gone.
 *
 * Now the browser generates the request id, uploads every screenshot to its
 * final path FIRST, and only calls this once all of them are actually in
 * Storage (UpgradeComposer.tsx). If an upload fails the composer never gets
 * here and keeps the user's text and images intact.
 *
 * The last gap this closes is a partial write: if the request row inserts but
 * an attachment row does not, the request is deleted again before returning.
 * `ok` means the whole report persisted — title, body and every screenshot —
 * and it is never returned when part of it is missing.
 */
export async function createUpgradeRequest(input: {
  id: string;
  title: string;
  body: string | null;
  attachments: NewAttachment[];
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireCrmUser();
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Tell us what you'd like changed or removed." };

  const supabase = await createCrmServerClient();
  const { data, error } = await supabase
    .from("crm_upgrade_requests")
    .insert({
      id: input.id,
      org_id: user.orgId,
      author_id: user.id,
      title,
      body: input.body?.trim() || null,
      status: "open",
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createUpgradeRequest failed:", error);
    return {
      ok: false,
      error: error ? `Could not post the request: ${error.message}` : "Could not post the request.",
    };
  }

  const requestId = data.id as string;

  if (input.attachments.length > 0) {
    const { error: attachError } = await supabase.from("crm_upgrade_attachments").insert(
      input.attachments.map((a) => ({
        org_id: user.orgId,
        request_id: requestId,
        user_id: user.id,
        file_name: a.fileName,
        storage_path: a.storagePath,
        mime_type: a.mimeType,
        size_bytes: a.sizeBytes,
      })),
    );

    if (attachError) {
      // Undo the request rather than leave a report whose evidence is
      // detached from it. The composer still holds everything, so the user
      // loses nothing but the click.
      console.error("createUpgradeRequest: attachments failed, rolling back:", attachError);
      await supabase.from("crm_upgrade_requests").delete().eq("id", requestId);
      return {
        ok: false,
        error: "Your screenshots could not be attached, so nothing was submitted. Please try again.",
      };
    }
  }

  revalidatePath("/crm/upgrades");
  return { ok: true, id: requestId };
}

/**
 * Move a request through its lifecycle — owner-only (Brent triages the
 * board). The permission boundary lives here rather than in the UI, because
 * hiding a button is not a permission.
 *
 * The timestamps are written HERE rather than left to the caller, so a
 * completed request always carries who completed it and when. That is the
 * whole reason the reporter can tell the difference between "someone fixed
 * this" and "this quietly vanished".
 */
export async function updateUpgradeStatus(
  requestId: string,
  status: UpgradeStatus,
  completionNote?: string | null,
): Promise<ActionResult> {
  const user = await requireCrmUser();
  if (user.role !== "owner") {
    return { ok: false, error: "Only Brent can change a request's status." };
  }
  if (!isUpgradeStatus(status)) {
    return { ok: false, error: "Invalid status." };
  }

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = { status, updated_at: nowIso };

  if (status === "in_progress") {
    patch.started_at = nowIso;
    patch.completed_at = null;
    patch.completed_by = null;
  } else if (status === "completed") {
    patch.completed_at = nowIso;
    patch.completed_by = user.id;
    const note = completionNote?.trim();
    if (note) patch.completion_note = note;
  } else if (status === "open") {
    // Reopening clears the completion, otherwise a reopened issue keeps
    // claiming it was finished.
    patch.completed_at = null;
    patch.completed_by = null;
    patch.started_at = null;
  }

  const supabase = await createCrmServerClient();
  const { error } = await supabase.from("crm_upgrade_requests").update(patch).eq("id", requestId);

  if (error) {
    console.error("updateUpgradeStatus failed:", error);
    return { ok: false, error: `Could not update the status: ${error.message}` };
  }

  revalidatePath("/crm/upgrades");
  return { ok: true };
}

/**
 * DELETE, as its own deliberate action.
 *
 * "Done" used to double as the disappear button, which meant the only way to
 * clear a request off the board was to claim it had been fixed. Those are
 * different statements and now have different controls.
 *
 * An author can delete their own report; an owner can delete any. Soft
 * delete on both tables — the rows stay recoverable — but the screenshots
 * are removed from Storage, because that is what "permanently remove this
 * issue and its screenshots" promises the user in the confirmation.
 */
export async function deleteUpgradeRequest(requestId: string): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: row, error: readError } = await supabase
    .from("crm_upgrade_requests")
    .select("id, author_id")
    .eq("id", requestId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError) {
    console.error("deleteUpgradeRequest read failed:", readError);
    return { ok: false, error: `Could not delete the request: ${readError.message}` };
  }
  if (!row) return { ok: false, error: "That request no longer exists." };

  const isAuthor = (row.author_id as string | null) === user.id;
  if (!isAuthor && user.role !== "owner") {
    return { ok: false, error: "You can only delete a request you submitted." };
  }

  const now = new Date().toISOString();

  const { data: attachments } = await supabase
    .from("crm_upgrade_attachments")
    .select("id, storage_path")
    .eq("request_id", requestId)
    .is("deleted_at", null);

  const { error } = await supabase
    .from("crm_upgrade_requests")
    .update({ deleted_at: now })
    .eq("id", requestId);

  if (error) {
    console.error("deleteUpgradeRequest failed:", error);
    return { ok: false, error: `Could not delete the request: ${error.message}` };
  }

  await supabase
    .from("crm_upgrade_attachments")
    .update({ deleted_at: now })
    .eq("request_id", requestId);

  // Best effort, and deliberately last: the request is already gone from the
  // board by this point, so a Storage hiccup must not turn a successful
  // delete into an error the user has to act on.
  const paths = (attachments ?? []).map((a) => a.storage_path as string).filter(Boolean);
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
    if (storageError) console.error("deleteUpgradeRequest: storage cleanup failed:", storageError);
  }

  revalidatePath("/crm/upgrades");
  return { ok: true };
}
