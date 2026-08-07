"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { mutation, type MutationResult } from "@/lib/demo/mutation";

/**
 * Countdown-goal CRUD — same mutation() pattern as every other tms-v2
 * action, reimplementing legacy's countdown-actions.ts (which throws
 * instead of returning MutationResult) rather than importing it.
 */

function revalidateCountdownPaths() {
  revalidatePath("/tms-v2");
}

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function amount(fd: FormData, key: string): number {
  const v = fd.get(key);
  if (typeof v !== "string") return 0;
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function dateOnly(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export const createCountdownGoal = mutation(async (formData: FormData): Promise<MutationResult<{ id: string }>> => {
  const targetDate = dateOnly(formData, "target_date");
  if (!targetDate) return { ok: false, reason: "A target date is required." };

  const sb = createServiceRoleClient();
  const { data: last } = await sb
    .from("countdown_goals")
    .select("sort_order")
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>();

  const { data: created, error } = await sb
    .from("countdown_goals")
    .insert({
      label: str(formData, "label") || "Untitled goal",
      subtitle: str(formData, "subtitle"),
      target_amount: amount(formData, "target_amount"),
      target_date: targetDate,
      sort_order: (last?.sort_order ?? -1) + 1,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !created) return { ok: false, reason: `Could not add countdown goal: ${error?.message ?? "unknown error"}` };

  revalidateCountdownPaths();
  return { ok: true, data: { id: created.id } };
});

export const updateCountdownGoal = mutation(async (id: string, formData: FormData): Promise<MutationResult> => {
  const targetDate = dateOnly(formData, "target_date");
  if (!targetDate) return { ok: false, reason: "A target date is required." };

  const sb = createServiceRoleClient();
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
  if (error) return { ok: false, reason: `Could not save countdown goal: ${error.message}` };

  revalidateCountdownPaths();
  return { ok: true };
});

export const deleteCountdownGoal = mutation(async (id: string): Promise<MutationResult> => {
  const sb = createServiceRoleClient();
  const { error } = await sb.from("countdown_goals").update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null);
  if (error) return { ok: false, reason: `Could not remove countdown goal: ${error.message}` };

  revalidateCountdownPaths();
  return { ok: true };
});
