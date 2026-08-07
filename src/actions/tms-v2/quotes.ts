"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { mutation, type MutationResult } from "@/lib/demo/mutation";

/**
 * Quote-request (lead) trash lifecycle for /tms-v2 — ported from legacy's
 * src/app/admin/(authed)/quotes/actions.ts (softDeleteQuote(s)/restoreQuote(s)/
 * permanentlyDeleteQuote(s)), reshaped to the mutation()/MutationResult/
 * ids:string[] pattern src/actions/tms-v2/applications.ts already
 * established, rather than legacy's throw+redirect/FormData shape.
 * Same 30-day retention semantics (deleted_at + delete_after).
 */

const RETENTION_DAYS = 30;

function revalidateQuotePaths(id?: string) {
  revalidatePath("/tms-v2/operations");
  if (id) revalidatePath(`/tms-v2/operations/${id}`);
  revalidatePath("/tms-v2");
}

function dedupeIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter((s) => s.length > 0)));
}

export const softDeleteLead = mutation(async (id: string): Promise<MutationResult> => {
  const sb = createServiceRoleClient();
  const now = new Date();
  const deleteAfter = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { error } = await sb
    .from("quote_requests")
    .update({ deleted_at: now.toISOString(), delete_after: deleteAfter.toISOString() })
    .eq("id", id);
  if (error) return { ok: false, reason: `Could not move quote to trash: ${error.message}` };

  revalidateQuotePaths(id);
  return { ok: true };
});

export const restoreLead = mutation(async (id: string): Promise<MutationResult> => {
  const sb = createServiceRoleClient();
  const { error } = await sb.from("quote_requests").update({ deleted_at: null, delete_after: null }).eq("id", id);
  if (error) return { ok: false, reason: `Could not restore quote: ${error.message}` };

  revalidateQuotePaths(id);
  return { ok: true };
});

export const permanentlyDeleteLead = mutation(async (id: string): Promise<MutationResult> => {
  const sb = createServiceRoleClient();
  const { data: row, error: readError } = await sb
    .from("quote_requests")
    .select("deleted_at")
    .eq("id", id)
    .maybeSingle<{ deleted_at: string | null }>();
  if (readError) return { ok: false, reason: `Lookup failed: ${readError.message}` };
  if (!row) return { ok: false, reason: "Quote request not found." };
  if (row.deleted_at === null) {
    return { ok: false, reason: "Cannot permanently delete an active quote request. Move it to trash first." };
  }

  const { error } = await sb.from("quote_requests").delete().eq("id", id);
  if (error) return { ok: false, reason: `Could not permanently delete quote: ${error.message}` };

  revalidateQuotePaths();
  return { ok: true };
});

export const softDeleteLeads = mutation(async (ids: string[]): Promise<MutationResult> => {
  const uniq = dedupeIds(ids);
  if (uniq.length === 0) return { ok: false, reason: "No quote requests selected." };

  const sb = createServiceRoleClient();
  const now = new Date();
  const deleteAfter = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { error } = await sb
    .from("quote_requests")
    .update({ deleted_at: now.toISOString(), delete_after: deleteAfter.toISOString() })
    .in("id", uniq);
  if (error) return { ok: false, reason: `Bulk trash failed: ${error.message}` };

  revalidateQuotePaths();
  return { ok: true };
});

export const restoreLeads = mutation(async (ids: string[]): Promise<MutationResult> => {
  const uniq = dedupeIds(ids);
  if (uniq.length === 0) return { ok: false, reason: "No quote requests selected." };

  const sb = createServiceRoleClient();
  const { error } = await sb.from("quote_requests").update({ deleted_at: null, delete_after: null }).in("id", uniq);
  if (error) return { ok: false, reason: `Bulk restore failed: ${error.message}` };

  revalidateQuotePaths();
  return { ok: true };
});

export const permanentlyDeleteLeads = mutation(async (ids: string[]): Promise<MutationResult> => {
  const uniq = dedupeIds(ids);
  if (uniq.length === 0) return { ok: false, reason: "No quote requests selected." };

  const sb = createServiceRoleClient();
  const { data: rows, error: readError } = await sb
    .from("quote_requests")
    .select("id, deleted_at")
    .in("id", uniq)
    .returns<{ id: string; deleted_at: string | null }[]>();
  if (readError) return { ok: false, reason: `Lookup failed: ${readError.message}` };
  if (!rows || rows.length === 0) return { ok: false, reason: "No matching quote requests found." };

  const stillActive = rows.filter((r) => r.deleted_at === null);
  if (stillActive.length > 0) {
    return {
      ok: false,
      reason: `Cannot permanently delete: ${stillActive.length} of ${rows.length} selected row(s) are still active. Move them to trash first.`,
    };
  }

  const { error } = await sb.from("quote_requests").delete().in("id", uniq);
  if (error) return { ok: false, reason: `Bulk permanent delete failed: ${error.message}` };

  revalidateQuotePaths();
  return { ok: true };
});
