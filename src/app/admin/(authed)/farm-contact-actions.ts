"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { lookupZip } from "@/lib/dispatch/distance";

/**
 * Farm a broker contact off a load board into the contact list with a
 * zip-coded lane that feeds Backhaul. Same storage shapes as the existing
 * quick-add (brokers + broker_contacts + broker_lanes); this variant matches
 * the broker by MC first and flags the contact is_backhaul. Nothing here
 * touches loads / P&L.
 */

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export type FarmContactResult =
  | { ok: true; brokerId: string }
  | { ok: false; reason: string };

export async function farmBrokerContact(
  formData: FormData,
): Promise<FarmContactResult> {
  const name = str(formData, "broker_name");
  if (!name) return { ok: false, reason: "Broker name is required." };

  const sb = createServiceRoleClient();
  const mc = str(formData, "mc_number");
  const dot = str(formData, "dot_number");
  const nameKey = name.toLowerCase();

  type BrokerRow = {
    id: string;
    mc_number: string | null;
    dot_number: string | null;
  };

  // Match existing broker by MC first (the spec's "if the MC matches, attach"),
  // then fall back to name_key (how the rest of the app dedupes brokers).
  let existing: BrokerRow | null = null;
  if (mc) {
    const { data } = await sb
      .from("brokers")
      .select("id, mc_number, dot_number")
      .eq("mc_number", mc)
      .is("deleted_at", null)
      .maybeSingle<BrokerRow>();
    existing = data ?? null;
  }
  if (!existing) {
    const { data } = await sb
      .from("brokers")
      .select("id, mc_number, dot_number")
      .eq("name_key", nameKey)
      .is("deleted_at", null)
      .maybeSingle<BrokerRow>();
    existing = data ?? null;
  }

  let brokerId = existing?.id ?? null;
  if (brokerId && existing) {
    const patch: Record<string, string> = {};
    if (mc && !existing.mc_number) patch.mc_number = mc;
    if (dot && !existing.dot_number) patch.dot_number = dot;
    if (Object.keys(patch).length > 0) {
      await sb.from("brokers").update(patch).eq("id", brokerId);
    }
  } else {
    const { data: created, error } = await sb
      .from("brokers")
      .insert({ name, mc_number: mc, dot_number: dot, broker_type: "Brokerage" })
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error || !created) {
      return {
        ok: false,
        reason: `Could not save broker: ${error?.message ?? "unknown error"}`,
      };
    }
    brokerId = created.id;
  }

  // Contact → broker_contacts (dedup by phone/email), flagged is_backhaul per
  // the toggle. Phone lives on the contact, never the broker's main line —
  // same convention as the existing quick-add.
  const isBackhaul = str(formData, "is_backhaul") === "true";
  const phone = str(formData, "contact_phone");
  const email = str(formData, "contact_email");
  const contactName = str(formData, "contact_name") ?? "Dispatch";
  if (phone || email) {
    const { data: cRows } = await sb
      .from("broker_contacts")
      .select("id, phone, email, is_backhaul")
      .eq("broker_id", brokerId)
      .is("deleted_at", null);
    const existingC = (cRows ?? []) as {
      id: string;
      phone: string | null;
      email: string | null;
      is_backhaul: boolean | null;
    }[];
    const digits = (s: string | null) => (s ?? "").replace(/\D/g, "");
    const lower = (s: string | null) => (s ?? "").trim().toLowerCase();
    const dupe = existingC.find(
      (r) =>
        (!!phone && digits(r.phone) !== "" && digits(r.phone) === digits(phone)) ||
        (!!email && lower(r.email) !== "" && lower(r.email) === lower(email)),
    );
    if (dupe) {
      // Already on file — just make sure it's flagged for backhaul if asked.
      if (isBackhaul && !dupe.is_backhaul) {
        await sb
          .from("broker_contacts")
          .update({ is_backhaul: true })
          .eq("id", dupe.id);
      }
    } else {
      const phones = phone ? [{ number: phone, ext: null, label: null }] : [];
      const emails = email ? [{ address: email, label: null }] : [];
      await sb.from("broker_contacts").insert({
        broker_id: brokerId,
        name: contactName,
        title: "Backhaul",
        phone: phone ?? null,
        email: email ?? null,
        phones,
        emails,
        is_backhaul: isBackhaul,
      });
    }
  }

  // Lane → broker_lanes (dedup per broker + origin + dest). ZIP comes from the
  // city typeahead; when only a state was confirmed, the ZIP is null but the
  // state is still recorded.
  const originZip = str(formData, "origin_zip");
  const originCity = str(formData, "origin_city");
  const originState = str(formData, "origin_state");
  const destZip = str(formData, "dest_zip");
  const destCity = str(formData, "dest_city");
  const destState = str(formData, "dest_state");
  const hasOrigin = !!(originZip || originState);
  const hasDest = !!(destZip || destState);
  if (hasOrigin || hasDest) {
    const o = originZip ? lookupZip(originZip) : null;
    const d = destZip ? lookupZip(destZip) : null;
    const norm = (s: string | null) => (s ?? "").split("-")[0];
    const { data: laneRows } = await sb
      .from("broker_lanes")
      .select("id, origin_zip, dest_zip")
      .eq("broker_id", brokerId)
      .is("deleted_at", null);
    const lanes = (laneRows ?? []) as {
      id: string;
      origin_zip: string | null;
      dest_zip: string | null;
    }[];
    const match = lanes.find(
      (l) =>
        norm(l.origin_zip) === norm(originZip) &&
        norm(l.dest_zip) === norm(destZip),
    );
    if (match) {
      // Lane already on file — just refresh when it was last seen.
      await sb
        .from("broker_lanes")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", match.id);
    } else {
      await sb.from("broker_lanes").insert({
        broker_id: brokerId,
        origin_zip: originZip,
        origin_city: o?.city ?? originCity ?? null,
        origin_state: o?.state ?? originState ?? null,
        dest_zip: destZip,
        dest_city: d?.city ?? destCity ?? null,
        dest_state: d?.state ?? destState ?? null,
        source: "load_board",
      });
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/dispatch/brokers");
  revalidatePath("/admin/dispatch/backhaul");
  revalidatePath(`/admin/dispatch/brokers/${brokerId}`);
  return { ok: true, brokerId };
}
