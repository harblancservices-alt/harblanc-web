"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { lookupZip, estimateLaneMiles } from "@/lib/dispatch/distance";

/**
 * Dispatch → Load Board server actions. Insert a load and toggle its
 * payment status. Service-role client (admin-only, behind the authed shell).
 */

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

const STATUSES = new Set([
  "pending",
  "assigned",
  "loaded",
  "delivered",
  "cancelled",
]);

/** Which odometer column a stage transition records, if any. */
const STAGE_ODO_COLUMN: Record<string, "odo_assigned" | "odo_loaded" | "odo_delivered"> = {
  assigned: "odo_assigned",
  loaded: "odo_loaded",
  delivered: "odo_delivered",
};

/**
 * Find the broker by normalized name, creating it if it doesn't exist yet.
 * This is what makes "type a broker on a load and it shows up in the broker
 * directory" work — every distinct broker becomes a real record.
 */
async function resolveBrokerId(
  sb: ReturnType<typeof createServiceRoleClient>,
  name: string,
  mc?: string | null,
  dot?: string | null,
): Promise<string | null> {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  const { data: existing } = await sb
    .from("brokers")
    .select("id, mc_number, dot_number")
    .eq("name_key", key)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; mc_number: string | null; dot_number: string | null }>();
  if (existing?.id) {
    // Backfill MC/DOT if we now have it and the record was missing it.
    const patch: Record<string, string> = {};
    if (mc && !existing.mc_number) patch.mc_number = mc;
    if (dot && !existing.dot_number) patch.dot_number = dot;
    if (Object.keys(patch).length > 0) {
      await sb.from("brokers").update(patch).eq("id", existing.id);
    }
    return existing.id;
  }
  const { data: created } = await sb
    .from("brokers")
    .insert({ name: name.trim(), mc_number: mc ?? null, dot_number: dot ?? null })
    .select("id")
    .maybeSingle<{ id: string }>();
  return created?.id ?? null;
}

/** Find a trip by normalized name, creating it (active) if it's new. */
async function resolveTripId(
  sb: ReturnType<typeof createServiceRoleClient>,
  name: string,
): Promise<string | null> {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  const { data: existing } = await sb
    .from("trips")
    .select("id")
    .eq("name_key", key)
    .is("deleted_at", null)
    .maybeSingle<{ id: string }>();
  if (existing?.id) return existing.id;
  const { data: created } = await sb
    .from("trips")
    .insert({ name: name.trim() })
    .select("id")
    .maybeSingle<{ id: string }>();
  return created?.id ?? null;
}

export async function createLoad(formData: FormData): Promise<void> {
  const sb = createServiceRoleClient();

  const statusRaw = str(formData, "status") ?? "pending";
  const status = STATUSES.has(statusRaw) ? statusRaw : "pending";

  const brokerName = str(formData, "broker_name");
  const brokerId = brokerName
    ? await resolveBrokerId(
        sb,
        brokerName,
        str(formData, "broker_mc"),
        str(formData, "broker_dot"),
      )
    : null;

  const tripName = str(formData, "trip_name");
  const tripId = tripName ? await resolveTripId(sb, tripName) : null;

  // Origin / destination come in as ZIP codes; resolve to "City, ST" and the
  // lane's driving miles server-side (source of truth). Fall back to the raw
  // ZIP text if a ZIP doesn't resolve.
  const originZip = str(formData, "origin_zip");
  const destZip = str(formData, "dest_zip");
  const oResolved = originZip ? lookupZip(originZip) : null;
  const dResolved = destZip ? lookupZip(destZip) : null;
  const originText = oResolved
    ? `${oResolved.city}, ${oResolved.state}`
    : originZip;
  const destText = dResolved ? `${dResolved.city}, ${dResolved.state}` : destZip;

  let loadedMiles = intOrNull(formData, "loaded_miles");
  if (originZip && destZip) {
    const lane = estimateLaneMiles(originZip, destZip);
    if (lane.ok) loadedMiles = lane.miles;
  }

  const { error } = await sb.from("loads").insert({
    load_number: str(formData, "load_number"),
    broker_name: brokerName,
    broker_id: brokerId,
    // HARBLANC runs hotshot only - equipment is fixed.
    equipment: "Hotshot",
    origin: originText,
    destination: destText,
    origin_zip: originZip,
    dest_zip: destZip,
    pickup_date: str(formData, "pickup_date"),
    delivery_date: str(formData, "delivery_date"),
    trip_name: tripName,
    trip_id: tripId,
    rate: numOrNull(formData, "rate") ?? 0,
    loaded_miles: loadedMiles,
    deadhead_to_miles: 0,
    deadhead_from_miles: 0,
    fuel_cost: 0,
    factoring_fee: 0,
    misc_cost: 0,
    status,
    // A delivered load defaults to unpaid (it becomes A/R until marked paid).
    payment_status: "unpaid",
  });

  if (error) {
    throw new Error(`Could not add load: ${error.message}`);
  }

  revalidatePath("/admin/dispatch/loads");
  revalidatePath("/admin/dispatch/brokers");
  revalidatePath("/admin/dispatch/trips");
}

