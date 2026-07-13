"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Countdown-goal CRUD — the writes behind the dashboard countdown widget.
 * Everything the rows/breakdown show is computed read-only from live load
 * data; these actions edit the goals themselves (label / subtitle / amount /
 * date, plus add and soft-remove) and the owner-entered current-cash figure.
 */

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/** Parse a money field, tolerating "$2,728.30" style input. >= 0, else 0. */
function amount(fd: FormData, key: string): number {
  const v = fd.get(key);
  if (typeof v !== "string") return 0;
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** A `YYYY-MM-DD` date field (from <input type="date">), or null if empty/bad. */
function dateOnly(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export async function createCountdownGoal(formData: FormData): Promise<void> {
  const sb = createServiceRoleClient();
  const label = str(formData, "label") || "Untitled goal";
  const targetDate = dateOnly(formData, "target_date");
  if (!targetDate) throw new Error("A target date is required.");

  // Append after the current goals so the new card lands last.
  const { data: last } = await sb
    .from("countdown_goals")
    .select("sort_order")
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>();

  const { error } = await sb.from("countdown_goals").insert({
    label,
    subtitle: str(formData, "subtitle"),
    target_amount: amount(formData, "target_amount"),
    target_date: targetDate,
    sort_order: (last?.sort_order ?? -1) + 1,
  });
  if (error) throw new Error(`Could not add countdown goal: ${error.message}`);
  revalidatePath("/admin");
}

export async function updateCountdownGoal(
  id: string,
  formData: FormData,
): Promise<void> {
  const sb = createServiceRoleClient();
  const targetDate = dateOnly(formData, "target_date");
  if (!targetDate) throw new Error("A target date is required.");

  const { error } = await sb
    .from("countdown_goals")
    .update({
      label: str(formData, "label") || "Untitled goal",
      subtitle: str(formData, "subtitle"),
      target_amount: amount(formData, "target_amount"),
      target_date: targetDate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) throw new Error(`Could not save countdown goal: ${error.message}`);
  revalidatePath("/admin");
}

export async function deleteCountdownGoal(id: string): Promise<void> {
  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("countdown_goals")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) throw new Error(`Could not remove countdown goal: ${error.message}`);
  revalidatePath("/admin");
}

/**
 * Owner-entered cash on hand — a single figure on the dispatch_settings
 * singleton (id=true), the same row the fuel defaults and net-profit goals
 * live on. The widget compares it against the goal total to show the shortfall.
 */
export async function updateCurrentCash(formData: FormData): Promise<void> {
  const sb = createServiceRoleClient();
  const cash = amount(formData, "current_cash");
  const { error } = await sb
    .from("dispatch_settings")
    .update({ current_cash: cash, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) throw new Error(`Could not save current cash: ${error.message}`);
  revalidatePath("/admin");
}
