"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { lookupZip, estimateLaneMiles } from "@/lib/dispatch/distance";
import {
  loadDocName,
  normalizeLoadDocKind,
  withExt,
} from "@/lib/admin/doc-name";
// Type-only: erased at compile, so it never pulls pdf-lib into this
// "use server" module's runtime graph. The functions themselves are loaded
// LAZILY inside regenerateSignedBol (see the note there) so a pdf-lib eval
// failure can't poison unrelated actions — same discipline as sharp below.
import type { SignatureStamp } from "@/lib/pdf/signDoc";

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

/**
 * Turn an Add/Edit Load form submission into the load columns it implies:
 * broker and trip resolved to (or created as) real records, the dispatcher
 * captured as a broker contact, ZIPs resolved to "City, ST", and the lane's
 * driving miles recomputed server-side. createLoad and updateLoad both go
 * through here, so the Add form and the Edit form can never drift apart —
 * which is what lets the edit modal be the add modal with values in it.
 */
async function loadFieldsFromForm(
  sb: ReturnType<typeof createServiceRoleClient>,
  formData: FormData,
): Promise<Record<string, string | number | null>> {
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

  return {
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
    status,
  };
}

export async function createLoad(formData: FormData): Promise<void> {
  const sb = createServiceRoleClient();
  const fields = await loadFieldsFromForm(sb, formData);

  const { error } = await sb.from("loads").insert({
    ...fields,
    deadhead_to_miles: 0,
    deadhead_from_miles: 0,
    fuel_cost: 0,
    factoring_fee: 0,
    misc_cost: 0,
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
 * Save the whole load from the Add Load form reopened in edit mode — the full
 * counterpart to updateLoadDetails, which deliberately touches only the fields
 * with no effect on the money math. This one DOES move the money and the
 * rollups (rate, lane miles, broker, trip), because that's the point: assigning
 * a trip to a load created before that trip existed goes through here.
 *
 * Odometer readings, expenses, TONU and payment status are owned by their own
 * flows and are left alone.
 */
export async function updateLoad(id: string, formData: FormData): Promise<void> {
  const sb = createServiceRoleClient();
  const fields = await loadFieldsFromForm(sb, formData);

  const { error } = await sb
    .from("loads")
    .update(fields)
    .eq("id", id)
    .is("deleted_at", null);
  if (error) throw new Error(`Could not save load: ${error.message}`);

  revalidatePath("/admin/dispatch/loads");
  revalidatePath(`/admin/dispatch/loads/${id}`);
  revalidatePath("/admin/dispatch/brokers");
  revalidatePath("/admin/dispatch/trips");
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
 *
 * RETURNS a result rather than throwing on a bad entry. A server action that
 * throws is redacted in production — Next.js swaps the message for the opaque
 * "An error occurred in the Server Components render…" digest text — so the
 * caller's inline error would show that instead of the reason. Returning the
 * reason keeps the message the owner actually needs ("Loaded can't be below
 * Assigned") intact in prod. Only genuinely-unexpected faults still throw.
 */
export type OdometerSaveResult = { ok: true } | { ok: false; reason: string };

// Stage labels for the monotonicity message, so a rejected save names the two
// readings at fault instead of restating the rule.
const ODO_STAGES = ["Assigned", "Loaded", "Delivered"] as const;

export async function updateLoadOdometers(
  id: string,
  formData: FormData,
): Promise<OdometerSaveResult> {
  const sb = createServiceRoleClient();
  const a = intOrNull(formData, "odo_assigned");
  const l = intOrNull(formData, "odo_loaded");
  const d = intOrNull(formData, "odo_delivered");

  // Compare only the stages that HAVE a reading (a pending load mid-trip
  // legitimately has Assigned + Loaded with Delivered still blank), but keep
  // each one's stage name so the message can point at the real pair.
  const present = ([a, l, d] as const)
    .map((v, i) => ({ value: v, stage: ODO_STAGES[i] }))
    .filter((s): s is { value: number; stage: (typeof ODO_STAGES)[number] } =>
      s.value != null,
    );
  for (let i = 1; i < present.length; i++) {
    const prev = present[i - 1];
    const cur = present[i];
    if (cur.value < prev.value) {
      return {
        ok: false,
        reason:
          `${cur.stage} (${cur.value.toLocaleString("en-US")}) can't be below ` +
          `${prev.stage} (${prev.value.toLocaleString("en-US")}) — the odometer ` +
          `only climbs. Check for a typo.`,
      };
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
  // Same reasoning as the validation return above: a throw here would reach the
  // owner as the redacted digest text, so the DB's own message is returned.
  if (error) return { ok: false, reason: `Could not save odometer: ${error.message}` };
  revalidatePath("/admin/dispatch/loads");
  revalidatePath(`/admin/dispatch/loads/${id}`);
  revalidatePath("/admin/dispatch/brokers");
  revalidatePath("/admin/dispatch/trips");
  revalidatePath("/admin");
  revalidatePath("/admin/maintenance");
  return { ok: true };
}

/**
 * Edit a load's schedule metadata — pickup date, delivery date, load number.
 * Deliberately scoped to fields with NO effect on the money math (miles, rate,
 * fuel, factoring, trip/broker rollups): those stay owned by their own flows.
 * Blank clears a field. Dates arrive as native YYYY-MM-DD strings (same format
 * createLoad stores), so they drop straight into the date columns.
 */
export async function updateLoadDetails(
  id: string,
  formData: FormData,
): Promise<void> {
  const sb = createServiceRoleClient();
  const patch: Record<string, string | null> = {
    pickup_date: str(formData, "pickup_date"),
    delivery_date: str(formData, "delivery_date"),
    load_number: str(formData, "load_number"),
  };
  const { error } = await sb
    .from("loads")
    .update(patch)
    .eq("id", id)
    .is("deleted_at", null);
  if (error) throw new Error(`Could not save load details: ${error.message}`);
  revalidatePath("/admin/dispatch/loads");
  revalidatePath(`/admin/dispatch/loads/${id}`);
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

    // Canonical stored file_name: "RC / BOL / POD - <load#> - <broker>", with a
    // 1-based upload-order number when siblings exist. Look up the load's number
    // + broker, and how many same-type (non-signed) docs already exist, so the
    // batch continues the numbering. (Display recomputes authoritatively.)
    const { data: loadRow } = await sb
      .from("loads")
      .select("load_number, broker_name")
      .eq("id", loadId)
      .maybeSingle<{ load_number: string | null; broker_name: string | null }>();
    const { data: existingRows } = await sb
      .from("load_documents")
      .select("id")
      .eq("load_id", loadId)
      .eq("kind", kind)
      .is("signed_from_doc_id", null)
      .returns<{ id: string }[]>();
    const existing = existingRows?.length ?? 0;
    const total = existing + docs.length;
    const docKind = normalizeLoadDocKind(kind);

    const rows = docs.map((d, i) => ({
      load_id: loadId,
      kind,
      storage_path: d.storagePath,
      thumb_path: null,
      original_filename: withExt(
        loadDocName({
          kind: docKind,
          loadNumber: loadRow?.load_number,
          broker: loadRow?.broker_name,
          index: existing + i + 1,
          total,
        }),
        d.originalFilename,
      ),
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

// ── BOL signatures (Receiver + Carrier) ────────────────────────────────────
//
// The original unsigned BOL is never touched. Each role's signature (a trimmed
// transparent-PNG data URL) + its placement is stored in bol_signatures keyed
// by (original doc, role). On every save we REGENERATE the "— signed.pdf"
// output from the original + ALL current role rows, so re-signing one role
// replaces only its row and re-stamps both — the two signatures always coexist.

const BOL_ROLES = new Set(["receiver", "carrier"]);

/** Placement sent by the client — already mapped to the ORIGINAL's geometry. */
export type BolPlacement =
  | {
      kind: "pdf";
      pageIndex: number;
      cx: number;
      cy: number;
      rotationDeg: number;
      widthPts: number;
      aspect: number;
    }
  | { kind: "image"; fx: number; fy: number; widthFrac: number; aspect: number };

export type SignBolRolePayload = {
  pngDataUrl: string;
  printName: string;
  dateStr: string;
  placement: BolPlacement;
};

type StoredPlacement = BolPlacement & { printName?: string; dateStr?: string };
type SigRow = { role: string; png: string; placement: StoredPlacement };

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function stampFromRow(row: SigRow, cx: number, cy: number, widthPts: number, rotationDeg: number): SignatureStamp {
  const pl = row.placement;
  return {
    pageIndex: pl.kind === "pdf" ? pl.pageIndex : 0,
    place: { cx, cy, rotationDeg, widthPts },
    content: {
      pngBytes: dataUrlToBytes(row.png),
      aspect: pl.aspect,
      printName: pl.printName,
      dateStr: pl.dateStr,
    },
  };
}

async function regenerateSignedBol(
  origBytes: Uint8Array,
  origMime: string,
  sigs: SigRow[],
): Promise<Uint8Array> {
  // signDoc pulls in pdf-lib; load it LAZILY (never at module top-level) so a
  // pdf-lib eval failure is isolated to this function and can't poison the
  // other actions in this "use server" module — same rule as sharp below.
  const { signPdfWithStamps, signImageWithStamps } = await import(
    "@/lib/pdf/signDoc"
  );
  const isPdf = (origMime ?? "").includes("pdf");
  if (isPdf) {
    const stamps = sigs
      .filter((s) => s.placement.kind === "pdf")
      .map((s) => {
        const pl = s.placement as Extract<BolPlacement, { kind: "pdf" }>;
        return stampFromRow(s, pl.cx, pl.cy, pl.widthPts, pl.rotationDeg);
      });
    return signPdfWithStamps(origBytes, stamps);
  }
  // Image BOL: auto-orient (EXIF) + cap size, then map each role's fractions
  // onto the resulting pixel dimensions (resolution-independent).
  //
  // sharp is loaded LAZILY here (never at module top-level): its native binary
  // can throw at import time on Vercel, and a top-level import would poison this
  // whole "use server" module — making EVERY action in it (updateLoadOdometers,
  // uploads, …) reject on invoke. That was the Save-ODO regression fixed in
  // 8c74925; keeping the import inside the one function that needs it prevents
  // it from ever coming back.
  const sharp = (await import("sharp")).default;
  const { data: jpgBuf, info } = await sharp(origBytes)
    .rotate()
    .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const stamps = sigs
    .filter((s) => s.placement.kind === "image")
    .map((s) => {
      const pl = s.placement as Extract<BolPlacement, { kind: "image" }>;
      return stampFromRow(s, pl.fx * W, H - pl.fy * H, pl.widthFrac * W, 0);
    });
  return signImageWithStamps(new Uint8Array(jpgBuf), W, H, stamps);
}

/**
 * Save (or replace) one role's signature on a BOL and regenerate the signed
 * PDF from the original + all current role signatures. Keeps the original.
 */
export async function signBolRole(
  loadId: string,
  originalDocId: string,
  role: string,
  payload: SignBolRolePayload,
): Promise<DocUploadResult> {
  try {
    if (!BOL_ROLES.has(role)) {
      return { ok: false, reason: "Unknown signer role." };
    }
    const sb = createServiceRoleClient();

    const { data: orig } = await sb
      .from("load_documents")
      .select("id, storage_path, original_filename, mime_type")
      .eq("id", originalDocId)
      .eq("load_id", loadId)
      .maybeSingle<{
        id: string;
        storage_path: string;
        original_filename: string;
        mime_type: string | null;
      }>();
    if (!orig) return { ok: false, reason: "Original BOL not found." };

    // 1. Upsert this role's signature (replaces the role's prior signature).
    const { error: upErr } = await sb.from("bol_signatures").upsert(
      {
        load_id: loadId,
        doc_id: originalDocId,
        role,
        png: payload.pngDataUrl,
        placement: {
          ...payload.placement,
          printName: payload.printName,
          dateStr: payload.dateStr,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "doc_id,role" },
    );
    if (upErr) return { ok: false, reason: `Could not save signature: ${upErr.message}` };

    // 2. Regenerate from the original + ALL current role signatures.
    const { data: sigRows } = await sb
      .from("bol_signatures")
      .select("role, png, placement")
      .eq("doc_id", originalDocId)
      .returns<SigRow[]>();
    const sigs = sigRows ?? [];

    const { data: blob, error: dlErr } = await sb.storage
      .from(DOC_BUCKET)
      .download(orig.storage_path);
    if (dlErr || !blob) {
      return { ok: false, reason: "Could not read the original BOL." };
    }
    const origBytes = new Uint8Array(await blob.arrayBuffer());
    const signedBytes = await regenerateSignedBol(origBytes, orig.mime_type ?? "", sigs);

    // 3. Upload the regenerated signed PDF (server → storage, no body limit).
    // Canonical stored name: "BOL - <load#> - <broker> - signed" (numbered when
    // this load has more than one signed BOL). Output is always a PDF.
    const { data: loadRow } = await sb
      .from("loads")
      .select("load_number, broker_name")
      .eq("id", loadId)
      .maybeSingle<{ load_number: string | null; broker_name: string | null }>();
    const { data: otherSigned } = await sb
      .from("load_documents")
      .select("id")
      .eq("load_id", loadId)
      .eq("kind", "bol")
      .not("signed_from_doc_id", "is", null)
      .neq("signed_from_doc_id", originalDocId)
      .returns<{ id: string }[]>();
    const signedSiblings = otherSigned?.length ?? 0;
    const fileName = withExt(
      loadDocName({
        kind: "bol",
        loadNumber: loadRow?.load_number,
        broker: loadRow?.broker_name,
        signed: true,
        index: signedSiblings + 1,
        total: signedSiblings + 1,
      }),
      ".pdf",
    );
    const prefix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const path = `${loadId}/${prefix}-${sanitizeFilename(fileName)}`;
    const { error: putErr } = await sb.storage
      .from(DOC_BUCKET)
      .upload(path, Buffer.from(signedBytes), { contentType: "application/pdf" });
    if (putErr) return { ok: false, reason: `Could not save signed BOL: ${putErr.message}` };

    // 4. Insert the new signed-output row, then drop the previous one(s).
    const { data: prev } = await sb
      .from("load_documents")
      .select("id, storage_path")
      .eq("signed_from_doc_id", originalDocId)
      .returns<{ id: string; storage_path: string }[]>();

    const { error: insErr } = await sb.from("load_documents").insert({
      load_id: loadId,
      kind: "bol",
      storage_path: path,
      thumb_path: null,
      original_filename: fileName.slice(0, 240),
      mime_type: "application/pdf",
      size_bytes: signedBytes.byteLength,
      signed_from_doc_id: originalDocId,
    });
    if (insErr) {
      await sb.storage.from(DOC_BUCKET).remove([path]);
      return { ok: false, reason: `Could not save signed BOL: ${insErr.message}` };
    }

    if (prev && prev.length > 0) {
      await sb.storage.from(DOC_BUCKET).remove(prev.map((p) => p.storage_path));
      await sb.from("load_documents").delete().in("id", prev.map((p) => p.id));
    }

    revalidatePath(`/admin/dispatch/loads/${loadId}`);
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    console.error("[signBolRole] failed:", e);
    return {
      ok: false,
      reason: `Could not sign BOL: ${e instanceof Error ? e.message : "unexpected error"}`,
    };
  }
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
  revalidatePath("/admin/dispatch/receivables");
  revalidatePath("/admin/dispatch/brokers");
  revalidatePath("/admin/dispatch/trips");
}

/**
 * Undo a mark-paid — flips a load back to unpaid so an accidental "Mark paid"
 * on the Accounts Receivable page can be reversed. Clears paid_at so the load
 * returns to the outstanding A/R total.
 */
export async function markLoadUnpaid(id: string): Promise<void> {
  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("loads")
    .update({ payment_status: "unpaid", paid_at: null })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) {
    throw new Error(`Could not undo paid: ${error.message}`);
  }
  revalidatePath("/admin/dispatch/loads");
  revalidatePath(`/admin/dispatch/loads/${id}`);
  revalidatePath("/admin/dispatch/receivables");
  revalidatePath("/admin/dispatch/brokers");
  revalidatePath("/admin/dispatch/trips");
}
