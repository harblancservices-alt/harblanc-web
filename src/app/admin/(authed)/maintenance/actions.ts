"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Maintenance actions. Service-role client (admin-only, behind the authed
 * shell), matching the loads/brokers posture. Actions throw on failure so
 * the modal surfaces the error inline instead of failing silently.
 */

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function intOrNull(fd: FormData, key: string): number | null {
  const s = str(fd, key);
  if (s == null) return null;
  const n = Number(s.replace(/[,]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * Log a completed service: append a maintenance_log row and roll the item's
 * last-service bookend forward so the next-due recalculates.
 */
export async function logMaintenance(formData: FormData): Promise<void> {
  const sb = createServiceRoleClient();

  const itemId = str(formData, "item_id");
  if (!itemId) throw new Error("Missing maintenance item.");

  const odo = intOrNull(formData, "service_odo");
  if (odo == null || odo < 0) {
    throw new Error("Enter the odometer reading the service was done at.");
  }

  const date = str(formData, "service_date") ?? new Date().toISOString().slice(0, 10);
  const notes = str(formData, "notes");

  const { error: logErr } = await sb.from("maintenance_log").insert({
    item_id: itemId,
    service_odo: odo,
    service_date: date,
    notes,
  });
  if (logErr) throw new Error(`Could not log service: ${logErr.message}`);

  const { error: updErr } = await sb
    .from("maintenance_items")
    .update({
      last_service_odo: odo,
      last_service_date: date,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .is("deleted_at", null);
  if (updErr) throw new Error(`Could not update item: ${updErr.message}`);

  revalidatePath("/admin/maintenance");
}

/** Adjust an item's mileage interval (and optional notes). */
export async function updateMaintenanceInterval(
  formData: FormData,
): Promise<void> {
  const sb = createServiceRoleClient();

  const itemId = str(formData, "item_id");
  if (!itemId) throw new Error("Missing maintenance item.");

  const interval = intOrNull(formData, "interval_miles");
  if (interval == null || interval <= 0) {
    throw new Error("Interval must be a positive number of miles.");
  }
  const notes = str(formData, "notes");

  const { error } = await sb
    .from("maintenance_items")
    .update({
      interval_miles: interval,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .is("deleted_at", null);
  if (error) throw new Error(`Could not update interval: ${error.message}`);

  revalidatePath("/admin/maintenance");
}
