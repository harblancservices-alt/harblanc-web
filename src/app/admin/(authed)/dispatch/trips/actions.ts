"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { blockedByDemo } from "@/lib/admin/demo";
import { dateTimeInputsToIso } from "@/lib/dispatch/central-time";

/** Dispatch → Trips actions: create, update, open/close, delete. */

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * Start (required) + optional end timestamps from the New/Edit Trip form's
 * date+time input pairs, both read as Central wall-clock values. The end
 * side is only kept when the "Set end date & time" toggle was on AND it
 * actually lands after the start — the same rule TripDateTimeFields'
 * `tripDatesAreValid` blocks the submit on client-side, re-checked here so a
 * bypassed/JS-less submit can't silently store an inverted range.
 */
function tripDatesFromForm(fd: FormData): {
  started_at: string | null;
  ended_at: string | null;
} {
  const started_at = dateTimeInputsToIso(str(fd, "start_date"), str(fd, "start_time"));
  const hasEnd = fd.get("has_end") === "1";
  const endIso = hasEnd
    ? dateTimeInputsToIso(str(fd, "end_date"), str(fd, "end_time"))
    : null;
  const ended_at = endIso && started_at && endIso > started_at ? endIso : null;
  return { started_at, ended_at };
}

/**
 * Create a trip from the Trips page. Reuses an existing trip if the name
 * already exists (matched on the generated name_key) so it never duplicates;
 * either way the operator lands on the trip's page.
 */
export async function createTrip(formData: FormData): Promise<void> {
  if (await blockedByDemo()) redirect("/admin/dispatch/trips"); // DEMO: no-op.
  const name = str(formData, "name");
  if (!name) return;
  const sb = createServiceRoleClient();
  const key = name.toLowerCase();

  const { data: existing } = await sb
    .from("trips")
    .select("id")
    .eq("name_key", key)
    .is("deleted_at", null)
    .maybeSingle<{ id: string }>();

  let id = existing?.id ?? null;
  if (!id) {
    const { started_at, ended_at } = tripDatesFromForm(formData);
    const { data: created, error } = await sb
      .from("trips")
      .insert({
        name,
        notes: str(formData, "notes"),
        started_at,
        ended_at,
      })
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error) throw new Error(`Could not create trip: ${error.message}`);
    id = created?.id ?? null;
  }

  revalidatePath("/admin/dispatch/trips");
  if (id) redirect(`/admin/dispatch/trips/${id}`);
}

export async function updateTrip(
  id: string,
  formData: FormData,
): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  const sb = createServiceRoleClient();
  const name = str(formData, "name");
  if (!name) return;
  const status = str(formData, "status") ?? "active";
  const { started_at, ended_at } = tripDatesFromForm(formData);
  const { error } = await sb
    .from("trips")
    .update({
      name,
      status,
      notes: str(formData, "notes"),
      // started_at only overwrites when the form actually parsed one (it's
      // a required field, so this should always be the case) — never blank
      // out an existing start because of a malformed/JS-less submit.
      ...(started_at ? { started_at } : {}),
      ended_at,
      closed_at: status === "closed" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`Could not update trip: ${error.message}`);
  revalidatePath(`/admin/dispatch/trips/${id}`);
  revalidatePath("/admin/dispatch/trips");
}

/** Save the trip's start / end odometer bookends (used to close PC legs). */
export async function updateTripOdometer(
  id: string,
  formData: FormData,
): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  const sb = createServiceRoleClient();
  const toInt = (key: string): number | null => {
    const v = formData.get(key);
    if (typeof v !== "string" || v.trim() === "") return null;
    const n = Math.round(Number(v.replace(/[,]/g, "").trim()));
    return Number.isFinite(n) ? n : null;
  };
  const { error } = await sb
    .from("trips")
    .update({
      start_odometer: toInt("start_odometer"),
      end_odometer: toInt("end_odometer"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`Could not save odometer: ${error.message}`);
  revalidatePath(`/admin/dispatch/trips/${id}`);
}

/** Toggle a trip between active and closed. */
export async function setTripStatus(
  id: string,
  status: "active" | "closed",
): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("trips")
    .update({
      status,
      closed_at: status === "closed" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`Could not update trip: ${error.message}`);
  revalidatePath(`/admin/dispatch/trips/${id}`);
  revalidatePath("/admin/dispatch/trips");
}

/** Bulk soft-delete trips selected on the Trips list (multi-select). */
export async function softDeleteTrips(formData: FormData): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) return;
  const sb = createServiceRoleClient();
  await sb.from("loads").update({ trip_id: null }).in("trip_id", ids);
  const { error } = await sb
    .from("trips")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw new Error(`Could not delete trips: ${error.message}`);
  revalidatePath("/admin/dispatch/trips");
}

/** Soft-delete a trip. Linked loads keep their trip_name; trip_id is cleared. */
export async function deleteTrip(id: string): Promise<void> {
  if (await blockedByDemo()) redirect("/admin/dispatch/trips"); // DEMO: no-op.
  const sb = createServiceRoleClient();
  await sb.from("loads").update({ trip_id: null }).eq("trip_id", id);
  const { error } = await sb
    .from("trips")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Could not delete trip: ${error.message}`);
  revalidatePath("/admin/dispatch/trips");
  redirect("/admin/dispatch/trips");
}
