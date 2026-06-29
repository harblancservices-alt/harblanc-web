"use server";

import { redirect } from "next/navigation";
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
  identity?: {
    mc?: string | null;
    dot?: string | null;
    phone?: string | null;
  },
): Promise<string | null> {
  // Broker-level identity (MC / DOT) and the broker's own main line (e.g. the
  // company phone an FMCSA lookup returns) are recorded on the broker itself.
  // A phone/email a user TYPES on a load belongs to a dispatcher AT the broker
  // and is stored separately via addBrokerContactFromLoad.
  const key = name.trim().toLowerCase();
  if (!key) return null;
  const c = identity ?? {};
  const { data: existing } = await sb
    .from("brokers")
    .select("id, mc_number, dot_number, phone")
    .eq("name_key", key)
    .is("deleted_at", null)
    .maybeSingle<{
      id: string;
      mc_number: string | null;
      dot_number: string | null;
      phone: string | null;
    }>();
  if (existing?.id) {
    // Backfill broker identity / main line we now have but the record lacked.
    const patch: Record<string, string> = {};
    if (c.mc && !existing.mc_number) patch.mc_number = c.mc;
    if (c.dot && !existing.dot_number) patch.dot_number = c.dot;
    if (c.phone && !existing.phone) patch.phone = c.phone;
    if (Object.keys(patch).length > 0) {
      await sb.from("brokers").update(patch).eq("id", existing.id);
    }
    return existing.id;
  }
  const { data: created } = await sb
    .from("brokers")
    .insert({
      name: name.trim(),
      mc_number: c.mc ?? null,
      dot_number: c.dot ?? null,
      phone: c.phone ?? null,
    })
    .select("id")
    .maybeSingle<{ id: string }>();
  return created?.id ?? null;
}

/**
 * Record the dispatcher captured on the Add Load form as a contact under the
 * broker (broker_contacts), rather than overwriting the broker's main line.
 * Skips creation when a contact with the same phone or email already exists
 * for this broker, so repeat loads for the same dispatcher don't pile up.
 */
async function addBrokerContactFromLoad(
  sb: ReturnType<typeof createServiceRoleClient>,
  brokerId: string,
  c: { name: string | null; email: string | null; phone: string | null },
): Promise<void> {
  const phone = c.phone;
  const email = c.email;
  if (!phone && !email) return; // no way to reach a dispatcher -> nothing to save

  const { data } = await sb
    .from("broker_contacts")
    .select("phone, email")
    .eq("broker_id", brokerId)
    .is("deleted_at", null);
  const existing = (data ?? []) as { phone: string | null; email: string | null }[];

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
    ? await resolveBrokerId(sb, brokerName, {
        mc: str(formData, "broker_mc"),
        dot: str(formData, "broker_dot"),
        phone: str(formData, "broker_main_phone"),
      })
    : null;

  // The phone/email on the load form are a dispatcher at the broker -> store
  // them as a broker contact, not the broker's own main phone/email.
  if (brokerId) {
    await addBrokerContactFromLoad(sb, brokerId, {
      name: str(formData, "broker_contact_name"),
      email: str(formData, "broker_email"),
      phone: str(formData, "broker_phone"),
    });
  }

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
  // Dashboard "Active loads" can add loads too — refresh it so a new
  // active load shows immediately (and its empty state clears).
  revalidatePath("/admin");
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
      .is("deleted_at", null)
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

  // Scope every load mutation to live rows. If the load was soft-deleted,
  // this matches 0 rows and no-ops harmlessly (Supabase returns no error for
  // a zero-row update), so an action can never resurrect a deleted load.
  const { error } = await sb
    .from("loads")
    .update(patch)
    .eq("id", id)
    .is("deleted_at", null);
  if (error) throw new Error(`Could not update load: ${error.message}`);
  revalidatePath("/admin/dispatch/loads");
  revalidatePath(`/admin/dispatch/loads/${id}`);
  revalidatePath("/admin/dispatch/brokers");
  revalidatePath("/admin/dispatch/trips");
  // Current odometer (and the maintenance schedule) derive from the highest
  // load reading — refresh the dashboard + maintenance views too.
  revalidatePath("/admin");
  revalidatePath("/admin/maintenance");
}

/**
 * Edit a load's three odometer readings AND advance its status. The three
 * odometer stage lines (assigned / loaded / delivered) are the load's status —
 * there's no separate status dropdown — so the status is derived here as the
 * highest stage that has a reading: delivered → "delivered", else loaded →
 * "loaded", else assigned → "assigned", else "pending". A cancelled load is
 * left cancelled (cancellation has its own flow). Blank clears a reading;
 * present values must climb (assigned ≤ loaded ≤ delivered).
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

  // Derive the status from the readings — the highest stage with a reading.
  const derivedStatus =
    d != null ? "delivered" : l != null ? "loaded" : a != null ? "assigned" : "pending";

  // Don't flip a cancelled load back to an active status.
  const { data: cur } = await sb
    .from("loads")
    .select("status")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<{ status: string }>();

  const patch: Record<string, string | number | null> = {
    odo_assigned: a,
    odo_loaded: l,
    odo_delivered: d,
  };
  if (cur?.status !== "cancelled") patch.status = derivedStatus;

  const { error } = await sb
    .from("loads")
    .update(patch)
    .eq("id", id)
    .is("deleted_at", null);
  if (error) throw new Error(`Could not save odometer: ${error.message}`);
  revalidatePath("/admin/dispatch/loads");
  revalidatePath(`/admin/dispatch/loads/${id}`);
  revalidatePath("/admin/dispatch/brokers");
  revalidatePath("/admin/dispatch/trips");
  revalidatePath("/admin");
  revalidatePath("/admin/maintenance");
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
    .eq("id", id)
    .is("deleted_at", null);
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

export type CreateUploadUrlResult =
  | { ok: true; bucket: string; path: string; token: string }
  | { ok: false; reason: string };

export type RecordDoc = {
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
};

/**
 * Step 1 of a direct-to-storage upload: validate the file's type/size and mint
 * a signed upload URL token for a fresh path in the load-documents bucket. The
 * client then uploads the bytes straight to storage (bypassing the server
 * action / Vercel body limits). No file bytes pass through this action.
 */
