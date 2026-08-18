"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { resolveByToken } from "@/lib/quote-token/lookup";
import { logDispatchEvent } from "@/lib/dispatch/events";

/**
 * Customer-side upload server actions for the /quote/accept/[token]
 * page. Mirrors the auth model of saveIntakeProgress / submitIntake —
 * the accept_token IS the authorization. resolveByToken gates every
 * call; rejected tokens return cleanly without revealing which step
 * failed.
 *
 * Storage: files land in the private `intake-uploads` bucket. Path is
 * `{quote_request_id}/{uuid}-{sanitized_filename}` so a single lead's
 * uploads cluster in the bucket and a permanent-delete of the lead
 * can drive a future cleanup job by prefix.
 *
 * Validation: mime type allow-list mirrors the bucket's allowed_mime_types
 * column (kept in lock-step with the migration). Per-file size limit is
 * enforced both here AND at the bucket level (file_size_limit in the
 * migration) so an oversized file is rejected before bytes flow.
 */

const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

const INTAKE_BUCKET = "intake-uploads";

export type IntakeUploadResult =
  | { ok: true; uploadId: string }
  | { ok: false; reason: string };

/**
 * Sanitize an original filename for inclusion in a storage path.
 * Keeps letters, digits, dot, dash, underscore. Everything else gets
 * collapsed to a single hyphen. Truncates to a reasonable length so
 * weird customer filenames don't blow up the path budget.
 */
function sanitizeFilename(name: string): string {
  const trimmed = name.trim().slice(0, 80);
  const replaced = trimmed.replace(/[^A-Za-z0-9._-]+/g, "-");
  // Collapse runs of dashes and strip leading/trailing dashes.
  return replaced.replace(/-+/g, "-").replace(/^-+|-+$/g, "") || "upload";
}

/**
 * Upload a single file. Multi-file submissions call this once per file
 * from the client so partial failures don't tear down the whole batch.
 */
export async function uploadIntakeDocument(
  token: string,
  formData: FormData,
): Promise<IntakeUploadResult> {
  const resolved = await resolveByToken(token);
  if (!resolved.ok) {
    return { ok: false, reason: "This quote link isn't valid anymore." };
  }
  const { estimate, lead, intake } = resolved;
  if (estimate.declinedAt) {
    return { ok: false, reason: "This quote was already declined." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, reason: "Missing file." };
  }

  // Validate mime type. We trust the browser's reported type here
  // because the bucket also enforces allowed_mime_types — the storage
  // layer rejects a mismatch even if a client lies.
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return {
      ok: false,
      reason: `File type not supported: ${file.type || "unknown"}. Upload JPG, PNG, WEBP, or PDF.`,
    };
  }

  // Validate size. 15 MB matches the bucket's file_size_limit so the
  // user gets a friendly error here before the bucket rejects it.
  if (file.size <= 0) {
    return { ok: false, reason: "Empty file." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      reason: `File too large (${Math.round(file.size / 1024 / 1024)} MB). Maximum is 15 MB.`,
    };
  }

  const note = (() => {
    const raw = formData.get("note");
    if (raw == null) return null;
    const trimmed = String(raw).trim();
    return trimmed.length === 0 ? null : trimmed.slice(0, 500);
  })();

  // Path: {quote_request_id}/{random}-{sanitized_filename}
  const safeName = sanitizeFilename(file.name);
  const randomPrefix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const storagePath = `${lead.id}/${randomPrefix}-${safeName}`;

  const sb = createServiceRoleClient();

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await sb.storage
    .from(INTAKE_BUCKET)
    .upload(storagePath, bytes, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) {
    return {
      ok: false,
      reason: `Upload failed: ${uploadError.message}`,
    };
  }

  const { data: inserted, error: insertError } = await sb
    .from("shipment_intake_uploads")
    .insert({
      quote_request_id: lead.id,
      dispatch_estimate_id: estimate.id,
      shipment_intake_id: intake?.id ?? null,
      storage_path: storagePath,
      original_filename: file.name.slice(0, 240),
      mime_type: file.type,
      size_bytes: file.size,
      note,
      uploaded_via_token: token,
      source: "customer_intake",
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError || !inserted) {
    // Roll back the storage object so we don't leave an orphan.
    await sb.storage.from(INTAKE_BUCKET).remove([storagePath]);
    return {
      ok: false,
      reason: `Database insert failed: ${insertError?.message ?? "no row returned"}`,
    };
  }

  await logDispatchEvent(sb, lead.id, "intake_upload_added", {
    uploadId: inserted.id,
    mimeType: file.type,
    sizeBytes: file.size,
    originalFilename: file.name.slice(0, 240),
  });

  revalidatePath(`/quote/accept/${token}`);
  revalidatePath(`/admin/quotes/${lead.id}`);
  revalidatePath(`/tms-v2/operations/${lead.id}`);

  return { ok: true, uploadId: inserted.id };
}

export type IntakeDeleteResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Delete an upload the customer regrets. Token-gated: the upload must
 * belong to the lead the token resolves to, otherwise the call is
 * rejected as not-found (no enumeration leak).
 */
export async function deleteIntakeUpload(
  token: string,
  uploadId: string,
): Promise<IntakeDeleteResult> {
  if (!uploadId) {
    return { ok: false, reason: "Missing upload id." };
  }
  const resolved = await resolveByToken(token);
  if (!resolved.ok) {
    return { ok: false, reason: "This quote link isn't valid anymore." };
  }
  const { lead } = resolved;
  const sb = createServiceRoleClient();

  // Confirm the upload belongs to this lead before deleting. A scoped
  // .delete().eq().eq() chain avoids leaking row existence — wrong-lead
  // requests just return ok with 0 rows affected, which the client
  // can't distinguish from "already deleted".
  const { data: rows, error: lookupError } = await sb
    .from("shipment_intake_uploads")
    .select("id, storage_path")
    .eq("id", uploadId)
    .eq("quote_request_id", lead.id)
    .limit(1);
  if (lookupError) {
    return { ok: false, reason: lookupError.message };
  }
  const row = rows?.[0];
  if (!row) {
    // No such upload, or upload belongs to a different lead. Return ok
    // so the UI removes the row from its list either way.
    return { ok: true };
  }

  await sb.storage.from(INTAKE_BUCKET).remove([row.storage_path]);
  const { error: deleteError } = await sb
    .from("shipment_intake_uploads")
    .delete()
    .eq("id", row.id);
  if (deleteError) {
    return { ok: false, reason: deleteError.message };
  }

  await logDispatchEvent(sb, lead.id, "intake_upload_removed", {
    uploadId: row.id,
    storagePath: row.storage_path,
  });

  revalidatePath(`/quote/accept/${token}`);
  revalidatePath(`/admin/quotes/${lead.id}`);
  revalidatePath(`/tms-v2/operations/${lead.id}`);
  return { ok: true };
}
