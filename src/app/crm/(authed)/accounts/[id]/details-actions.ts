"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";

/**
 * Writes for the Details tab's expanded field groups (Company profile,
 * Freight profile, Context notes) — everything CompanyDialog's
 * core form doesn't already cover. Same contract as accounts/actions.ts:
 * requireCrmUser(), org-scoped RLS client, org_id/user_id only ever from the
 * session. Kept in its own file (new, not an addition to accounts/actions.ts)
 * so this expansion never has to touch the shared company create/edit path.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v.length ? v : null;
}
function optInt(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (!v.length) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}
function jsonArray(fd: FormData, key: string): unknown[] {
  const raw = fd.get(key);
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function textArray(fd: FormData, key: string): string[] {
  return jsonArray(fd, key).filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}
function lanesArray(fd: FormData, key: string): { origin: string; destination: string }[] {
  return jsonArray(fd, key)
    .filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null)
    .map((l) => ({
      origin: typeof l.origin === "string" ? l.origin.trim() : "",
      destination: typeof l.destination === "string" ? l.destination.trim() : "",
    }))
    .filter((l) => l.origin || l.destination);
}

async function applyUpdate(accountId: string, fields: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: account } = await supabase
    .from("crm_accounts")
    .select("id")
    .eq("id", accountId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!account) return { ok: false, error: "Company not found." };

  const { error } = await supabase.from("crm_accounts").update(fields).eq("id", accountId);
  if (error) return { ok: false, error: "Could not save. Please try again." };

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    kind: CRM_ACTIVITY.detailsUpdated,
    summary: "Company details updated",
  });

  revalidatePath(`/crm/accounts/${accountId}`);
  return { ok: true };
}

export async function updateCompanyProfile(accountId: string, formData: FormData): Promise<ActionResult> {
  return applyUpdate(accountId, {
    dba: optStr(formData, "dba"),
    linkedin_url: optStr(formData, "linkedin_url"),
    year_founded: optInt(formData, "year_founded"),
    ownership_type: optStr(formData, "ownership_type"),
  });
}

export async function updateFreightProfile(accountId: string, formData: FormData): Promise<ActionResult> {
  return applyUpdate(accountId, {
    equipment_needed: textArray(formData, "equipment_needed"),
    lanes: lanesArray(formData, "lanes"),
    volume_frequency: optStr(formData, "volume_frequency"),
    weight_range: optStr(formData, "weight_range"),
    special_requirements: textArray(formData, "special_requirements"),
  });
}

export async function updateContextNotes(accountId: string, formData: FormData): Promise<ActionResult> {
  return applyUpdate(accountId, {
    context_notes: optStr(formData, "context_notes"),
  });
}
