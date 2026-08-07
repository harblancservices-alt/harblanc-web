"use server";

import { revalidatePath } from "next/cache";
import {
  createReceiptUploadUrl as legacyCreateReceiptUploadUrl,
  logService as legacyLogService,
  updateService as legacyUpdateService,
  deleteService as legacyDeleteService,
  deletePart as legacyDeletePart,
  deleteReceipt as legacyDeleteReceipt,
  setReminderDismissed as legacySetReminderDismissed,
  type CreateUploadUrlResult,
} from "@/app/admin/(authed)/maintenance/actions";
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
 */

export type { CreateUploadUrlResult };

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

export async function setReminderDismissed(reminderId: string, dismissed: boolean): Promise<MutationResult> {
  try {
    await legacySetReminderDismissed(reminderId, dismissed);
    revalidateMaintenancePaths();
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}
