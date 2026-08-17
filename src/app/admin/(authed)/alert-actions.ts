"use server";

import { revalidatePath } from "next/cache";
import { blockedByDemo } from "@/lib/admin/demo";
import {
  dismissAlert as dismissAlertShared,
  restoreAlert as restoreAlertShared,
} from "@/lib/domain/alerts";

/**
 * Alert dismissals — the only writes behind the dashboard "Needs attention"
 * panel. Everything else the panel shows is derived live from loads /
 * reminders / leads; this records the owner swiping a specific alert away.
 *
 * The actual DB read/write logic (upsert/delete on `dismissed_alerts`,
 * missing-table tolerance) lives in the neutral src/lib/domain/alerts.ts
 * module, shared with /tms-v2's own alert-dismiss wrapper
 * (src/actions/tms-v2/attention.ts) — this file only adds the two things
 * specific to /admin: the demo-mode gate and revalidating /admin's own
 * paths. Neither app imports the other's code for this anymore.
 */

export async function dismissAlert(alertKey: string): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  await dismissAlertShared(alertKey);
  revalidatePath("/admin");
}

/** Undo — the alert comes straight back on the next render. */
export async function restoreAlert(alertKey: string): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  await restoreAlertShared(alertKey);
  revalidatePath("/admin");
}