/**
 * Advance a load's status and, for the assigned/loaded/delivered stages,
 * record the odometer reading that defines deadhead and loaded miles.
 * Readings must climb — the truck odometer only goes up — so a value
 * below the most recent reading is rejected.
 */
export async function updateLoadStatus(
  id: string,
  formData: FormData,
): Promise<void> {
  const sb = createServiceRoleClient();
  const raw = str(formData, "status") ?? "pending";
  const status = STATUSES.has(raw) ? raw : "pending";

  const odoCol = STAGE_ODO_COLUMN[status];
  const odoRaw = intOrNull(formData, "odometer");

  const patch: Record<string, string | number | null> = { status };

  if (odoCol && odoRaw != null) {
    // Guard monotonicity against the highest reading already on the load.
    const { data: cur } = await sb
      .from("loads")
      .select("odo_assigned, odo_loaded, odo_delivered")
      .eq("id", id)
      .maybeSingle<{
        odo_assigned: number | null;
        odo_loaded: number | null;
        odo_delivered: number | null;
      }>();
    const prior = Math.max(
      cur?.odo_assigned ?? 0,
      cur?.odo_loaded ?? 0,
      cur?.odo_delivered ?? 0,
    );
    if (odoRaw < prior) {
      throw new Error(
        `Odometer ${odoRaw.toLocaleString()} is below the last reading ${prior.toLocaleString()}.`,
      );
    }
    patch[odoCol] = odoRaw;
  }

  const { error } = await sb.from("loads").update(patch).eq("id", id);
  if (error) throw new Error(`Could not update load: ${error.message}`);
  revalidatePath("/admin/dispatch/loads");
  revalidatePath(`/admin/dispatch/loads/${id}`);
  revalidatePath("/admin/dispatch/brokers");
  revalidatePath("/admin/dispatch/trips");
}

/**
 * Directly edit a load's three odometer readings (corrections / fat-fingers).
 * Blank clears a reading; present values must climb (assigned ≤ loaded ≤
 * delivered) since the truck odometer only goes up.
 */
export async function updateLoadOdometers(
  id: string,
  formData: FormData,
): Promise<void> {
  const sb = createServiceRoleClient();
  const a = intOrNull(formData, "odo_assigned");
  const l = intOrNull(formData, "odo_loaded");
  const d = intOrNull(formData, "odo_delivered");

  const seq = [a, l, d].filter((v): v is number => v != null);
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] < seq[i - 1]) {
      throw new Error(
        "Odometer readings must increase: assigned ≤ loaded ≤ delivered.",
      );
    }
  }

  const { error } = await sb
    .from("loads")
    .update({ odo_assigned: a, odo_loaded: l, odo_delivered: d })
    .eq("id", id);
  if (error) throw new Error(`Could not save odometer: ${error.message}`);
  revalidatePath("/admin/dispatch/loads");
  revalidatePath(`/admin/dispatch/loads/${id}`);
  revalidatePath("/admin/dispatch/brokers");
  revalidatePath("/admin/dispatch/trips");
}

/** Add a manual expense to a load (category autofills from prior ones). */
export async function addLoadExpense(
  loadId: string,
  formData: FormData,
): Promise<void> {
  const sb = createServiceRoleClient();
  const category = str(formData, "category");
  const amount = numOrNull(formData, "amount");
  if (!category || amount == null) return;
  const { error } = await sb.from("load_expenses").insert({
    load_id: loadId,
    category,
    amount,
    note: str(formData, "note"),
  });
  if (error) throw new Error(`Could not add expense: ${error.message}`);
  revalidatePath(`/admin/dispatch/loads/${loadId}`);
  revalidatePath("/admin/dispatch/loads");
  revalidatePath("/admin/dispatch/trips");
}

