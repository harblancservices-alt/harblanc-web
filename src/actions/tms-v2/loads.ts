"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { lookupZip, estimateLaneMiles } from "@/lib/dispatch/distance";
import { mutation, type MutationResult } from "@/lib/demo/mutation";

/**
 * Loads writes — the reference implementation of the mutation() pattern
 * (src/lib/demo/mutation.ts). Field set and broker/trip resolve-or-create
 * semantics mirror V1's src/app/admin/(authed)/dispatch/loads/actions.ts
 * (same `name_key`-deduped broker/trip lookup, same soft-delete convention
 * via `deleted_at`, same zeroed legacy columns on insert) so a load written
 * here reads identically in /admin. Narrower than V1's form on purpose:
 * dispatcher-contact capture (broker_contacts) is a V1 add-load nuance, not
 * a load fact, and is left for a future Brokers-write phase; status changes
 * are NOT part of Add/Edit here — they're their own dedicated actions below
 * (markLoadDelivered / markLoadTonu / editLoadOdometer) so a load's status
 * always changes through the one flow that also captures its odometer
 * reading, never as a side effect of an unrelated field edit.
 */

function revalidateLoadPaths(id?: string) {
  revalidatePath("/tms-v2/loads");
  if (id) revalidatePath(`/tms-v2/loads/${id}`);
  revalidatePath("/tms-v2");
  revalidatePath("/tms-v2/brokers");
  revalidatePath("/tms-v2/trips");
  revalidatePath("/tms-v2/performance");
  revalidatePath("/tms-v2/receivables");
  revalidatePath("/tms-v2/calendar");
}

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

function intOrNull(fd: FormData, key: string): number | null {
  const n = numOrNull(fd, key);
  return n == null ? null : Math.round(n);
}

type Sb = ReturnType<typeof createServiceRoleClient>;

/** Find a broker by normalized name, creating it if it doesn't exist yet —
 * same name_key dedupe V1 uses, so a broker typed here and one typed in
 * /admin resolve to the same record. */
async function resolveBrokerId(sb: Sb, name: string): Promise<string> {
  const key = name.trim().toLowerCase();
  const { data: existing } = await sb
    .from("brokers")
    .select("id")
    .eq("name_key", key)
    .is("deleted_at", null)
    .maybeSingle<{ id: string }>();
  if (existing?.id) return existing.id;
  const { data: created, error } = await sb
    .from("brokers")
    .insert({ name: name.trim() })
    .select("id")
    .single<{ id: string }>();
  if (error || !created) throw new Error(`Could not resolve broker: ${error?.message ?? "unknown error"}`);
  return created.id;
}

/** Find a trip by normalized name, creating it (active) if it's new. */
async function resolveTripId(sb: Sb, name: string): Promise<string> {
  const key = name.trim().toLowerCase();
  const { data: existing } = await sb
    .from("trips")
    .select("id")
    .eq("name_key", key)
    .is("deleted_at", null)
    .maybeSingle<{ id: string }>();
  if (existing?.id) return existing.id;
  const { data: created, error } = await sb
    .from("trips")
    .insert({ name: name.trim() })
    .select("id")
    .single<{ id: string }>();
  if (error || !created) throw new Error(`Could not resolve trip: ${error?.message ?? "unknown error"}`);
  return created.id;
}

/** Shared Add/Edit field parsing — origin/dest ZIPs resolved to "City, ST"
 * and lane miles recomputed server-side (source of truth), broker/trip
 * resolved-or-created. Both createLoad and editLoad go through this so the
 * two forms can never drift apart. */
async function loadFieldsFromForm(
  sb: Sb,
  formData: FormData,
): Promise<{ ok: true; fields: Record<string, string | number | null> } | { ok: false; reason: string }> {
  const brokerName = str(formData, "broker_name");
  if (!brokerName) return { ok: false, reason: "Broker is required." };

  const rate = numOrNull(formData, "rate");
  if (rate == null || rate < 0) return { ok: false, reason: "Enter a valid rate." };

  const originZip = str(formData, "origin_zip");
  const destZip = str(formData, "dest_zip");
  if (!originZip || !destZip) return { ok: false, reason: "Origin and destination ZIP are required." };

  const oResolved = lookupZip(originZip);
  const dResolved = lookupZip(destZip);
  if (!oResolved) return { ok: false, reason: `Unknown origin ZIP: ${originZip}` };
  if (!dResolved) return { ok: false, reason: `Unknown destination ZIP: ${destZip}` };
  const originText = `${oResolved.city}, ${oResolved.state}`;
  const destText = `${dResolved.city}, ${dResolved.state}`;

  let loadedMiles = intOrNull(formData, "loaded_miles");
  const lane = estimateLaneMiles(originZip, destZip);
  if (lane.ok) loadedMiles = lane.miles;

  const brokerId = await resolveBrokerId(sb, brokerName);
  const tripName = str(formData, "trip_name");
  const tripId = tripName ? await resolveTripId(sb, tripName) : null;

  return {
    ok: true,
    fields: {
      load_number: str(formData, "load_number"),
      broker_name: brokerName,
      broker_id: brokerId,
      // HARBLANC runs hotshot only — equipment is fixed (matches V1).
      equipment: "Hotshot",
      origin: originText,
      destination: destText,
      origin_zip: originZip,
      dest_zip: destZip,
      pickup_date: str(formData, "pickup_date"),
      delivery_date: str(formData, "delivery_date"),
      trip_name: tripName,
      trip_id: tripId,
      rate,
      loaded_miles: loadedMiles,
    },
  };
}

