"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { blockedByDemo } from "@/lib/admin/demo";
import {
  createReceiptUploadUrl as createReceiptUploadUrlShared,
  type CreateUploadUrlResult,
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
 * The parsing/persistence/reminder logic — including createReceiptUploadUrl
 * — is shared with /tms-v2 via @/lib/domain/maintenance (see that file's
 * header) — this file only adds what's specific to /admin: the demo-mode
 * gate and revalidating /admin's own paths. attachRelated and detachRelated
 * are NOT part of that extraction and stay here unchanged; /tms-v2 doesn't
 * call them.
 *
 * Service-role client (admin-only, behind the authed shell). Actions throw on
 * failure so the modal surfaces the error inline. Receipts follow the SAME
 * signed-upload flow as before (private `maintenance-receipts` bucket).
 */

/**
 * Mint a signed upload URL so the CLIENT uploads a receipt's bytes directly to
 * the private maintenance-receipts bucket (bypassing the Server Action body
 * limit). Core logic lives in @/lib/domain/maintenance.ts, shared with
 * /tms-v2's wrapper (src/actions/tms-v2/maintenance.ts).
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
  return createReceiptUploadUrlShared(fileName, mimeType, sizeBytes);
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
