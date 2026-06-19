"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";

/** Broker portal actions: create, update profile/compliance, add a contact. */

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/** Checkbox → boolean (present/"on"/"true" → true). */
function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

/**
 * Create a broker directly from the Brokers directory (no load required).
 * Reuses the existing broker if the name already exists (matched on the
 * generated name_key), so this never makes a duplicate; either way the
 * operator lands on the broker's profile.
 */
export async function createBroker(formData: FormData): Promise<void> {
  const name = str(formData, "name");
  if (!name) return;
  const sb = createServiceRoleClient();
  const key = name.toLowerCase();

  const { data: existing } = await sb
    .from("brokers")
    .select("id")
    .eq("name_key", key)
    .is("deleted_at", null)
    .maybeSingle<{ id: string }>();

  let id = existing?.id ?? null;
  if (!id) {
    const { data: created, error } = await sb
      .from("brokers")
      .insert({
        name,
        mc_number: str(formData, "mc_number"),
        dot_number: str(formData, "dot_number"),
        broker_type: str(formData, "broker_type") ?? "Brokerage",
        phone: str(formData, "phone"),
        email: str(formData, "email"),
      })
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error) throw new Error(`Could not create broker: ${error.message}`);
    id = created?.id ?? null;
  }

  revalidatePath("/admin/dispatch/brokers");
  if (id) redirect(`/admin/dispatch/brokers/${id}`);
}

export async function updateBroker(
  id: string,
  formData: FormData,
): Promise<void> {
  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("brokers")
    .update({
      mc_number: str(formData, "mc_number"),
      dot_number: str(formData, "dot_number"),
      broker_type: str(formData, "broker_type") ?? "Brokerage",
      status: str(formData, "status") ?? "active",
      phone: str(formData, "phone"),
      email: str(formData, "email"),
      office: str(formData, "office"),
      timezone: str(formData, "timezone"),
      authority: str(formData, "authority"),
      insurance: str(formData, "insurance"),
      w9: str(formData, "w9"),
      ten99: str(formData, "ten99"),
      notes: str(formData, "notes"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`Could not update broker: ${error.message}`);
  revalidatePath(`/admin/dispatch/brokers/${id}`);
  revalidatePath("/admin/dispatch/brokers");
}

/** Soft-delete a broker (recoverable). Loads keep their broker_name text. */
export async function softDeleteBroker(id: string): Promise<void> {
  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("brokers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Could not delete broker: ${error.message}`);
  revalidatePath("/admin/dispatch/brokers");
  redirect("/admin/dispatch/brokers");
}

export type Phone = { number: string; ext: string | null; label: string | null };
export type Email = { address: string; label: string | null };

/** Zip parallel form arrays into phone/email objects, dropping blank rows. */
function parseMethods(formData: FormData): { phones: Phone[]; emails: Email[] } {
  const numbers = formData.getAll("phone_number").map((v) => String(v).trim());
  const exts = formData.getAll("phone_ext").map((v) => String(v).trim());
  const pLabels = formData.getAll("phone_label").map((v) => String(v).trim());
  const phones: Phone[] = numbers
    .map((number, i) => ({
      number,
      ext: exts[i] || null,
      label: pLabels[i] || null,
    }))
    .filter((p) => p.number.length > 0);

  const addresses = formData
    .getAll("email_address")
    .map((v) => String(v).trim());
  const eLabels = formData.getAll("email_label").map((v) => String(v).trim());
  const emails: Email[] = addresses
    .map((address, i) => ({ address, label: eLabels[i] || null }))
    .filter((e) => e.address.length > 0);

  return { phones, emails };
}

export async function addBrokerContact(
  brokerId: string,
  formData: FormData,
): Promise<void> {
  const sb = createServiceRoleClient();
  const name = str(formData, "name");
  if (!name) return;
  const { phones, emails } = parseMethods(formData);
  const { error } = await sb.from("broker_contacts").insert({
    broker_id: brokerId,
    name,
    title: str(formData, "title"),
    phone: phones[0]?.number ?? str(formData, "phone"),
    email: emails[0]?.address ?? str(formData, "email"),
    phones,
    emails,
    notes: str(formData, "notes"),
    is_backhaul: bool(formData, "is_backhaul"),
  });
  if (error) throw new Error(`Could not add contact: ${error.message}`);
  revalidatePath(`/admin/dispatch/brokers/${brokerId}`);
}

export async function updateBrokerContact(
  contactId: string,
  brokerId: string,
  formData: FormData,
): Promise<void> {
  const sb = createServiceRoleClient();
  const name = str(formData, "name");
  if (!name) return;
  const { phones, emails } = parseMethods(formData);
  const { error } = await sb
    .from("broker_contacts")
    .update({
      name,
      title: str(formData, "title"),
      phone: phones[0]?.number ?? null,
      email: emails[0]?.address ?? null,
      phones,
      emails,
      is_backhaul: bool(formData, "is_backhaul"),
    })
    .eq("id", contactId);
  if (error) throw new Error(`Could not update contact: ${error.message}`);
  revalidatePath(`/admin/dispatch/brokers/${brokerId}`);
}

export async function deleteBrokerContact(
  contactId: string,
  brokerId: string,
): Promise<void> {
  const sb = createServiceRoleClient();
  await sb
    .from("broker_contacts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", contactId);
  revalidatePath(`/admin/dispatch/brokers/${brokerId}`);
}
