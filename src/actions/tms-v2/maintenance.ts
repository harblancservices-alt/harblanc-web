"use server";

import { revalidatePath } from "next/cache";
import {
  createReceiptUploadUrl as legacyCreateReceiptUploadUrl,
  logServiceLive as legacyLogService,
  updateServiceLive as legacyUpdateService,
  deleteServiceLive as legacyDeleteService,
  deletePartLive as legacyDeletePart,
  deleteReceiptLive as legacyDeleteReceipt,
  setReminderDismissedLive as legacySetReminderDismissed,
  type CreateUploadUrlResult,
} from "@/app/admin/(authed)/maintenance/actions";
import { getServiceFull, type MaintenanceServiceFull } from "@/lib/data/maintenance";
import { adminFromMiddleware } from "@/lib/auth/session";
import type { MutationResult } from "@/lib/demo/mutation";

/**
 * Maintenance writes for /tms-v2 — thin wrappers around V1's service/parts/
 * reminder logic (src/app/admin/(authed)/maintenance/actions.ts), per the
 * phase brief: reuse, don't reinvent. The category-matching, preventative-
 * lens, and reminder-upsert rules in that file are genuinely complex domain
 * logic; duplicating them here would risk drift between the two apps. V1's
 * functions throw instead of returning MutationResult, so each wrapper adds
 * a try/catch to convert — the one behavioral difference from a straight
 * re-export, needed so tms-v2's UI never has to handle a rejected promise.
 *
 * Calls the `*Live` variants (ungated core, no `blockedByDemo()` check) —
 * /tms-v2 has no demo mode of its own, so its writes must never be silently
 * no-op'd by admin's demo cookie. Previously called the GATED versions
 * directly, which meant a service log/edit/delete or reminder dismiss from
 * tms-v2 would silently no-op (resolving without throwing, so this file's
 * try/catch reported `{ ok: true }`) whenever admin's hb-demo cookie was
 * set — the exact same bug class already fixed for Camera/Documents/
 * Expense-accounts, applied here too. createReceiptUploadUrl is unaffected
 * by this fix (it already returns a visible `{ ok: false, reason }` when
 * demo-blocked, not a silent void return) and is left calling the gated
 * export unchanged.
 */

function revalidateMaintenancePaths(id?: string) {
  revalidatePath("/tms-v2/maintenance");
  if (id) revalidatePath(`/tms-v2/maintenance/${id}`);
  revalidatePath("/tms-v2");
}

function toResult(e: unknown): MutationResult {
  return { ok: false, reason: e instanceof Error ? e.message : "Something went wrong. Please try again." };
}

export async function createReceiptUploadUrl(fileName: string, mimeType: string, sizeBytes: number): Promise<CreateUploadUrlResult> {
  return legacyCreateReceiptUploadUrl(fileName, mimeType, sizeBytes);
}

export async function logService(formData: FormData): Promise<MutationResult> {
  try {
    await legacyLogService(formData);
    revalidateMaintenancePaths();
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}

export async function updateService(serviceId: string, formData: FormData): Promise<MutationResult> {
  try {
    await legacyUpdateService(serviceId, formData);
    revalidateMaintenancePaths();
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}

export async function deleteService(serviceId: string): Promise<MutationResult> {
  try {
    await legacyDeleteService(serviceId);
    revalidateMaintenancePaths();
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}

export async function deletePart(entryId: string): Promise<MutationResult> {
  try {
    await legacyDeletePart(entryId);
    revalidateMaintenancePaths();
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}

export async function deleteReceipt(serviceId: string, attachmentId: string): Promise<MutationResult> {
  try {
    await legacyDeleteReceipt(serviceId, attachmentId);
    revalidateMaintenancePaths();
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}

/** Read-only — a service-type profile's history row fetches the whole
 * service (all its parts, not just the one matching this type) on tap, to
 * open it in LogServiceModal's edit mode. Not wrapped in mutation() (that
 * wrapper is write-only, per its own header) but still re-verifies the
 * admin session directly, the same guard mutation() applies internally,
 * since a Server Action is reachable even bypassing the (authed) layout. */
export async function fetchServiceFull(serviceId: string): Promise<MaintenanceServiceFull | null> {
  await adminFromMiddleware();
  return getServiceFull(serviceId);
}

export async function setReminderDismissed(reminderId: string, dismissed: boolean): Promise<MutationResult> {
  try {
    await legacySetReminderDismissed(reminderId, dismissed);
    revalidateMaintenancePaths();
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}
