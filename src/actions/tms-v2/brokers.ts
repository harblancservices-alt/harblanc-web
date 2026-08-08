"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { mutation, type MutationResult } from "@/lib/demo/mutation";
import { findBrokerByNormalizedName } from "@/lib/domain/broker";

/**
 * Broker writes — same mutation() pattern as src/actions/tms-v2/loads.ts.
 * Field set and name_key-deduped create mirror V1's
 * src/app/admin/(authed)/dispatch/brokers/actions.ts (same tables,
 * same soft-delete convention), reimplemented (not imported) since V1's
 * versions throw instead of returning MutationResult. `archive`/`restore`
 * are new here (audit §3 trap #7 — no restoreBroker existed anywhere in the
 * repo); everything else ports V1's exact fields.
 */

function revalidateBrokerPaths(id?: string) {
  revalidatePath("/tms-v2/brokers");
  if (id) revalidatePath(`/tms-v2/brokers/${id}`);
  revalidatePath("/tms-v2");
  revalidatePath("/tms-v2/loads");
}

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

export const createBroker = mutation(async (formData: FormData): Promise<MutationResult<{ id: string }>> => {
  const name = str(formData, "name");
  if (!name) return { ok: false, reason: "Name is required." };

  const sb = createServiceRoleClient();
  const key = name.toLowerCase();
  const { data: existing } = await sb
    .from("brokers")
    .select("id")
    .eq("name_key", key)
    .is("deleted_at", null)
    .maybeSingle<{ id: string }>();
  if (existing?.id) {
    revalidateBrokerPaths(existing.id);
    return { ok: true, data: { id: existing.id } };
  }

  // Exact name_key missed — fall back to a normalized-name match (audit
  // fix, 2026-08-08: "C.H. Robinson" vs "CH Robinson" would otherwise
  // create a duplicate here even though loads.ts's resolveBrokerId would
  // already treat them as the same broker) before deciding this is
  // genuinely a new company.
  const { data: candidates } = await sb
    .from("brokers")
    .select("id, name")
    .is("deleted_at", null)
    .limit(1000)
    .returns<{ id: string; name: string }[]>();
  const fuzzyMatch = findBrokerByNormalizedName(candidates ?? [], name);
  if (fuzzyMatch) {
    revalidateBrokerPaths(fuzzyMatch.id);
    return { ok: true, data: { id: fuzzyMatch.id } };
  }

  const { data: created, error } = await sb
    .from("brokers")
    .insert({
      name,
      mc_number: str(formData, "mc_number"),
      dot_number: str(formData, "dot_number"),
      phone: str(formData, "phone"),
      email: str(formData, "email"),
      factoring: bool(formData, "factoring"),
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !created) return { ok: false, reason: `Could not create broker: ${error?.message ?? "unknown error"}` };

  revalidateBrokerPaths(created.id);
  return { ok: true, data: { id: created.id } };
});

export const updateBroker = mutation(async (id: string, formData: FormData): Promise<MutationResult> => {
  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("brokers")
    .update({
      mc_number: str(formData, "mc_number"),
      dot_number: str(formData, "dot_number"),
      broker_type: str(formData, "broker_type"),
      status: str(formData, "status") ?? "active",
      factoring: bool(formData, "factoring"),
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
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { ok: false, reason: `Could not save broker: ${error.message}` };

  revalidateBrokerPaths(id);
  return { ok: true };
});

/** Soft-delete ("archive") a broker — loads keep their broker_name text. */
export const archiveBroker = mutation(async (id: string): Promise<MutationResult> => {
  const sb = createServiceRoleClient();
  const { error } = await sb.from("brokers").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, reason: `Could not archive broker: ${error.message}` };

  revalidateBrokerPaths(id);
  return { ok: true };
});

/** Restore a soft-deleted broker — the reversible half of archive, and a
 * genuinely new capability (the audit found no restore path anywhere in the
 * repo, legacy included, for any entity). */
export const restoreBroker = mutation(async (id: string): Promise<MutationResult> => {
  const sb = createServiceRoleClient();
  const { error } = await sb.from("brokers").update({ deleted_at: null }).eq("id", id);
  if (error) return { ok: false, reason: `Could not restore broker: ${error.message}` };

  revalidateBrokerPaths(id);
  return { ok: true };
});

export const addBrokerContact = mutation(async (brokerId: string, formData: FormData): Promise<MutationResult> => {
  const name = str(formData, "name");
  if (!name) return { ok: false, reason: "Name is required." };

  const sb = createServiceRoleClient();
  const phone = str(formData, "phone");
  const email = str(formData, "email");
  const { error } = await sb.from("broker_contacts").insert({
    broker_id: brokerId,
    name,
    title: str(formData, "title"),
    phone,
    email,
    phones: phone ? [{ number: phone, ext: null, label: null }] : [],
    emails: email ? [{ address: email, label: null }] : [],
    is_backhaul: bool(formData, "is_backhaul"),
  });
  if (error) return { ok: false, reason: `Could not add contact: ${error.message}` };

  revalidateBrokerPaths(brokerId);
  return { ok: true };
});

export const updateBrokerContact = mutation(async (contactId: string, brokerId: string, formData: FormData): Promise<MutationResult> => {
  const name = str(formData, "name");
  if (!name) return { ok: false, reason: "Name is required." };

  const sb = createServiceRoleClient();
  const phone = str(formData, "phone");
  const email = str(formData, "email");
  const { error } = await sb
    .from("broker_contacts")
    .update({
      name,
      title: str(formData, "title"),
      phone,
      email,
      phones: phone ? [{ number: phone, ext: null, label: null }] : [],
      emails: email ? [{ address: email, label: null }] : [],
      is_backhaul: bool(formData, "is_backhaul"),
    })
    .eq("id", contactId);
  if (error) return { ok: false, reason: `Could not save contact: ${error.message}` };

  revalidateBrokerPaths(brokerId);
  return { ok: true };
});

export const deleteBrokerContact = mutation(async (contactId: string, brokerId: string): Promise<MutationResult> => {
  const sb = createServiceRoleClient();
  const { error } = await sb.from("broker_contacts").update({ deleted_at: new Date().toISOString() }).eq("id", contactId);
  if (error) return { ok: false, reason: `Could not delete contact: ${error.message}` };

  revalidateBrokerPaths(brokerId);
  return { ok: true };
});
