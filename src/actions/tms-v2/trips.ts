"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { mutation, type MutationResult } from "@/lib/demo/mutation";

/**
 * Trip writes — same mutation() pattern as src/actions/tms-v2/loads.ts.
 * Field set and name_key-deduped create mirror V1's
 * src/app/admin/(authed)/dispatch/trips/actions.ts (same table, same
 * soft-delete convention), reimplemented (not imported) because V1's
 * versions throw instead of returning MutationResult — the one rule every
 * /tms-v2 action follows. Trip status stays derived by an explicit
 * close/reopen action, never a free-standing dropdown (Brent's directive).
 */

function revalidateTripPaths(id?: string) {
  revalidatePath("/tms-v2/trips");
  if (id) revalidatePath(`/tms-v2/trips/${id}`);
  revalidatePath("/tms-v2");
  revalidatePath("/tms-v2/loads");
  revalidatePath("/tms-v2/performance");
}

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function intOrNull(fd: FormData, key: string): number | null {
  const v = fd.get(key);
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Math.round(Number(v.replace(/[,]/g, "").trim()));
  return Number.isFinite(n) ? n : null;
}

/** A plain "YYYY-MM-DD" date input, stored as a UTC-midnight timestamp —
 * good enough for a trip's calendar-day period attribution; a trip doesn't
 * need wall-clock precision the way a load's pickup/delivery timing does. */
function dateOnlyIso(fd: FormData, key: string): string | null {
  const d = str(fd, key);
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return `${d}T00:00:00.000Z`;
}

export const createTrip = mutation(async (formData: FormData): Promise<MutationResult<{ id: string }>> => {
  const name = str(formData, "name");
  if (!name) return { ok: false, reason: "Name is required." };

  const sb = createServiceRoleClient();
  const key = name.toLowerCase();
  const { data: existing } = await sb
    .from("trips")
    .select("id")
    .eq("name_key", key)
    .is("deleted_at", null)
    .maybeSingle<{ id: string }>();
  if (existing?.id) {
    revalidateTripPaths(existing.id);
    return { ok: true, data: { id: existing.id } };
  }

  const { data: created, error } = await sb
    .from("trips")
    .insert({
      name,
      notes: str(formData, "notes"),
      started_at: dateOnlyIso(formData, "start_date") ?? new Date().toISOString(),
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !created) return { ok: false, reason: `Could not create trip: ${error?.message ?? "unknown error"}` };

  revalidateTripPaths(created.id);
  return { ok: true, data: { id: created.id } };
});

export const updateTrip = mutation(async (id: string, formData: FormData): Promise<MutationResult> => {
  const name = str(formData, "name");
  if (!name) return { ok: false, reason: "Name is required." };

  const sb = createServiceRoleClient();
  const startedAt = dateOnlyIso(formData, "start_date");
  const endedAt = dateOnlyIso(formData, "end_date");
  const patch: Record<string, string | null> = {
    name,
    notes: str(formData, "notes"),
    updated_at: new Date().toISOString(),
  };
  if (startedAt) patch.started_at = startedAt;
  if (endedAt) patch.ended_at = endedAt;

  const { error } = await sb.from("trips").update(patch).eq("id", id).is("deleted_at", null);
  if (error) return { ok: false, reason: `Could not save trip: ${error.message}` };

  revalidateTripPaths(id);
  return { ok: true };
});

/** Save the trip's start/end odometer bookends — drives PC miles/diesel
 * into the trip's net (audit record-trap #4/#5). */
export const updateTripOdometer = mutation(async (id: string, formData: FormData): Promise<MutationResult> => {
  const start = intOrNull(formData, "start_odometer");
  const end = intOrNull(formData, "end_odometer");
  if (start != null && end != null && end < start) {
    return { ok: false, reason: "End odometer can't be below start odometer." };
  }

  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("trips")
    .update({ start_odometer: start, end_odometer: end, updated_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { ok: false, reason: `Could not save odometer: ${error.message}` };

  revalidateTripPaths(id);
  return { ok: true };
});

/** Close a trip — stamps closed_at (and ended_at, if not already set). */
export const closeTrip = mutation(async (id: string): Promise<MutationResult> => {
  const sb = createServiceRoleClient();
  const { data: current } = await sb.from("trips").select("ended_at").eq("id", id).maybeSingle<{ ended_at: string | null }>();
  const now = new Date().toISOString();
  const { error } = await sb
    .from("trips")
    .update({ status: "closed", closed_at: now, ...(current?.ended_at ? {} : { ended_at: now }), updated_at: now })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { ok: false, reason: `Could not close trip: ${error.message}` };

  revalidateTripPaths(id);
  return { ok: true };
});

/** Reopen a closed trip — the reversible half of close. */
export const reopenTrip = mutation(async (id: string): Promise<MutationResult> => {
  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("trips")
    .update({ status: "active", closed_at: null, ended_at: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { ok: false, reason: `Could not reopen trip: ${error.message}` };

  revalidateTripPaths(id);
  return { ok: true };
});

/** Soft-delete a trip. Linked loads keep their trip_name text; trip_id is
 * cleared so they don't dangle on a deleted trip. */
export const deleteTrip = mutation(async (id: string): Promise<MutationResult> => {
  const sb = createServiceRoleClient();
  await sb.from("loads").update({ trip_id: null }).eq("trip_id", id);
  const { error } = await sb.from("trips").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, reason: `Could not delete trip: ${error.message}` };

  revalidateTripPaths(id);
  return { ok: true };
});
