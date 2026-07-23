"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { blockedByDemo } from "@/lib/admin/demo";

/**
 * Alert dismissals — the only writes behind the dashboard "Needs attention"
 * panel. Everything else the panel shows is derived live from loads /
 * reminders / leads; this records the owner swiping a specific alert away.
 *
 * Keyed by the stable alert key (see alertKey() in lib/dispatch/alerts):
 * `incomplete-load:{loadId}`, `receivable:{loadId}`, `maintenance:{id}`, …
 *
 * Both actions tolerate `dismissed_alerts` not existing yet — the table ships
 * as a migration applied to the remote DB separately, and a dashboard that
 * threw until then would be worse than one where the swipe simply doesn't
 * stick. The read side needs no such guard: a failed select resolves with
 * `data: null`, which the dashboard already reads as "nothing dismissed".
 */

/**
 * "The table isn't there yet" — the migration hasn't been applied to the
 * remote DB. Two codes, because the request can fail at either layer:
 * PGRST205 is PostgREST refusing to route to a table missing from its schema
 * cache (what actually comes back in practice, verified against the live DB),
 * and 42P01 is Postgres' own undefined_table if a call gets past the cache.
 */
const MISSING_TABLE_CODES = new Set(["PGRST205", "42P01"]);

function isMissingTable(error: { code?: string } | null): boolean {
  return !!error?.code && MISSING_TABLE_CODES.has(error.code);
}

export async function dismissAlert(alertKey: string): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  const key = alertKey.trim();
  if (!key) return;

  const sb = createServiceRoleClient();
  // upsert, not insert: alert_key is the primary key, so a double-swipe (or a
  // retry after a flaky response) is a no-op rather than a duplicate-key error.
  const { error } = await sb
    .from("dismissed_alerts")
    .upsert({ alert_key: key }, { onConflict: "alert_key" });

  if (error && !isMissingTable(error)) {
    throw new Error(`Could not ignore that alert: ${error.message}`);
  }
  revalidatePath("/admin");
}

/** Undo — the alert comes straight back on the next render. */
export async function restoreAlert(alertKey: string): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  const key = alertKey.trim();
  if (!key) return;

  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("dismissed_alerts")
    .delete()
    .eq("alert_key", key);

  if (error && !isMissingTable(error)) {
    throw new Error(`Could not restore that alert: ${error.message}`);
  }
  revalidatePath("/admin");
}
