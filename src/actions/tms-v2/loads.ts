"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { lookupZip, estimateLaneMiles } from "@/lib/dispatch/distance";
import { mutation, type MutationResult } from "@/lib/demo/mutation";
import { findBrokerByNormalizedName } from "@/lib/domain/broker";

/**
 * Loads writes — the reference implementation of the mutation() pattern
 * (src/lib/demo/mutation.ts). Field set and broker/trip resolve-or-create
 * semantics mirror V1's src/app/admin/(authed)/dispatch/loads/actions.ts
 * (same `name_key`-deduped broker/trip lookup, same soft-delete convention
 * via `deleted_at`, same zeroed legacy columns on insert) so a load written
 * here reads identically in /admin. Brent's Add Load form rebuild ported
 * V1's FMCSA MC/DOT lookup (resolveBrokerId's `identity` param backfills
 * MC/DOT/main-phone onto the broker record) and dispatcher-contact capture
 * (addBrokerContactFromLoad, saved onto broker_contacts, not the broker's
 * own main line) into this same pipeline rather than forking a second
 * write path — LoadFormModal.tsx just sends more fields now. Status
 * changes are still NOT part of Add/Edit here — they're their own
 * dedicated actions below (markLoadDelivered / markLoadTonu /
 * editLoadOdometer) so a load's status always changes through the one
 * flow that also captures its odometer reading, never as a side effect of
 * an unrelated field edit — V1's Add form lets you set an initial status
 * too, deliberately not ported here to avoid re-opening that boundary.
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

type BrokerCandidateRow = { id: string; name: string; mc_number: string | null; dot_number: string | null; phone: string | null };

/** Find a broker by normalized name, creating it if it doesn't exist yet —
 * same name_key dedupe V1 uses, so a broker typed here and one typed in
 * /admin resolve to the same record. `identity` (from V1's FMCSA MC/DOT
 * lookup on the Add Load form) backfills MC/DOT/main-phone onto an
 * existing broker record that's missing them, or seeds them on a new one
 * — ported from V1's resolveBrokerId (admin/dispatch/loads/actions.ts),
 * never overwriting a value the broker record already has.
 *
 * Two-tier match (audit fix, 2026-08-08): first the fast exact indexed
 * name_key lookup (unchanged — still the common case, a broker typed the
 * same way twice); if that misses, a second pass fetches the active
 * broker set and compares via normalizeBrokerName() (lib/domain/broker.ts)
 * so "C.H. Robinson" typed on one load and "CH Robinson" on another
 * resolve to the same broker instead of quietly creating a duplicate. */
async function resolveBrokerId(
  sb: Sb,
  name: string,
  identity?: { mc?: string | null; dot?: string | null; phone?: string | null },
): Promise<string> {
  const key = name.trim().toLowerCase();
  const c = identity ?? {};

  async function backfillAndReturn(existing: BrokerCandidateRow): Promise<string> {
    const patch: Record<string, string> = {};
    if (c.mc && !existing.mc_number) patch.mc_number = c.mc;
    if (c.dot && !existing.dot_number) patch.dot_number = c.dot;
    if (c.phone && !existing.phone) patch.phone = c.phone;
    if (Object.keys(patch).length > 0) await sb.from("brokers").update(patch).eq("id", existing.id);
    return existing.id;
  }

  const { data: existing } = await sb
    .from("brokers")
    .select("id, name, mc_number, dot_number, phone")
    .eq("name_key", key)
    .is("deleted_at", null)
    .maybeSingle<BrokerCandidateRow>();
  if (existing?.id) return backfillAndReturn(existing);

  const { data: candidates } = await sb
    .from("brokers")
    .select("id, name, mc_number, dot_number, phone")
    .is("deleted_at", null)
    .limit(1000)
    .returns<BrokerCandidateRow[]>();
  const fuzzyMatch = findBrokerByNormalizedName(candidates ?? [], name);
  if (fuzzyMatch) return backfillAndReturn(fuzzyMatch);

  const { data: created, error } = await sb
    .from("brokers")
    .insert({ name: name.trim(), mc_number: c.mc ?? null, dot_number: c.dot ?? null, phone: c.phone ?? null })
    .select("id")
    .single<{ id: string }>();
  if (error || !created) throw new Error(`Could not resolve broker: ${error?.message ?? "unknown error"}`);
  return created.id;
}

