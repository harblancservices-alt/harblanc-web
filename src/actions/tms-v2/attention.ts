"use server";

import { revalidatePath } from "next/cache";
import {
  dismissAlert as dismissAlertShared,
  restoreAlert as restoreAlertShared,
} from "@/lib/domain/alerts";
import type { MutationResult } from "@/lib/demo/mutation";

/**
 * Needs Attention dismiss/undo (Phase 5D) — thin wrapper around the neutral
 * dismissAlert/restoreAlert core (src/lib/domain/alerts.ts), shared with
 * /admin's own wrapper (src/app/admin/(authed)/alert-actions.ts): same
 * `dismissed_alerts` table, same upsert/delete-by-alert_key semantics, same
 * tolerance for the table not existing yet. /tms-v2 has no demo mode of its
 * own, so unlike admin's wrapper this one calls the shared core directly
 * with no demo gate — this file previously imported admin's OWN
 * dismissAlert/restoreAlert directly, which meant tms-v2's writes were
 * incidentally (and never intentionally) subject to admin's demo-mode
 * cookie; routing through the neutral module instead removes that
 * accidental coupling as a side effect of removing the admin import, the
 * same "ungated core" pattern already used for Camera/Documents/Expense-
 * accounts elsewhere in tms-v2. Only addition here beyond the shared core
 * is /tms-v2's own revalidatePath and converting throw-on-error into
 * MutationResult.
 */

function revalidateTodayPaths() {
  revalidatePath("/tms-v2");
}

function toResult(e: unknown): MutationResult {
  return { ok: false, reason: e instanceof Error ? e.message : "Could not update that alert. Please try again." };
}

export async function dismissAlert(alertKey: string): Promise<MutationResult> {
  try {
    await dismissAlertShared(alertKey);
    revalidateTodayPaths();
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}

export async function restoreAlert(alertKey: string): Promise<MutationResult> {
  try {
    await restoreAlertShared(alertKey);
    revalidateTodayPaths();
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}
