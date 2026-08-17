"use server";

import { revalidatePath } from "next/cache";
import {
  logService as legacyLogService,
  updateService as legacyUpdateService,
  deleteService as legacyDeleteService,
  deletePart as legacyDeletePart,
  deleteReceipt as legacyDeleteReceipt,
  setReminderDismissed as legacySetReminderDismissed,
  createReceiptUploadUrl as legacyCreateReceiptUploadUrl,
  type CreateUploadUrlResult,
} from "@/lib/domain/maintenance";
import { getServiceFull, type MaintenanceServiceFull } from "@/lib/data/maintenance";
import { adminFromMiddleware } from "@/lib/auth/session";
import type { MutationResult } from "@/lib/demo/mutation";

/**
 * Maintenance writes for /tms-v2 — thin wrappers around the neutral
 * service/parts/reminder core (src/lib/domain/maintenance.ts), shared with
 * /admin's own wrapper (src/app/admin/(authed)/maintenance/actions.ts). The
 * category-matching, preventative-lens, and reminder-upsert rules in that
 * module are genuinely complex domain logic; duplicating them here would
 * risk drift between the two apps. The shared core throws instead of
 * returning MutationResult, so each wrapper adds a try/catch to convert —
 * the one behavioral difference from a straight re-export, needed so
 * tms-v2's UI never has to handle a rejected promise.
 *
 * /tms-v2 has no demo mode of its own, so unlike admin's wrapper these call
 * the shared core directly with no demo gate. createReceiptUploadUrl now
 * lives in the shared module too (retirement-readiness Objective 1B) —
 * previously this file imported admin's gated export directly; that direct
 * cross-app import is now gone.
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