/** Record the dispatcher captured on the Add Load form as a contact under
 * the broker (broker_contacts), rather than overwriting the broker's main
 * line — ported from V1's addBrokerContactFromLoad. Skips creation when a
 * contact with the same phone or email already exists for this broker, so
 * repeat loads for the same dispatcher don't pile up duplicates. */
async function addBrokerContactFromLoad(
  sb: Sb,
  brokerId: string,
  c: { name: string | null; email: string | null; phone: string | null },
): Promise<void> {
  const { phone, email } = c;
  if (!phone && !email) return;

  const { data } = await sb
    .from("broker_contacts")
    .select("phone, email")
    .eq("broker_id", brokerId)
    .is("deleted_at", null)
    .returns<{ phone: string | null; email: string | null }[]>();
  const existing = data ?? [];

  const digits = (s: string | null) => (s ?? "").replace(/\D/g, "");
  const lower = (s: string | null) => (s ?? "").trim().toLowerCase();
  const isDupe = existing.some(
    (r) =>
      (!!phone && digits(r.phone) !== "" && digits(r.phone) === digits(phone)) ||
      (!!email && lower(r.email) !== "" && lower(r.email) === lower(email)),
  );
  if (isDupe) return;

  const phones = phone ? [{ number: phone, ext: null, label: null }] : [];
  const emails = email ? [{ address: email, label: null }] : [];
  await sb.from("broker_contacts").insert({
    broker_id: brokerId,
    name: c.name ?? "Dispatcher",
    phone: phone ?? null,
    email: email ?? null,
    phones,
    emails,
  });
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
  const loadNumber = str(formData, "load_number");
  if (!loadNumber) return { ok: false, reason: "Load # is required." };

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

  const brokerId = await resolveBrokerId(sb, brokerName, {
    mc: str(formData, "broker_mc"),
    dot: str(formData, "broker_dot"),
    phone: str(formData, "broker_main_phone"),
  });
  // The phone/email on the load form are a dispatcher AT the broker — store
  // as a broker contact, never the broker's own main line (matches V1).
  await addBrokerContactFromLoad(sb, brokerId, {
    name: str(formData, "broker_contact_name"),
    email: str(formData, "broker_email"),
    phone: str(formData, "broker_phone"),
  });

  const tripName = str(formData, "trip_name");
  const tripId = tripName ? await resolveTripId(sb, tripName) : null;

  return {
    ok: true,
    fields: {
      load_number: loadNumber,
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

/** Restore load / Undo TONU — the one un-cancel path in tms-v2 (legacy's
 * only escape was the edit-modal's raw status <select>, which overwrote
 * status directly and never cleared tonu_amount — a real latent bug there,
 * not repeated here). Re-derives status from odometer readings using the
 * exact same rule editLoadOdometer/legacy's updateLoadOdometers already
 * use (highest stage with a reading wins, default "pending"), and clears
 * tonu_amount since it no longer applies once the load is active again. */
export const undoLoadTonu = mutation(async (id: string): Promise<MutationResult> => {
  const sb = createServiceRoleClient();
  const { data: cur } = await sb
    .from("loads")
    .select("odo_assigned, odo_loaded, odo_delivered, status")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<{ odo_assigned: number | null; odo_loaded: number | null; odo_delivered: number | null; status: string }>();
  if (!cur) return { ok: false, reason: "Load not found." };
  if (cur.status !== "tonu") return { ok: false, reason: "This load isn't TONU'd." };

  const derivedStatus =
    cur.odo_delivered != null ? "delivered" : cur.odo_loaded != null ? "loaded" : cur.odo_assigned != null ? "assigned" : "pending";

  const { error } = await sb
    .from("loads")
    .update({ status: derivedStatus, tonu_amount: null })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { ok: false, reason: `Could not restore load: ${error.message}` };

  revalidateLoadPaths(id);
  return { ok: true };
});

function revalidateArPaths(id: string) {
  revalidateLoadPaths(id);
  revalidatePath("/tms-v2/receivables");
}

/** Flip a load's payment_status to "paid" and stamp paid_at — the AR-Paid
 * transition (audit's #1 finding: legacy's markLoadPaid ported to the
 * MutationResult pattern, same fields/table). */
export const markLoadPaid = mutation(async (id: string): Promise<MutationResult> => {
  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("loads")
    .update({ payment_status: "paid", paid_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { ok: false, reason: `Could not mark paid: ${error.message}` };

  revalidateArPaths(id);
  return { ok: true };
});

/** Undo a mark-paid — the reversible half of the AR-Paid transition. */
export const markLoadUnpaid = mutation(async (id: string): Promise<MutationResult> => {
  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("loads")
    .update({ payment_status: "unpaid", paid_at: null })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { ok: false, reason: `Could not undo paid: ${error.message}` };

  revalidateArPaths(id);
  return { ok: true };
});

/** Soft-delete a load — same `deleted_at` convention every other tms-v2
 * entity uses. Redirects back to the Load Board on success, matching V1's
 * deleteLoad (there's nowhere useful to stay once the load is gone). */
export const deleteLoad = mutation(async (id: string): Promise<MutationResult> => {
  const sb = createServiceRoleClient();
  const { error } = await sb.from("loads").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, reason: `Could not delete load: ${error.message}` };

  revalidateLoadPaths(id);
  return { ok: true };
});

/** Bulk delete — the Load Board's select-mode "Delete" action (legacy's
 * softDeleteLoads, admin/dispatch/loads/actions.ts), ported to
 * mutation()/ids:string[] like every other tms-v2 bulk action this
 * session. Soft-delete only, same as the singular deleteLoad — recoverable
 * via ArchivedLoadsSection. */
export const bulkDeleteLoads = mutation(async (ids: string[]): Promise<MutationResult> => {
  const uniq = Array.from(new Set(ids.filter((s) => s.length > 0)));
  if (uniq.length === 0) return { ok: false, reason: "No loads selected." };

  const sb = createServiceRoleClient();
  const { error } = await sb.from("loads").update({ deleted_at: new Date().toISOString() }).in("id", uniq);
  if (error) return { ok: false, reason: `Could not delete loads: ${error.message}` };

  revalidateLoadPaths();
  return { ok: true };
});

/** Restore a soft-deleted load — a genuinely new capability (Phase 6 item
 * 4): no restore path for loads exists anywhere in the repo, /admin
 * included, same gap the audit found for brokers before restoreBroker
 * closed it. Mirrors that same deleted_at-to-null pattern. */
export const restoreLoad = mutation(async (id: string): Promise<MutationResult> => {
  const sb = createServiceRoleClient();
  const { error } = await sb.from("loads").update({ deleted_at: null }).eq("id", id);
  if (error) return { ok: false, reason: `Could not restore load: ${error.message}` };

  revalidateLoadPaths(id);
  return { ok: true };
});

/** Add a manual per-load expense (toll, lumper, etc). Category autofills
 * from prior entries on the client — this just persists whatever was typed. */
export const addLoadExpense = mutation(async (loadId: string, formData: FormData): Promise<MutationResult> => {
  const category = str(formData, "category");
  const amount = numOrNull(formData, "amount");
  if (!category) return { ok: false, reason: "Category is required." };
  if (amount == null || amount < 0) return { ok: false, reason: "Enter a valid amount." };

  const sb = createServiceRoleClient();
  const { error } = await sb.from("load_expenses").insert({
    load_id: loadId,
    category,
    amount,
    note: str(formData, "note"),
  });
  if (error) return { ok: false, reason: `Could not add expense: ${error.message}` };

  revalidateLoadPaths(loadId);
  revalidatePath("/tms-v2/trips");
  return { ok: true };
});

/** Soft-delete a per-load expense. */
export const deleteLoadExpense = mutation(async (expenseId: string, loadId: string): Promise<MutationResult> => {
  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("load_expenses")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", expenseId);
  if (error) return { ok: false, reason: `Could not delete expense: ${error.message}` };

  revalidateLoadPaths(loadId);
  revalidatePath("/tms-v2/trips");
  return { ok: true };
});