export async function createLoadDocUploadUrl(
  loadId: string,
  fileName: string,
  mimeType: string,
  sizeBytes: number,
): Promise<CreateUploadUrlResult> {
  try {
    if (!DOC_MIME.has(mimeType)) {
      return {
        ok: false,
        reason: `Unsupported type ${mimeType || "unknown"} ("${fileName}"). Use JPG, PNG, WEBP, or PDF.`,
      };
    }
    if (sizeBytes > DOC_MAX_BYTES) {
      return {
        ok: false,
        reason: `"${fileName}" is too large (${Math.round(sizeBytes / 1024 / 1024)} MB). Max 15 MB.`,
      };
    }
    const safe = sanitizeFilename(fileName);
    const prefix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const path = `${loadId}/${prefix}-${safe}`;
    const sb = createServiceRoleClient();
    const { data, error } = await sb.storage
      .from(DOC_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      return {
        ok: false,
        reason: `Could not start upload: ${error?.message ?? "unknown error"}`,
      };
    }
    return { ok: true, bucket: DOC_BUCKET, path: data.path, token: data.token };
  } catch (e) {
    console.error("[createLoadDocUploadUrl] failed:", e);
    return {
      ok: false,
      reason: `Could not start upload: ${e instanceof Error ? e.message : "unexpected error"}`,
    };
  }
}

/**
 * Step 2 of a direct-to-storage upload: insert the load_documents row(s) for
 * files the client already uploaded to storage. Tiny JSON payload — no bytes.
 * thumb_path is null (thumbnails are no longer generated in the request path).
 */
export async function recordLoadDocuments(
  loadId: string,
  kindRaw: string,
  docs: RecordDoc[],
): Promise<DocUploadResult> {
  try {
    if (!Array.isArray(docs) || docs.length === 0) {
      return { ok: false, reason: "No documents to save." };
    }
    const kind = DOC_KINDS.has(kindRaw) ? kindRaw : "other";
    for (const d of docs) {
      if (!DOC_MIME.has(d.mimeType)) {
        return {
          ok: false,
          reason: `Unsupported type ${d.mimeType || "unknown"} ("${d.originalFilename}").`,
        };
      }
      if (d.sizeBytes > DOC_MAX_BYTES) {
        return {
          ok: false,
          reason: `"${d.originalFilename}" is too large. Max 15 MB.`,
        };
      }
    }
    const sb = createServiceRoleClient();
    const rows = docs.map((d) => ({
      load_id: loadId,
      kind,
      storage_path: d.storagePath,
      thumb_path: null,
      original_filename: d.originalFilename.slice(0, 240),
      mime_type: d.mimeType,
      size_bytes: d.sizeBytes,
    }));
    const { error } = await sb.from("load_documents").insert(rows);
    if (error) {
      // Remove the just-uploaded orphans so a failed insert leaves no junk.
      await sb.storage.from(DOC_BUCKET).remove(docs.map((d) => d.storagePath));
      return { ok: false, reason: `Save failed: ${error.message}` };
    }
    revalidatePath(`/admin/dispatch/loads/${loadId}`);
    // POD can be added from the dashboard's active-loads list — keep it fresh.
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    console.error("[recordLoadDocuments] failed:", e);
    return {
      ok: false,
      reason: `Could not save document: ${e instanceof Error ? e.message : "unexpected error"}`,
    };
  }
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
  revalidatePath("/admin");
}

/** Bulk soft-delete loads selected on the Load Board (multi-select). */
export async function softDeleteLoads(formData: FormData): Promise<void> {
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) return;
  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("loads")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw new Error(`Could not delete loads: ${error.message}`);
  revalidatePath("/admin/dispatch/loads");
  revalidatePath("/admin/dispatch/brokers");
  revalidatePath("/admin/dispatch/trips");
  // Deleting loads can drop the highest odometer — refresh maintenance too.
  revalidatePath("/admin");
  revalidatePath("/admin/maintenance");
}

/** Soft-delete a load — removes it from the board, trips, and broker rollups. */
export async function deleteLoad(id: string): Promise<void> {
  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("loads")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Could not delete load: ${error.message}`);
  revalidatePath("/admin/dispatch/loads");
  revalidatePath("/admin/dispatch/brokers");
  revalidatePath("/admin/dispatch/trips");
  revalidatePath("/admin");
  revalidatePath("/admin/maintenance");
  redirect("/admin/dispatch/loads");
}

export async function markLoadPaid(id: string): Promise<void> {
  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("loads")
    .update({ payment_status: "paid", paid_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) {
    throw new Error(`Could not mark paid: ${error.message}`);
  }
  revalidatePath("/admin/dispatch/loads");
  revalidatePath(`/admin/dispatch/loads/${id}`);
  revalidatePath("/admin/dispatch/brokers");
  revalidatePath("/admin/dispatch/trips");
}
