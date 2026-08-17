"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { blockedByDemo } from "@/lib/admin/demo";
import {
  RECEIPT_BUCKET,
  RECEIPT_MIME,
  RECEIPT_MAX_BYTES,
  logService as logServiceShared,
  updateService as updateServiceShared,
  deleteReceipt as deleteReceiptShared,
  deleteService as deleteServiceShared,
  deletePart as deletePartShared,
  setReminderDismissed as setReminderDismissedShared,
} from "@/lib/domain/maintenance";

/**
 * Maintenance actions — SERVICE-based, parts-first. A repair_service is one
 * shop/dealer visit that holds many parts (repair_entries). Date, odometer, the
 * optional total, and receipts live on the service; each part carries just its
 * identity (description, category, position, sub_category, part_group).
 *
 * The parsing/persistence/reminder logic is shared with /tms-v2 via
 * @/lib/domain/maintenance (see that file's header) — this file only adds
 * what's specific to /admin: the demo-mode gate and revalidating /admin's
 * own paths. createReceiptUploadUrl, attachRelated, and detachRelated are
 * NOT part of that extraction and stay here unchanged; /tms-v2 doesn't call
 * them. RECEIPT_BUCKET/RECEIPT_MIME/RECEIPT_MAX_BYTES are imported from the
 * shared module since createReceiptUploadUrl below also needs the identical
 * bucket name and validation limits.
 *
 * Service-role client (admin-only, behind the authed shell). Actions throw on
 * failure so the modal surfaces the error inline. Receipts follow the SAME
 * signed-upload flow as before (private `maintenance-receipts` bucket).
 */

function sanitizeFilename(name: string): string {
  const trimmed = name.trim().slice(0, 80);
  return (
    trimmed
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") || "upload"
  );
}

export type CreateUploadUrlResult =
  | { ok: true; bucket: string; path: string; token: string }
  | { ok: false; reason: string };

/**
 * Mint a signed upload URL so the CLIENT uploads a receipt's bytes directly to
 * the private maintenance-receipts bucket (bypassing the Server Action body
 * limit). Unchanged from the previous flow.
 */
export async function createReceiptUploadUrl(
  fileName: string,
  mimeType: string,
  sizeBytes: number,
): Promise<CreateUploadUrlResult> {
  // DEMO: never mint a storage upload token — receipts are read-only in demo.
  if (await blockedByDemo()) {
    return { ok: false, reason: "Demo mode — receipt uploads are disabled." };
  }
  try {
    if (!RECEIPT_MIME.has(mimeType)) {
      return {
        ok: false,
        reason: `Unsupported file "${fileName}" (${mimeType || "unknown"}). Use JPG, PNG, HEIC, WEBP, or PDF.`,
      };
    }
    if (sizeBytes > RECEIPT_MAX_BYTES) {
      return {
        ok: false,
        reason: `"${fileName}" is too large (${Math.round(sizeBytes / 1024 / 1024)} MB). Max 20 MB.`,
      };
    }
    const group = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const prefix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const path = `maintenance/uploads/${group}/${prefix}-${sanitizeFilename(fileName)}`;
    const sb = createServiceRoleClient();
    const { data, error } = await sb.storage
      .from(RECEIPT_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      return {
        ok: false,
        reason: `Could not start upload: ${error?.message ?? "unknown error"}`,
      };
    }
    return { ok: true, bucket: RECEIPT_BUCKET, path: data.path, token: data.token };
  } catch (e) {
    console.error("[createReceiptUploadUrl] failed:", e);
    return {
      ok: false,
      reason: `Could not start upload: ${e instanceof Error ? e.message : "unexpected error"}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Service CRUD — gated wrappers around the shared core.

export async function logService(formData: FormData): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  await logServiceShared(formData);
  revalidatePath("/admin/maintenance", "layout");
  revalidatePath("/admin");
}

export async function updateService(
  serviceId: string,
  formData: FormData,
): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  await updateServiceShared(serviceId, formData);
  revalidatePath("/admin/maintenance", "layout");
  revalidatePath("/admin");
}

/**
 * Delete ONE receipt off a service — what the doc viewer's Delete calls.
 * The service itself is untouched: a visit with no receipt is still a visit.
 */
export async function deleteReceipt(
  serviceId: string,
  attachmentId: string,
): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  await deleteReceiptShared(serviceId, attachmentId);
  revalidatePath("/admin/maintenance", "layout");
  revalidatePath("/admin");
}

/**
 * Delete a whole service (visit): its parts, their related links, and its
 * receipts all cascade; the receipt storage objects are removed first.
 */
export async function deleteService(serviceId: string): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  await deleteServiceShared(serviceId);
  revalidatePath("/admin/maintenance");
  revalidatePath("/admin");
}

/**
 * Delete a single PART. If it was the last part of its service, the now-empty
 * service (and its receipts) is removed too.
 */
export async function deletePart(entryId: string): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  await deletePartShared(entryId);
  revalidatePath("/admin/maintenance");
  revalidatePath("/admin");
}

// ---------------------------------------------------------------------------
// Related links (part ↔ part) — unchanged, not part of the shared extraction.

function linkPair(x: string, y: string): { a: string; b: string } {
  return x < y ? { a: x, b: y } : { a: y, b: x };
}

export async function attachRelated(
  entryId: string,
  otherId: string,
): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  if (!otherId || otherId === entryId) return;
  const sb = createServiceRoleClient();
  const { a, b } = linkPair(entryId, otherId);
  const { error } = await sb.from("repair_links").insert({ a_id: a, b_id: b });
  if (error && !/duplicate|unique/i.test(error.message)) {
    throw new Error(`Could not link repair: ${error.message}`);
  }
  revalidatePath(`/admin/maintenance/${entryId}`);
  revalidatePath(`/admin/maintenance/${otherId}`);
}

export async function detachRelated(
  entryId: string,
  otherId: string,
): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  if (!entryId || !otherId) return;
  const sb = createServiceRoleClient();
  const { a, b } = linkPair(entryId, otherId);
  const { error } = await sb
    .from("repair_links")
    .delete()
    .eq("a_id", a)
    .eq("b_id", b);
  if (error) throw new Error(`Could not unlink repair: ${error.message}`);
  revalidatePath(`/admin/maintenance/${entryId}`);
  revalidatePath(`/admin/maintenance/${otherId}`);
}

// ---------------------------------------------------------------------------
// Reminders.

export async function setReminderDismissed(
  reminderId: string,
  dismissed: boolean,
): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  await setReminderDismissedShared(reminderId, dismissed);
  revalidatePath("/admin/maintenance");
  revalidatePath("/admin");
}
