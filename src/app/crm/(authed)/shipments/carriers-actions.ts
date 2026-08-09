"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { mapCarrierRow, mapCarrierContactRow } from "./mappers";
import type {
  CarrierContactFields,
  CarrierFields,
  CrmCarrier,
  CrmCarrierContactRow,
  CrmCarrierRow,
  CrmCarrierWithContacts,
} from "./types";

/**
 * The org's carrier directory (crm_carriers + crm_carrier_contacts) —
 * independent of any one shipment. Assigning a carrier to a shipment just
 * sets crm_shipments.carrier_id; nothing here is snapshotted until a Rate
 * Confirmation is generated (rate-confirmation-actions.ts does the
 * snapshotting, at that moment only). Same write contract as the rest of the
 * CRM: requireCrmUser() + RLS-scoped client + session-stamped org_id.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

function carrierFieldsToRow(fields: Partial<CarrierFields>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const set = (key: keyof CarrierFields, column: string) => {
    if (key in fields) row[column] = fields[key];
  };
  set("name", "name");
  set("mcNumber", "mc_number");
  set("dotNumber", "dot_number");
  set("phone", "phone");
  set("email", "email");
  set("address", "address");
  set("city", "city");
  set("state", "state");
  set("zip", "zip");
  set("equipment", "equipment");
  set("status", "status");
  set("notes", "notes");
  return row;
}

export type CreateCarrierResult =
  | { ok: true; id: string; carrier: CrmCarrier }
  | { ok: false; error: string };

/** Create a carrier. status defaults to 'active' if not supplied. */
export async function createCarrier(fields: Partial<CarrierFields>): Promise<CreateCarrierResult> {
  const user = await requireCrmUser();
  const name = fields.name?.trim();
  if (!name) return { ok: false, error: "Carrier name is required." };

  const supabase = await createCrmServerClient();
  const row = carrierFieldsToRow(fields);
  row.name = name;

  const { data, error } = await supabase
    .from("crm_carriers")
    .insert({ org_id: user.orgId, ...row })
    .select("*")
    .single();

  if (error || !data) return { ok: false, error: "Could not save the carrier. Please try again." };

  revalidatePath("/crm/carriers");
  return { ok: true, id: data.id as string, carrier: mapCarrierRow(data as CrmCarrierRow) };
}

/** Update a carrier — only keys present on `fields` are written. */
export async function updateCarrier(
  id: string,
  fields: Partial<CarrierFields>,
): Promise<ActionResult> {
  await requireCrmUser();
  if ("name" in fields && !fields.name?.trim()) {
    return { ok: false, error: "Carrier name is required." };
  }

  const supabase = await createCrmServerClient();
  const row = carrierFieldsToRow(fields);
  if (Object.keys(row).length === 0) return { ok: true };

  const { error } = await supabase.from("crm_carriers").update(row).eq("id", id);
  if (error) return { ok: false, error: "Could not update the carrier. Please try again." };

  revalidatePath("/crm/carriers");
  revalidatePath(`/crm/carriers/${id}`);
  return { ok: true };
}

/** Search the carrier directory by name, MC, or DOT — for the "assign
 * carrier" picker on a shipment. Empty query returns the org's first 20
 * carriers alphabetically. Excludes soft-deleted; includes inactive ones
 * (status is informational, not a filter here). */
export async function listCarriers(query = ""): Promise<CrmCarrier[]> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const trimmed = query.trim();
  let q = supabase
    .from("crm_carriers")
    .select("*")
    .eq("org_id", user.orgId)
    .is("deleted_at", null)
    .order("name")
    .limit(20);
  if (trimmed) {
    q = q.or(`name.ilike.%${trimmed}%,mc_number.ilike.%${trimmed}%,dot_number.ilike.%${trimmed}%`);
  }

  const { data } = await q;
  return ((data ?? []) as CrmCarrierRow[]).map(mapCarrierRow);
}

/** Full carrier read (with contacts), for a carrier detail screen. */
export async function getCarrier(id: string): Promise<CrmCarrierWithContacts | null> {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const [{ data: carrierRow }, { data: contactRows }] = await Promise.all([
    supabase.from("crm_carriers").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase
      .from("crm_carrier_contacts")
      .select("*")
      .eq("carrier_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
  ]);
  if (!carrierRow) return null;

  return {
    ...mapCarrierRow(carrierRow as CrmCarrierRow),
    contacts: ((contactRows ?? []) as CrmCarrierContactRow[]).map(mapCarrierContactRow),
  };
}

/** Add a contact to a carrier. */
export async function createCarrierContact(
  carrierId: string,
  fields: Partial<CarrierContactFields>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data, error } = await supabase
    .from("crm_carrier_contacts")
    .insert({
      org_id: user.orgId,
      carrier_id: carrierId,
      name: fields.name ?? null,
      phone: fields.phone ?? null,
      email: fields.email ?? null,
      role: fields.role ?? null,
      notes: fields.notes ?? null,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: "Could not save the contact. Please try again." };

  revalidatePath(`/crm/carriers/${carrierId}`);
  return { ok: true, id: data.id as string };
}

/** Soft-delete a carrier. Any org member may delete — a carrier is
 * operational, not a shared-record type that needs an owner gate. */
export async function softDeleteCarrier(id: string): Promise<ActionResult> {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { error } = await supabase
    .from("crm_carriers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: "Could not delete the carrier." };

  revalidatePath("/crm/carriers");
  return { ok: true };
}
