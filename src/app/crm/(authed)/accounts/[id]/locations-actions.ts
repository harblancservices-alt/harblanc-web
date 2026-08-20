"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";

/**
 * CRUD for crm_account_locations — the Details tab's "Locations & docks"
 * group. One or more facilities per company, each with its own address/
 * receiving hours/dock notes. Own file (new table, new concern) rather than
 * folded into accounts/actions.ts.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v.length ? v : null;
}

function locationFieldsFromForm(fd: FormData) {
  return {
    label: optStr(fd, "label"),
    address: optStr(fd, "address"),
    city: optStr(fd, "city"),
    state: optStr(fd, "state"),
    zip: optStr(fd, "zip"),
    receiving_hours: optStr(fd, "receiving_hours"),
    dock_notes: optStr(fd, "dock_notes"),
    contact_name: optStr(fd, "contact_name"),
    contact_phone: optStr(fd, "contact_phone"),
    contact_email: optStr(fd, "contact_email"),
    default_carrier_id: optStr(fd, "default_carrier_id"),
    default_carrier_contact_id: optStr(fd, "default_carrier_contact_id"),
  };
}

export async function createLocation(accountId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();
  const fields = locationFieldsFromForm(formData);

  const { data, error } = await supabase
    .from("crm_account_locations")
    .insert({ org_id: user.orgId, account_id: accountId, ...fields })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: "Could not save the location. Please try again." };

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    kind: CRM_ACTIVITY.locationAdded,
    summary: `Location added: ${fields.label || fields.address || "New location"}`,
  });

  revalidatePath(`/crm/accounts/${accountId}`);
  return { ok: true };
}

export async function updateLocation(
  locationId: string,
  accountId: string,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();
  const fields = locationFieldsFromForm(formData);

  const { error } = await supabase.from("crm_account_locations").update(fields).eq("id", locationId);
  if (error) return { ok: false, error: "Could not update the location. Please try again." };

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    kind: CRM_ACTIVITY.locationUpdated,
    summary: `Location updated: ${fields.label || fields.address || "Location"}`,
  });

  revalidatePath(`/crm/accounts/${accountId}`);
  return { ok: true };
}

export async function deleteLocation(locationId: string, accountId: string): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: prior } = await supabase
    .from("crm_account_locations")
    .select("label, address")
    .eq("id", locationId)
    .maybeSingle();

  const { error } = await supabase
    .from("crm_account_locations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", locationId);
  if (error) return { ok: false, error: "Could not delete the location." };

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    kind: CRM_ACTIVITY.locationDeleted,
    summary: `Location deleted: ${(prior?.label as string) || (prior?.address as string) || "Location"}`,
  });

  revalidatePath(`/crm/accounts/${accountId}`);
  return { ok: true };
}
