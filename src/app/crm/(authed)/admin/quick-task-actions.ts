"use server";

import { revalidatePath } from "next/cache";
import { createCrmServerClient, requireCrmUser } from "@/lib/crm/auth";
import { isDuplicateQuickTask, normalizeQuickTask } from "./quickTasks";

/**
 * Reads and writes for the org's one-click task buttons
 * (public.crm_quick_tasks).
 *
 * OWNER-ONLY for writes, matching assign-actions.ts: these buttons are shared
 * by the whole org, so changing them is an admin act. Enforced here, not only
 * in the UI — the Add/Edit controls are already owner-gated on screen, but a
 * tampered request has to be refused rather than quietly applied.
 *
 * SOFT DELETE. Removing a button sets deleted_at; the row stays, so a
 * mis-click is recoverable with one UPDATE. Same convention as every other
 * CRM table.
 */

export type QuickTask = { id: string; label: string };

export type QuickTaskResult = { ok: true } | { ok: false; error: string };

export async function listQuickTasks(): Promise<QuickTask[]> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data } = await supabase
    .from("crm_quick_tasks")
    .select("id, label")
    .eq("org_id", user.orgId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return (data ?? []).map((r) => ({ id: r.id as string, label: r.label as string }));
}

export async function addQuickTask(rawLabel: string): Promise<QuickTaskResult> {
  const user = await requireCrmUser();
  if (user.role !== "owner") return { ok: false, error: "Only an admin can change these buttons." };

  const label = normalizeQuickTask(rawLabel);
  if (!label) return { ok: false, error: "Give the button a label." };

  const supabase = await createCrmServerClient();

  // Re-check against what is ACTUALLY stored rather than trusting the list the
  // client rendered — two admins adding at once would otherwise both pass the
  // client-side check and create the same button twice.
  const { data: existing } = await supabase
    .from("crm_quick_tasks")
    .select("label, sort_order")
    .eq("org_id", user.orgId)
    .is("deleted_at", null);

  const labels = (existing ?? []).map((r) => r.label as string);
  if (isDuplicateQuickTask(labels, label)) return { ok: false, error: `"${label}" is already there.` };

  // Append: one past the current maximum, so a new button lands at the end
  // rather than colliding with an existing position.
  const nextOrder = (existing ?? []).reduce((max, r) => Math.max(max, (r.sort_order as number) ?? 0), -1) + 1;

  const { error } = await supabase.from("crm_quick_tasks").insert({
    org_id: user.orgId,
    label,
    sort_order: nextOrder,
    created_by_user_id: user.id,
  });

  if (error) return { ok: false, error: "Could not add that button. Please try again." };

  revalidatePath("/crm/admin");
  return { ok: true };
}

export async function removeQuickTask(id: string): Promise<QuickTaskResult> {
  const user = await requireCrmUser();
  if (user.role !== "owner") return { ok: false, error: "Only an admin can change these buttons." };
  if (!id) return { ok: false, error: "Nothing to remove." };

  const supabase = await createCrmServerClient();
  const { error } = await supabase
    .from("crm_quick_tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", user.orgId)
    .is("deleted_at", null);

  if (error) return { ok: false, error: "Could not remove that button. Please try again." };

  revalidatePath("/crm/admin");
  return { ok: true };
}
