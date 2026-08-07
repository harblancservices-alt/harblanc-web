"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { mutation, type MutationResult } from "@/lib/demo/mutation";

const RETENTION_DAYS = 30;

function revalidateApplicationPaths(id?: string) {
  revalidatePath("/tms-v2/operations");
  if (id) revalidatePath(`/tms-v2/operations/applications/${id}`);
  revalidatePath("/tms-v2");
}

function dedupeIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter((s) => s.length > 0)));
}

/** Soft-delete ("trash") a single application — 30-day retention window,
 * same semantics as legacy's softDeleteApplication (applications/actions.ts). */
export const softDeleteApplication = mutation(async (id: string): Promise<MutationResult> => {
  const sb = createServiceRoleClient();
  const now = new Date();
  const deleteAfter = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const { error } = await sb
    .from("applications")
    .update({ deleted_at: now.toISOString(), delete_after: deleteAfter.toISOString() })
    .eq("id", id);
  if (error) return { ok: false, reason: `Could not move application to trash: ${error.message}` };

  revalidateApplicationPaths(id);
  return { ok: true };
});

export const restoreApplication = mutation(async (id: string): Promise<MutationResult> => {
  const sb = createServiceRoleClient();
  const { error } = await sb.from("applications").update({ deleted_at: null, delete_after: null }).eq("id", id);
  if (error) return { ok: false, reason: `Could not restore application: ${error.message}` };

  revalidateApplicationPaths(id);
  return { ok: true };
});

/** Guard preserved from legacy: refuses to hard-delete a row that isn't
 * already trashed. */
export const permanentlyDeleteApplication = mutation(async (id: string): Promise<MutationResult> => {
  const sb = createServiceRoleClient();
  const { data: row, error: readError } = await sb
    .from("applications")
    .select("deleted_at")
    .eq("id", id)
    .maybeSingle<{ deleted_at: string | null }>();
  if (readError) return { ok: false, reason: `Lookup failed: ${readError.message}` };
  if (!row) return { ok: false, reason: "Application not found." };
  if (row.deleted_at === null) {
    return { ok: false, reason: "Cannot permanently delete an active application. Move it to trash first." };
  }

  const { error } = await sb.from("applications").delete().eq("id", id);
  if (error) return { ok: false, reason: `Could not permanently delete application: ${error.message}` };

  revalidateApplicationPaths();
  return { ok: true };
});

/* ────────────────────────────────────────────────────────────── */
/* Bulk variants — Phase 6 item 3 wires these into a multi-select UI; */
/* ported now alongside the singular actions since they share this file */
/* and the same guard/retention logic. */
/* ────────────────────────────────────────────────────────────── */

export const softDeleteApplications = mutation(async (ids: string[]): Promise<MutationResult> => {
  const uniq = dedupeIds(ids);
  if (uniq.length === 0) return { ok: false, reason: "No applications selected." };

  const sb = createServiceRoleClient();
  const now = new Date();
  const deleteAfter = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { error } = await sb
    .from("applications")
    .update({ deleted_at: now.toISOString(), delete_after: deleteAfter.toISOString() })
    .in("id", uniq);
  if (error) return { ok: false, reason: `Bulk trash failed: ${error.message}` };

  revalidateApplicationPaths();
  return { ok: true };
});

export const restoreApplications = mutation(async (ids: string[]): Promise<MutationResult> => {
  const uniq = dedupeIds(ids);
  if (uniq.length === 0) return { ok: false, reason: "No applications selected." };

  const sb = createServiceRoleClient();
  const { error } = await sb.from("applications").update({ deleted_at: null, delete_after: null }).in("id", uniq);
  if (error) return { ok: false, reason: `Bulk restore failed: ${error.message}` };

  revalidateApplicationPaths();
  return { ok: true };
});

export const permanentlyDeleteApplications = mutation(async (ids: string[]): Promise<MutationResult> => {
  const uniq = dedupeIds(ids);
  if (uniq.length === 0) return { ok: false, reason: "No applications selected." };

  const sb = createServiceRoleClient();
  const { data: rows, error: readError } = await sb
    .from("applications")
    .select("id, deleted_at")
    .in("id", uniq)
    .returns<{ id: string; deleted_at: string | null }[]>();
  if (readError) return { ok: false, reason: `Lookup failed: ${readError.message}` };
  if (!rows || rows.length === 0) return { ok: false, reason: "No matching applications found." };

  const stillActive = rows.filter((r) => r.deleted_at === null);
  if (stillActive.length > 0) {
    return {
      ok: false,
      reason: `Cannot permanently delete: ${stillActive.length} of ${rows.length} selected row(s) are still active. Move them to trash first.`,
    };
  }

  const { error } = await sb.from("applications").delete().in("id", uniq);
  if (error) return { ok: false, reason: `Bulk permanent delete failed: ${error.message}` };

  revalidateApplicationPaths();
  return { ok: true };
});