export async function deleteLoadExpense(
  expenseId: string,
  loadId: string,
): Promise<void> {
  const sb = createServiceRoleClient();
  await sb
    .from("load_expenses")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", expenseId);
  revalidatePath(`/admin/dispatch/loads/${loadId}`);
  revalidatePath("/admin/dispatch/loads");
  revalidatePath("/admin/dispatch/trips");
}

/**
 * Cancel a load. Mode "tonu" (truck ordered, not used) records a TONU fee
 * ($150 default) as the load's revenue; plain "cancel" zeroes it out.
 */
export async function cancelLoad(
  id: string,
  formData: FormData,
): Promise<void> {
  const sb = createServiceRoleClient();
  const mode = str(formData, "mode");
  const tonu =
    mode === "tonu" ? (numOrNull(formData, "tonu_amount") ?? 150) : null;
  const { error } = await sb
    .from("loads")
    .update({ status: "cancelled", tonu_amount: tonu })
    .eq("id", id);
  if (error) throw new Error(`Could not cancel load: ${error.message}`);
  revalidatePath("/admin/dispatch/loads");
  revalidatePath(`/admin/dispatch/loads/${id}`);
  revalidatePath("/admin/dispatch/brokers");
  revalidatePath("/admin/dispatch/trips");
}

// ── Load documents (rate con / BOL / POD / other) ──────────────────────────

const DOC_BUCKET = "load-documents";
const DOC_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const DOC_MAX_BYTES = 15 * 1024 * 1024;
const DOC_KINDS = new Set(["rate_con", "bol", "pod", "other"]);

function sanitizeFilename(name: string): string {
  const trimmed = name.trim().slice(0, 80);
  return (
    trimmed
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") || "upload"
  );
}

export type DocUploadResult = { ok: true } | { ok: false; reason: string };

export async function uploadLoadDocument(
  loadId: string,
  formData: FormData,
): Promise<DocUploadResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return { ok: false, reason: "Choose a file to upload." };
  }
  if (!DOC_MIME.has(file.type)) {
    return {
      ok: false,
      reason: `Unsupported type ${file.type || "unknown"}. Use JPG, PNG, WEBP, or PDF.`,
    };
  }
  if (file.size > DOC_MAX_BYTES) {
    return {
      ok: false,
      reason: `File too large (${Math.round(file.size / 1024 / 1024)} MB). Max 15 MB.`,
    };
  }
  const kindRaw = str(formData, "kind") ?? "other";
  const kind = DOC_KINDS.has(kindRaw) ? kindRaw : "other";

  const sb = createServiceRoleClient();
  const safe = sanitizeFilename(file.name);
  const prefix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const storagePath = `${loadId}/${prefix}-${safe}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await sb.storage
    .from(DOC_BUCKET)
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });
  if (upErr) return { ok: false, reason: `Upload failed: ${upErr.message}` };

  const { error: insErr } = await sb.from("load_documents").insert({
    load_id: loadId,
    kind,
    storage_path: storagePath,
    original_filename: file.name.slice(0, 240),
    mime_type: file.type,
    size_bytes: file.size,
  });
  if (insErr) {
    await sb.storage.from(DOC_BUCKET).remove([storagePath]);
    return { ok: false, reason: `Save failed: ${insErr.message}` };
  }

  revalidatePath(`/admin/dispatch/loads/${loadId}`);
  return { ok: true };
}

export async function deleteLoadDocument(
  docId: string,
  loadId: string,
): Promise<void> {
  const sb = createServiceRoleClient();
  const { data: row } = await sb
    .from("load_documents")
    .select("id, storage_path")
    .eq("id", docId)
    .eq("load_id", loadId)
    .maybeSingle<{ id: string; storage_path: string }>();
  if (!row) return;
  await sb.storage.from(DOC_BUCKET).remove([row.storage_path]);
  await sb.from("load_documents").delete().eq("id", row.id);
  revalidatePath(`/admin/dispatch/loads/${loadId}`);
}

export async function markLoadPaid(id: string): Promise<void> {
  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("loads")
    .update({ payment_status: "paid", paid_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    throw new Error(`Could not mark paid: ${error.message}`);
  }
  revalidatePath("/admin/dispatch/loads");
  revalidatePath(`/admin/dispatch/loads/${id}`);
  revalidatePath("/admin/dispatch/brokers");
  revalidatePath("/admin/dispatch/trips");
}
