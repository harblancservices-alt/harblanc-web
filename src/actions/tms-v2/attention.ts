"use server";

import { revalidatePath } from "next/cache";
import { dismissAlert as legacyDismissAlert, restoreAlert as legacyRestoreAlert } from "@/app/admin/(authed)/alert-actions";
import type { MutationResult } from "@/lib/demo/mutation";

/**
 * Needs Attention dismiss/undo (Phase 5D) — thin wrappers around V1's own
 * dismissAlert/restoreAlert (src/app/admin/(authed)/alert-actions.ts),
 * reused unchanged: same `dismissed_alerts` table, same upsert/delete-by-
 * alert_key semantics, same tolerance for the table not existing yet. Only
 * addition here is /tms-v2's own revalidatePath and converting V1's
 * throw-on-error into MutationResult.
 */

function revalidateTodayPaths() {
  revalidatePath("/tms-v2");
}

function toResult(e: unknown): MutationResult {
  return { ok: false, reason: e instanceof Error ? e.message : "Could not update that alert. Please try again." };
}

export async function dismissAlert(alertKey: string): Promise<MutationResult> {
  try {
    await legacyDismissAlert(alertKey);
    revalidateTodayPaths();
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}

export async function restoreAlert(alertKey: string): Promise<MutationResult> {
  try {
    await legacyRestoreAlert(alertKey);
    revalidateTodayPaths();
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}
