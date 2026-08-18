"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logDispatchEvent } from "@/lib/dispatch/events";

/**
 * Anonymous Quick Quote upload action.
 *
 * Auth model: the public Quick Quote form has no token. We bound abuse
 * by accepting uploads ONLY for quote_request rows that were created
 * within QUICK_QUOTE_UPLOAD_WINDOW_MS. After that window, the lead
 * is "closed" for anonymous attachments — operators must request
 * additional files via the customer-intake flow (token-gated).
 *
 * This is deliberately narrower than the intake action:
 *   - validates the lead id maps to a real, recent quote_request
 *   - sets source = "quick_quote"
 *   - does NOT accept a per-upload note (the Quick Quote form has no
 *     note field; if we ever add one, plumb it through here)
 *
 * Storage path: same convention as intake uploads —
 * `{quote_request_id}/{uuid12}-{sanitized_filename}` — so both
 * sources cluster under one prefix per lead.
 */

const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB
const INTAKE_BUCKET = "intake-uploads";

/** Generous window so a customer can finish the upload after submitting
 *  the form on slow connections. */
const QUICK_QUOTE_UPLOAD_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export type QuickQuoteUploadResult =
  | { ok: true; uploadId: string }
  | { ok: false; reason: string };

function sanitizeFilename(name: string): string {
  const trimmed = name.trim().slice(0, 80);
  const replaced = trimmed.replace(/[^A-Za-z0-9._-]+/g, "-");
  return replaced.replace(/-+/g, "-").replace(/^-+|-+$/g, "") || "upload";
}

export async function uploadQuickQuoteDocument(
  leadId: string,
  formData: FormData,
): Promise<QuickQuoteUploadResult> {
  if (!leadId) {
    return { ok: false, reason: "Missing lead id." };
  }

  const sb = createServiceRoleClient();

  // Validate the lead exists AND was created within the upload window.
  const { data: lead, error: leadError } = await sb
    .from("quote_requests")
    .select("id, created_at, deleted_at")
    .eq("id", leadId)
    .maybeSingle<{ id: string; created_at: string; deleted_at: string | null }>();

  if (leadError || !lead) {
    return { ok: false, reason: "Quote request not found." };
  }
  if (lead.deleted_at) {
    return { ok: false, reason: "Quote request is no longer active." };
  }

  const ageMs = Date.now() - new Date(lead.created_at).getTime();
  if (ageMs > QUICK_QUOTE_UPLOAD_WINDOW_MS) {
    return {
      ok: false,
      reason:
        "Upload window closed. Reach out to dispatch directly to share additional files.",
    };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, reason: "Missing file." };
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return {
      ok: false,
      reason: `File type not supported: ${file.type || "unknown"}. Upload JPG, PNG, WEBP, or PDF.`,
    };
  }
  if (file.size <= 0) {
    return { ok: false, reason: "Empty file." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      reason: `File too large (${Math.round(file.size / 1024 / 1024)} MB). Maximum is 15 MB.`,
    };
  }

  const safeName = sanitizeFilename(file.name);
  const randomPrefix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const storagePath = `${lead.id}/${randomPrefix}-${safeName}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await sb.storage
    .from(INTAKE_BUCKET)
    .upload(storagePath, bytes, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) {
    return { ok: false, reason: `Upload failed: ${uploadError.message}` };
  }

  const { data: inserted, error: insertError } = await sb
    .from("shipment_intake_uploads")
    .insert({
      quote_request_id: lead.id,
      // dispatch_estimate_id + shipment_intake_id intentionally null —
      // a Quick Quote lead has neither at upload time.
      storage_path: storagePath,
      original_filename: file.name.slice(0, 240),
      mime_type: file.type,
      size_bytes: file.size,
      source: "quick_quote",
      // uploaded_via_token left null — Quick Quote is anonymous.
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

  revalidatePath(`/admin/quotes/${lead.id}`);
  revalidatePath(`/tms-v2/operations/${lead.id}`);

  return { ok: true, uploadId: inserted.id };
}
