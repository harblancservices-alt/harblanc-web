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

/**
 * Fill ONE missing field from the dashboard's gaps panel, without leaving it.
 *
 * Reuses applyUpdate — the same single-field write path the profile's detail
 * groups use — rather than adding a write of its own. It deliberately does
 * NOT go through updateAccount: that requires a company name in the form
 * (a one-field save has none) and always clears needs_finalize, which would
 * mark a quick-added company "finished" because somebody set its industry.
 *
 * The column per gap kind is a map, so adding a kind later is one line here
 * and one in completeness.ts.
 *
 * Revalidates the DASHBOARD as well as the company, because that is where
 * this is called from and the row has to be gone when it settles.
 */
const GAP_COLUMN: Record<string, string> = {
  industry: "industry",
  address: "address",
  // Added 2026-08-26 for the company file's panel 04, which asks the same
  // question about two more columns. Both are real crm_accounts columns and
  // both are empty on all 99 companies today — see file/fileGaps.ts for why
  // they are asked on the company page and NOT added to the dashboard's
  // narrower list.
  carrier: "current_carrier",
  // 2026-08-31: `phone` and `website` joined the panel's ask-list and
  // `spend` left it (fileGaps.ts explains why). annual_freight_spend is
  // deliberately still mapped: the column is unchanged and All fields
  // still edits it — only the gap chip asking for it is gone, so a stale
  // client that posts the old kind still writes to the right place.
  phone: "phone",
  website: "website",
  spend: "annual_freight_spend",
};

/** Gaps whose column is numeric — the typed value has to become a number,
 * and a value that isn't one has to be refused rather than silently stored
 * as NaN or dropped by Postgres. */
const NUMERIC_GAPS = new Set(["spend"]);

export async function fillCompanyGap(
  accountId: string,
  kind: string,
  value: string,
): Promise<ActionResult> {
  const column = GAP_COLUMN[kind];
  if (!column) return { ok: false, error: "That gap can't be filled from here." };

  const trimmed = value.trim();
  if (!trimmed) return { ok: false, error: "Type something first." };

  let stored: string | number = trimmed;
  if (NUMERIC_GAPS.has(kind)) {
    // People type money the way they say it — "$250k", "250,000", "250000".
    // Strip the punctuation they use for readability, honour a trailing k/m,
    // and refuse anything that still isn't a number.
    const cleaned = trimmed.replace(/[$,\s]/g, "").toLowerCase();
    const scale = cleaned.endsWith("k") ? 1_000 : cleaned.endsWith("m") ? 1_000_000 : 1;
    const n = Number(scale === 1 ? cleaned : cleaned.slice(0, -1));
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: "Give that as a number — 250000, 250k or $250,000." };
    }
    stored = n * scale;
  }

  const result = await applyUpdate(accountId, { [column]: stored });
  if (result.ok) {
    revalidatePath("/crm");
    revalidatePath("/crm/tasks");
  }
  return result;
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

/** Set the full commodities list (crm_accounts.commodities, stored as a
 * comma-separated string) — the profile's inline "+ Add commodity" picker
 * and each chip's × both call this with the complete next list rather than
 * a single add/remove op, since the column has no dedicated join table. */
export async function setCommodities(accountId: string, commodities: string[]): Promise<ActionResult> {
  const cleaned = commodities.map((c) => c.trim()).filter(Boolean);
  return applyUpdate(accountId, {
    commodities: cleaned.length ? cleaned.join(", ") : null,
  });
}
