"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { blockedByDemo } from "@/lib/admin/demo";
import { lookupZip } from "@/lib/dispatch/distance";

/** Rapid broker-from-load-board capture. */

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function numOrNull(fd: FormData, key: string): number | null {
  const s = str(fd, key);
  if (s == null) return null;
  const n = Number(s.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export type QuickAddResult =
  | { ok: true; brokerId: string }
  | { ok: false; reason: string };

/**
 * Capture a broker + dispatcher + posted lane in one shot:
 *  - Broker (name / MC / DOT) upserts into brokers (matched on name_key).
 *  - Dispatcher (name / email / phone) becomes a broker_contact (deduped on
 *    phone or email) — never the broker's own main line.
 *  - Origin / destination becomes a broker_lanes row (deduped per lane), which
 *    is what lets Backhaul surface this broker when you're empty nearby.
 * broker_lanes is separate from booked loads, so none of this touches P&L.
 */
export async function quickAddBrokerLane(
  formData: FormData,
): Promise<QuickAddResult> {
  // DEMO: no-op before any DB write.
  if (await blockedByDemo()) {
    return { ok: false, reason: "Demo mode — changes aren't saved." };
  }
  const name = str(formData, "broker_name");
  if (!name) return { ok: false, reason: "Broker name is required." };

  const sb = createServiceRoleClient();
  const key = name.toLowerCase();
  const mc = str(formData, "mc_number");
  const dot = str(formData, "dot_number");

  const { data: existing } = await sb
    .from("brokers")
    .select("id, mc_number, dot_number")
    .eq("name_key", key)
    .is("deleted_at", null)
    .maybeSingle<{
      id: string;
      mc_number: string | null;
      dot_number: string | null;
    }>();

  let brokerId = existing?.id ?? null;
  if (brokerId) {
    const patch: Record<string, string> = {};
    if (mc && !existing!.mc_number) patch.mc_number = mc;
    if (dot && !existing!.dot_number) patch.dot_number = dot;
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

  // Dispatcher -> broker contact (dedup by phone/email).
  const dispatcher = str(formData, "dispatcher_name");
  const email = str(formData, "email");
  const phone = str(formData, "phone");
  if (email || phone) {
    const { data: cRows } = await sb
      .from("broker_contacts")
      .select("phone, email")
      .eq("broker_id", brokerId)
      .is("deleted_at", null);
    const existingC = (cRows ?? []) as {
      phone: string | null;
      email: string | null;
    }[];
    const digits = (s: string | null) => (s ?? "").replace(/\D/g, "");
    const lower = (s: string | null) => (s ?? "").trim().toLowerCase();
    const dupe = existingC.some(
      (r) =>
        (!!phone && digits(r.phone) !== "" && digits(r.phone) === digits(phone)) ||
        (!!email && lower(r.email) !== "" && lower(r.email) === lower(email)),
    );
    if (!dupe) {
      const phones = phone ? [{ number: phone, ext: null, label: null }] : [];
      const emails = email ? [{ address: email, label: null }] : [];
      await sb.from("broker_contacts").insert({
        broker_id: brokerId,
        name: dispatcher ?? "Dispatcher",
        title: "Dispatcher",
        phone: phone ?? null,
        email: email ?? null,
        phones,
        emails,
      });
    }
  }

  // Posted lane -> broker_lanes (dedup per broker + origin + dest).
  const originZip = str(formData, "origin_zip");
  const destZip = str(formData, "dest_zip");
  const rate = numOrNull(formData, "rate");
  if (originZip || destZip) {
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
      const patch: Record<string, unknown> = {
        last_seen_at: new Date().toISOString(),
      };
      if (rate !== null) patch.rate = rate;
      await sb.from("broker_lanes").update(patch).eq("id", match.id);
    } else {
      await sb.from("broker_lanes").insert({
        broker_id: brokerId,
        origin_zip: originZip,
        origin_city: o?.city ?? null,
        origin_state: o?.state ?? null,
        dest_zip: destZip,
        dest_city: d?.city ?? null,
        dest_state: d?.state ?? null,
        rate,
        source: "load_board",
      });
    }
  }

  revalidatePath("/admin/dispatch/brokers");
  revalidatePath(`/admin/dispatch/brokers/${brokerId}`);
  return { ok: true, brokerId };
}