export const addLoad = mutation(async (formData: FormData): Promise<MutationResult<{ id: string }>> => {
  const sb = createServiceRoleClient();
  const parsed = await loadFieldsFromForm(sb, formData);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  const { data, error } = await sb
    .from("loads")
    .insert({
      ...parsed.fields,
      status: "pending",
      deadhead_to_miles: 0,
      deadhead_from_miles: 0,
      fuel_cost: 0,
      factoring_fee: 0,
      misc_cost: 0,
      // A new load is A/R only once it's closed out — starts unpaid.
      payment_status: "unpaid",
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) return { ok: false, reason: `Could not add load: ${error?.message ?? "unknown error"}` };

  revalidateLoadPaths(data.id);
  return { ok: true, data: { id: data.id } };
});

export const editLoad = mutation(async (id: string, formData: FormData): Promise<MutationResult> => {
  const sb = createServiceRoleClient();
  const parsed = await loadFieldsFromForm(sb, formData);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  // Scope to live rows — a soft-deleted load matches 0 rows and no-ops
  // harmlessly rather than resurrecting it (same guard V1 uses).
  const { error } = await sb.from("loads").update(parsed.fields).eq("id", id).is("deleted_at", null);
  if (error) return { ok: false, reason: `Could not save load: ${error.message}` };

  revalidateLoadPaths(id);
  return { ok: true };
});

/** Stage labels for the odometer monotonicity message (ported from V1). */
const ODO_STAGES = ["Assigned", "Loaded", "Delivered"] as const;

function checkOdometerOrder(
  a: number | null,
  l: number | null,
  d: number | null,
): { ok: true } | { ok: false; reason: string } {
  const present = ([a, l, d] as const)
    .map((v, i) => ({ value: v, stage: ODO_STAGES[i] }))
    .filter((s): s is { value: number; stage: (typeof ODO_STAGES)[number] } => s.value != null);
  for (let i = 1; i < present.length; i++) {
    const prev = present[i - 1];
    const cur = present[i];
    if (cur.value < prev.value) {
      return {
        ok: false,
        reason: `${cur.stage} (${cur.value.toLocaleString("en-US")}) can't be below ${prev.stage} (${prev.value.toLocaleString("en-US")}) — the odometer only climbs.`,
      };
    }
  }
  return { ok: true };
}

/**
 * Edit a load's three odometer readings. Status is derived from the
 * highest stage with a reading (delivered → loaded → assigned → pending),
 * same rule V1's updateLoadOdometers uses — there's no separate status
 * dropdown here because the odometer readings ARE the load's progress. A
 * TONU'd load is left alone (use markLoadTonu to undo a cancel).
 */
export const editLoadOdometer = mutation(async (id: string, formData: FormData): Promise<MutationResult> => {
  const sb = createServiceRoleClient();
  const a = intOrNull(formData, "odo_assigned");
  const l = intOrNull(formData, "odo_loaded");
  const d = intOrNull(formData, "odo_delivered");

  const order = checkOdometerOrder(a, l, d);
  if (!order.ok) return { ok: false, reason: order.reason };

  const { data: cur } = await sb.from("loads").select("status").eq("id", id).is("deleted_at", null).maybeSingle<{ status: string }>();
  if (!cur) return { ok: false, reason: "Load not found." };

  const derivedStatus = d != null ? "delivered" : l != null ? "loaded" : a != null ? "assigned" : "pending";
  const patch: Record<string, string | number | null> = { odo_assigned: a, odo_loaded: l, odo_delivered: d };
  if (cur.status !== "tonu") patch.status = derivedStatus;

  const { error } = await sb.from("loads").update(patch).eq("id", id).is("deleted_at", null);
  if (error) return { ok: false, reason: `Could not save odometer: ${error.message}` };

  revalidateLoadPaths(id);
  revalidatePath("/tms-v2/maintenance");
  return { ok: true };
});

/** One-tap "this load delivered" — advances status and, if given, records
 * the delivery odometer (validated against any prior readings). */
export const markLoadDelivered = mutation(async (id: string, formData: FormData): Promise<MutationResult> => {
  const sb = createServiceRoleClient();
  const d = intOrNull(formData, "odo_delivered");

  const { data: cur } = await sb
    .from("loads")
    .select("odo_assigned, odo_loaded, status")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<{ odo_assigned: number | null; odo_loaded: number | null; status: string }>();
  if (!cur) return { ok: false, reason: "Load not found." };

  if (d != null) {
    const order = checkOdometerOrder(cur.odo_assigned, cur.odo_loaded, d);
    if (!order.ok) return { ok: false, reason: order.reason };
  }

  const patch: Record<string, string | number> = { status: "delivered" };
  if (d != null) patch.odo_delivered = d;

  const { error } = await sb.from("loads").update(patch).eq("id", id).is("deleted_at", null);
  if (error) return { ok: false, reason: `Could not mark delivered: ${error.message}` };

  revalidateLoadPaths(id);
  revalidatePath("/tms-v2/maintenance");
  return { ok: true };
});

/**
 * Cancel a load — status "tonu". A flat tonu_amount ($150 default) replaces
 * the rate as this load's revenue and no diesel/factoring/expenses are
 * deducted (the one TONU rule, lib/domain/money.ts's computeLoadNet).
 */
export const markLoadTonu = mutation(async (id: string, formData: FormData): Promise<MutationResult> => {
  const sb = createServiceRoleClient();
  const amount = numOrNull(formData, "tonu_amount");
  if (amount == null || amount < 0) return { ok: false, reason: "Enter a valid TONU amount." };

  const { error } = await sb
    .from("loads")
    .update({ status: "tonu", tonu_amount: amount })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { ok: false, reason: `Could not mark TONU: ${error.message}` };

  revalidateLoadPaths(id);
  return { ok: true };
});
