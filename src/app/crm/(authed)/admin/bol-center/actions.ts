"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";

/**
 * BOL Center (/crm/admin/bol-center) — a researched-BOL-profile funnel,
 * mirroring admin/otr/actions.ts exactly (see that file's header comment and
 * the crm_bol_entries migration). Every write here is admin-only,
 * independently re-verified (never trusts the page gate alone) — same
 * pattern as every other crm/admin/**\/actions.ts file.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };
export type BolStatus = "new" | "researching" | "ready_for_approval" | "released" | "rejected";

async function requireAdminUser() {
  const user = await requireCrmUser();
  if (user.role !== "owner") throw new Error("Only an admin can manage BOL entries.");
  return user;
}

function revalidateBol() {
  revalidatePath("/crm/admin/bol-center");
  revalidatePath("/crm/admin");
}

function trimmedOrNull(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

export async function addBolEntry(formData: FormData): Promise<ActionResult> {
  const user = await requireAdminUser();
  const bolNumber = trimmedOrNull(formData, "bol_number");
  const carrier = trimmedOrNull(formData, "carrier");
  const shipperName = trimmedOrNull(formData, "shipper_name");
  if (!bolNumber && !shipperName) {
    return { ok: false, error: "Enter at least a BOL number or shipper name." };
  }

  const supabase = await createCrmServerClient();
  const { error } = await supabase.from("crm_bol_entries").insert({
    org_id: user.orgId,
    bol_number: bolNumber,
    carrier,
    shipper_name: shipperName,
    shipper_address: trimmedOrNull(formData, "shipper_address"),
    consignee_name: trimmedOrNull(formData, "consignee_name"),
    consignee_address: trimmedOrNull(formData, "consignee_address"),
    bill_to: trimmedOrNull(formData, "bill_to"),
    commodity: trimmedOrNull(formData, "commodity"),
    weight: trimmedOrNull(formData, "weight"),
    pickup_date: trimmedOrNull(formData, "pickup_date"),
    delivery_date: trimmedOrNull(formData, "delivery_date"),
    reference: trimmedOrNull(formData, "reference"),
    notes: trimmedOrNull(formData, "notes"),
    status: "new",
    requested_by_user_id: user.id,
  });

  if (error) return { ok: false, error: "Could not save the BOL entry. Please try again." };

  revalidateBol();
  return { ok: true };
}

export async function saveBolNotes(id: string, notes: string): Promise<ActionResult> {
  await requireAdminUser();
  const supabase = await createCrmServerClient();
  const { error } = await supabase
    .from("crm_bol_entries")
    .update({ notes: notes || null })
    .eq("id", id);

  if (error) return { ok: false, error: "Could not save notes." };
  revalidateBol();
  return { ok: true };
}

export async function setBolStatus(id: string, status: BolStatus): Promise<ActionResult> {
  const user = await requireAdminUser();
  const supabase = await createCrmServerClient();
  const update: Record<string, unknown> = { status };
  if (status === "released") {
    update.released_at = new Date().toISOString();
    update.released_by_user_id = user.id;
  }

  const { error } = await supabase.from("crm_bol_entries").update(update).eq("id", id);

  if (error) return { ok: false, error: "Could not update status." };
  revalidateBol();
  return { ok: true };
}
