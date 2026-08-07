"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { mutation, type MutationResult } from "@/lib/demo/mutation";

/**
 * "Farm a broker contact" — the empty-truck dashboard card's save action.
 * Mirrors legacy's farmBrokerContact (src/app/admin/(authed)/
 * farm-contact-actions.ts): upserts a broker (match by MC, then name),
 * a broker_contacts row (dedup by phone/email) flagged is_backhaul, and a
 * broker_lanes row. Reimplemented via mutation() rather than imported,
 * same reasoning as every other tms-v2 action ported from a throwing V1
 * original. Simplified from legacy: no FMCSA-driven ZIP city typeahead —
 * origin/destination are plain city + state text, no ZIP lookup/dedup by
 * ZIP. Disclosed simplification, not a schema change (broker_lanes.
 * origin_zip/dest_zip are already nullable — legacy itself falls back to
 * state-only with a null ZIP when a city doesn't match).
 */

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export const farmBrokerContact = mutation(async (formData: FormData): Promise<MutationResult<{ brokerId: string }>> => {
  const brokerName = str(formData, "broker_name");
  const contactName = str(formData, "contact_name");
  const name = brokerName ?? contactName;
  if (!name) return { ok: false, reason: "Search an MC, or enter a contact name, to save." };

  const sb = createServiceRoleClient();
  const mc = str(formData, "mc_number");
  const dot = str(formData, "dot_number");
  const nameKey = name.toLowerCase();

  type BrokerRow = { id: string; mc_number: string | null; dot_number: string | null };
  let existing: BrokerRow | null = null;
  if (mc) {
    const { data } = await sb.from("brokers").select("id, mc_number, dot_number").eq("mc_number", mc).is("deleted_at", null).maybeSingle<BrokerRow>();
    existing = data ?? null;
  }
  if (!existing) {
    const { data } = await sb.from("brokers").select("id, mc_number, dot_number").eq("name_key", nameKey).is("deleted_at", null).maybeSingle<BrokerRow>();
    existing = data ?? null;
  }

  let brokerId = existing?.id ?? null;
  if (brokerId && existing) {
    const patch: Record<string, string> = {};
    if (mc && !existing.mc_number) patch.mc_number = mc;
    if (dot && !existing.dot_number) patch.dot_number = dot;
    if (Object.keys(patch).length > 0) await sb.from("brokers").update(patch).eq("id", brokerId);
  } else {
    const { data: created, error } = await sb
      .from("brokers")
      .insert({ name, mc_number: mc, dot_number: dot, broker_type: "Brokerage" })
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error || !created) return { ok: false, reason: `Could not save broker: ${error?.message ?? "unknown error"}` };
    brokerId = created.id;
  }

  const isBackhaul = str(formData, "is_backhaul") === "true";
  const phone = str(formData, "contact_phone");
  const email = str(formData, "contact_email");
  if (phone || email || contactName) {
    const { data: cRows } = await sb
      .from("broker_contacts")
      .select("id, phone, email, is_backhaul")
      .eq("broker_id", brokerId)
      .is("deleted_at", null)
      .returns<{ id: string; phone: string | null; email: string | null; is_backhaul: boolean | null }[]>();
    const digits = (s: string | null) => (s ?? "").replace(/\D/g, "");
    const lower = (s: string | null) => (s ?? "").trim().toLowerCase();
    const dupe = (cRows ?? []).find(
      (r) =>
        (!!phone && digits(r.phone) !== "" && digits(r.phone) === digits(phone)) ||
        (!!email && lower(r.email) !== "" && lower(r.email) === lower(email)),
    );
    if (dupe) {
      if (isBackhaul && !dupe.is_backhaul) await sb.from("broker_contacts").update({ is_backhaul: true }).eq("id", dupe.id);
    } else {
      const phones = phone ? [{ number: phone, ext: null, label: null }] : [];
      const emails = email ? [{ address: email, label: null }] : [];
      await sb.from("broker_contacts").insert({
        broker_id: brokerId,
        name: contactName ?? "Dispatch",
        title: "Backhaul",
        phone,
        email,
        phones,
        emails,
        is_backhaul: isBackhaul,
      });
    }
  }

  const originCity = str(formData, "origin_city");
  const originState = str(formData, "origin_state");
  const destCity = str(formData, "dest_city");
  const destState = str(formData, "dest_state");
  if (originCity || originState || destCity || destState) {
    const { data: laneRows } = await sb
      .from("broker_lanes")
      .select("id, origin_city, origin_state, dest_city, dest_state")
      .eq("broker_id", brokerId)
      .is("deleted_at", null)
      .returns<{ id: string; origin_city: string | null; origin_state: string | null; dest_city: string | null; dest_state: string | null }[]>();
    const norm = (s: string | null) => (s ?? "").trim().toLowerCase();
    const match = (laneRows ?? []).find(
      (l) => norm(l.origin_city) === norm(originCity) && norm(l.origin_state) === norm(originState) && norm(l.dest_city) === norm(destCity) && norm(l.dest_state) === norm(destState),
    );
    if (match) {
      await sb.from("broker_lanes").update({ last_seen_at: new Date().toISOString() }).eq("id", match.id);
    } else {
      await sb.from("broker_lanes").insert({
        broker_id: brokerId,
        origin_city: originCity,
        origin_state: originState,
        dest_city: destCity,
        dest_state: destState,
        source: "load_board",
      });
    }
  }

  revalidatePath("/tms-v2");
  revalidatePath("/tms-v2/brokers");
  revalidatePath("/tms-v2/reach");
  revalidatePath(`/tms-v2/brokers/${brokerId}`);
  return { ok: true, data: { brokerId } };
});
