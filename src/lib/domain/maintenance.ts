import { createServiceRoleClient } from "@/lib/supabase/server";
import { receiptName, withExt } from "@/lib/admin/doc-name";
import {
  categoryForText,
  groupKey,
  isCategory,
  isPosition,
  isPreventative,
  type Category,
} from "@/lib/dispatch/repair-log";

/**
 * Maintenance — SERVICE-based, parts-first writes. A repair_service is one
 * shop/dealer visit that holds many parts (repair_entries). Shared by both
 * /admin and /tms-v2, each of which adds only its own app-specific behavior
 * on top (demo-mode gate and revalidatePath targets for /admin;
 * revalidatePath targets for /tms-v2, which has no demo mode) — see the two
 * wrapper files: src/app/admin/(authed)/maintenance/actions.ts and
 * src/actions/tms-v2/maintenance.ts.
 *
 * Deliberately EXCLUDES createReceiptUploadUrl, attachRelated, and
 * detachRelated (part ↔ part related-links) — those stay in admin's
 * maintenance/actions.ts unchanged; /tms-v2 doesn't call them.
 * RECEIPT_BUCKET/RECEIPT_MIME/RECEIPT_MAX_BYTES are exported from here
 * because admin's createReceiptUploadUrl also needs the identical bucket
 * name and validation limits for the signed-upload token it mints —
 * importing them from here (a plain, safe import) keeps that one bucket
 * name and one set of limits truly singular rather than reintroducing a
 * second copy in admin's file.
 *
 * No company/user scoping or per-caller authorization here by design —
 * this is a single-tenant domain (no org column on these tables), and
 * every caller is already behind the shared admin session gate
 * (src/middleware.ts) before it can reach a Server Action that calls these.
 */

type SB = ReturnType<typeof createServiceRoleClient>;

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function intOrNull(fd: FormData, key: string): number | null {
  const s = str(fd, key);
  if (s == null) return null;
  const n = Number(s.replace(/[,]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** "$1,250.50" → 1250.5. Null when blank/invalid/negative. Rounded to cents. */
function moneyOrNull(raw: string | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned.length === 0) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function jsonArray(fd: FormData, key: string): unknown[] {
  const raw = str(fd, key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Receipt uploads → private maintenance-receipts bucket (signed URLs only).
export const RECEIPT_BUCKET = "maintenance-receipts";
export const RECEIPT_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
  "application/pdf",
]);
export const RECEIPT_MAX_BYTES = 20 * 1024 * 1024;

type ReceiptMeta = {
  storagePath: string;
  name: string;
  type: string;
  size: number;
};

function validateReceiptMeta(r: Record<string, unknown>): ReceiptMeta | null {
  const storagePath = typeof r.storagePath === "string" ? r.storagePath : "";
  if (!storagePath) return null;
  const name = typeof r.name === "string" ? r.name : "receipt";
  const type = typeof r.type === "string" ? r.type : "";
  const size = typeof r.size === "number" ? r.size : 0;
  if (type && !RECEIPT_MIME.has(type)) {
    throw new Error(
      `Unsupported file "${name}" (${type || "unknown"}). Use JPG, PNG, HEIC, WEBP, or PDF.`,
    );
  }
  if (size > RECEIPT_MAX_BYTES) {
    throw new Error(`"${name}" is too large. Max 20 MB.`);
  }
  return { storagePath, name, type, size };
}

function parseReceipts(fd: FormData): ReceiptMeta[] {
  const out: ReceiptMeta[] = [];
  for (const r of jsonArray(fd, "receipts")) {
    if (r && typeof r === "object") {
      const meta = validateReceiptMeta(r as Record<string, unknown>);
      if (meta) out.push(meta);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Parse the service form.

type ServiceFields = {
  serviceDate: string;
  odometer: number | null;
  totalCost: number | null;
  notes: string | null;
};

function parseServiceFields(fd: FormData): ServiceFields {
  const odometer = intOrNull(fd, "odometer");
  if (odometer != null && odometer < 0) {
    throw new Error("Odometer can't be negative.");
  }
  return {
    serviceDate: str(fd, "service_date") ?? new Date().toISOString().slice(0, 10),
    odometer,
    totalCost: moneyOrNull(str(fd, "total_cost")),
    notes: str(fd, "notes"),
  };
}

type ParsedPart = {
  id: string | null;
  description: string;
  category: Category;
  position: string | null;
  subCategory: string | null;
  partGroup: string | null;
  reminderInterval: number | null;
};

/** Parse the repeatable "parts replaced" list; drops rows with no name. */
function parseParts(fd: FormData): ParsedPart[] {
  const out: ParsedPart[] = [];
  for (const raw of jsonArray(fd, "parts")) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    const description =
      typeof p.description === "string" ? p.description.trim() : "";
    if (!description) continue; // no name → not a part

    const rawCat = typeof p.category === "string" ? p.category : "";
    const category = isCategory(rawCat) ? rawCat : categoryForText(description);

    const rawPos = typeof p.position === "string" ? p.position : "";
    const position = isPosition(rawPos) ? rawPos : null;

    // tms-v2's Log Service form (Parts Replaced row) sends this instead of
    // position — a category-scoped pick-list item, not an axle/side slot.
    // /admin's own modal doesn't send it, so it's null for those parts.
    const subCategory =
      typeof p.subCategory === "string" && p.subCategory.trim().length > 0 ? p.subCategory.trim().slice(0, 120) : null;

    const rawRemind =
      typeof p.reminderInterval === "number"
        ? p.reminderInterval
        : typeof p.reminderInterval === "string"
          ? Number(p.reminderInterval.replace(/[,]/g, ""))
          : NaN;
    const reminderInterval =
      Number.isFinite(rawRemind) && rawRemind > 0 ? Math.round(rawRemind) : null;

    let partGroup =
      typeof p.partGroup === "string" && p.partGroup.trim().length > 0
        ? p.partGroup.trim()
        : null;
    // A positioned or recurring part needs a group; default it to the name.
    if (!partGroup && (position || reminderInterval != null)) {
      partGroup = description;
    }

    out.push({
      id: typeof p.id === "string" && p.id ? p.id : null,
      description: description.slice(0, 200),
      category,
      position,
      subCategory,
      partGroup: partGroup ? partGroup.slice(0, 120) : null,
      reminderInterval,
    });
  }
  return out;
}

/** True when a part_group already carries an active (non-dismissed) reminder. */
async function groupHasActiveReminder(
  sb: SB,
  partGroup: string | null,
): Promise<boolean> {
  if (!groupKey(partGroup)) return false;
  const { data } = await sb
    .from("repair_reminders")
    .select("id")
    .ilike("part_group", partGroup as string)
    .is("dismissed_at", null)
    .limit(1)
    .maybeSingle<{ id: string }>();
  return !!data;
}

/**
 * Whether a part is preventative: a recurring/consumable item by description,
 * OR it carries its own reminder interval, OR its group already has an active
 * reminder. Mirrors the persisted column so the lens can query it directly.
 */
async function computeIsPreventative(sb: SB, p: ParsedPart): Promise<boolean> {
  if (isPreventative(p.description) || p.reminderInterval != null) return true;
  return groupHasActiveReminder(sb, p.partGroup);
}

/**
 * Create/refresh the reminder overlay for a part_group. Matches case-
 * insensitively; updates the interval + un-dismisses, or inserts a new one.
 * Every active reminder is a preventative overlay, so it also flags all of the
 * group's current entries as preventative (they now appear in the lens).
 */
async function upsertReminder(
  sb: SB,
  partGroup: string,
  intervalMiles: number,
  category: Category,
): Promise<void> {
  const key = groupKey(partGroup);
  if (!key) return;
  const { data: existing } = await sb
    .from("repair_reminders")
    .select("id")
    .ilike("part_group", partGroup)
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (existing) {
    await sb
      .from("repair_reminders")
      .update({
        interval_miles: intervalMiles,
        label: partGroup,
        category,
        is_preventative: true,
        dismissed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await sb.from("repair_reminders").insert({
      label: partGroup,
      part_group: partGroup,
      interval_miles: intervalMiles,
      category,
      is_preventative: true,
    });
  }

  // The whole group is preventative now — flag its logged entries so the
  // aggregate lens picks them up without a re-scan.
  await sb
    .from("repair_entries")
    .update({ is_preventative: true, updated_at: new Date().toISOString() })
    .ilike("part_group", partGroup)
    .is("deleted_at", null);
}

/** True for a Postgrest "unknown column" error naming `column` — either a
 * raw Postgres 42703 (undefined_column) or Postgrest's own PGRST204 schema-
 * cache miss, depending on how the request was rejected. */
function isMissingColumnError(
  error: { code?: string | null; message?: string | null } | null,
  column: string,
): boolean {
  if (!error) return false;
  return (error.code === "42703" || error.code === "PGRST204") && (error.message ?? "").includes(column);
}

/** Insert a part row for a service; upserts its reminder if flagged.
 *
 * `sub_category` (supabase/migrations/20260808000000_repair_entries_sub_
 * category.sql) can only be applied by hand (see that file's header) — until
 * it's confirmed live, sending it 400s the whole insert with a schema-cache
 * miss. Before that fallback existed, that 400 threw AFTER the parent
 * repair_services row was already created (logService inserts the service
 * first, then its parts), so a "Log service" tap left an orphaned service
 * with zero parts: nothing recognizable as saved, no root cause visible
 * anywhere in the UI. Retrying without sub_category on that specific
 * failure keeps the part (and its service) intact — same rollout-window
 * pattern lib/data/recurring-expenses.ts's EXPENSE_COLUMNS_FULL/BASE
 * fallback already uses — at the cost of that one field until the
 * migration is confirmed applied. */
async function insertPart(
  sb: SB,
  serviceId: string,
  p: ParsedPart,
): Promise<void> {
  const isPrev = await computeIsPreventative(sb, p);
  const base = {
    service_id: serviceId,
    description: p.description,
    category: p.category,
    position: p.position,
    part_group: p.partGroup,
    is_preventative: isPrev,
  };
  let { error } = await sb.from("repair_entries").insert({ ...base, sub_category: p.subCategory });
  if (error && isMissingColumnError(error, "sub_category")) {
    ({ error } = await sb.from("repair_entries").insert(base));
  }
  if (error) throw new Error(`Could not save part: ${error.message}`);
  if (p.reminderInterval != null && p.partGroup) {
    await upsertReminder(sb, p.partGroup, p.reminderInterval, p.category);
  }
}

/** Insert repair_attachments rows for freshly-uploaded receipts (service). */
async function persistReceipts(
  sb: SB,
  serviceId: string,
  receipts: ReceiptMeta[],
  partNames: string[],
  serviceDate: string | null,
): Promise<void> {
  // Canonical stored name: "<first part name> - <service date>" + real ext, so
  // the saved file itself reads correctly on later export / download.
  for (const r of receipts) {
    const { error } = await sb.from("repair_attachments").insert({
      service_id: serviceId,
      file_path: r.storagePath,
      thumb_path: null,
      file_name: withExt(
        receiptName({ firstPartName: partNames[0] ?? null, date: serviceDate }),
        r.name,
      ),
      content_type: r.type || null,
      size_bytes: r.size,
    });
    if (error) {
      await sb.storage.from(RECEIPT_BUCKET).remove([r.storagePath]);
      throw new Error(`Could not record receipt ("${r.name}"): ${error.message}`);
    }
  }
}

/**
 * Same visit = automatically related. Link every pair of the service's parts
 * (idempotent — existing links are ignored). Covers parts added on a later
 * edit, since it re-links across ALL current parts of the service.
 */
async function autoLinkServiceParts(sb: SB, serviceId: string): Promise<void> {
  const { data } = await sb
    .from("repair_entries")
    .select("id")
    .eq("service_id", serviceId)
    .is("deleted_at", null)
    .returns<{ id: string }[]>();
  const ids = (data ?? []).map((r) => r.id).sort();
  if (ids.length < 2) return;
  const rows: { a_id: string; b_id: string }[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      rows.push({ a_id: ids[i], b_id: ids[j] });
    }
  }
  const { error } = await sb
    .from("repair_links")
    .upsert(rows, { onConflict: "a_id,b_id", ignoreDuplicates: true });
  if (error && !/duplicate|unique/i.test(error.message)) {
    console.error("[autoLinkServiceParts] failed:", error.message);
  }
}

async function removeReceipts(
  sb: SB,
  serviceId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const { data: rows } = await sb
    .from("repair_attachments")
    .select("id, file_path, thumb_path")
    .eq("service_id", serviceId)
    .in("id", ids)
    .returns<{ id: string; file_path: string; thumb_path: string | null }[]>();
  const paths = (rows ?? [])
    .flatMap((r) => [r.file_path, r.thumb_path])
    .filter((p): p is string => !!p);
  if (paths.length > 0) await sb.storage.from(RECEIPT_BUCKET).remove(paths);
  if (rows && rows.length > 0) {
    await sb
      .from("repair_attachments")
      .delete()
      .eq("service_id", serviceId)
      .in("id", rows.map((r) => r.id));
  }
}

/** Best-effort delete of a service's receipt storage objects. */
async function removeServiceStorage(sb: SB, serviceId: string): Promise<void> {
  const { data: atts } = await sb
    .from("repair_attachments")
    .select("file_path, thumb_path")
    .eq("service_id", serviceId)
    .returns<{ file_path: string | null; thumb_path: string | null }[]>();
  const paths = (atts ?? [])
    .flatMap((a) => [a.file_path, a.thumb_path])
    .filter((p): p is string => !!p);
  if (paths.length > 0) await sb.storage.from(RECEIPT_BUCKET).remove(paths);
}

// ---------------------------------------------------------------------------
// Service CRUD. No revalidatePath / demo gate here by design — each app's
// wrapper (admin's maintenance/actions.ts, tms-v2's actions/tms-v2/
// maintenance.ts) adds those on top after calling into this module.

export async function logService(formData: FormData): Promise<void> {
  const sb = createServiceRoleClient();
  const f = parseServiceFields(formData);
  const parts = parseParts(formData);
  if (parts.length === 0) {
    throw new Error("Add at least one part that was replaced.");
  }
  const receipts = parseReceipts(formData);

  const { data: service, error } = await sb
    .from("repair_services")
    .insert({
      service_date: f.serviceDate,
      odometer: f.odometer,
      total_cost: f.totalCost,
      notes: f.notes,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !service) {
    throw new Error(`Could not save service: ${error?.message ?? "unknown error"}`);
  }

  for (const p of parts) await insertPart(sb, service.id, p);
  await persistReceipts(
    sb,
    service.id,
    receipts,
    parts.map((p) => p.description),
    f.serviceDate,
  );
  await autoLinkServiceParts(sb, service.id);
}

/**
 * Edit a service: update its fields, reconcile its parts (add / update /
 * remove), and add/remove receipts.
 */
export async function updateService(
  serviceId: string,
  formData: FormData,
): Promise<void> {
  if (!serviceId) throw new Error("Missing service.");
  const sb = createServiceRoleClient();
  const f = parseServiceFields(formData);
  const parts = parseParts(formData);
  if (parts.length === 0) {
    throw new Error("A service needs at least one part.");
  }
  const receipts = parseReceipts(formData);

  const { error: updErr } = await sb
    .from("repair_services")
    .update({
      service_date: f.serviceDate,
      odometer: f.odometer,
      total_cost: f.totalCost,
      notes: f.notes,
    })
    .eq("id", serviceId);
  if (updErr) throw new Error(`Could not update service: ${updErr.message}`);

  // Reconcile parts. Existing rows in the payload are updated in place; new
  // rows are inserted; existing rows absent from the payload are deleted.
  const { data: existingRows } = await sb
    .from("repair_entries")
    .select("id")
    .eq("service_id", serviceId)
    .is("deleted_at", null)
    .returns<{ id: string }[]>();
  const existingIds = new Set((existingRows ?? []).map((r) => r.id));
  const keptIds = new Set<string>();

  for (const p of parts) {
    if (p.id && existingIds.has(p.id)) {
      keptIds.add(p.id);
      const isPrev = await computeIsPreventative(sb, p);
      const baseUpdate = {
        description: p.description,
        category: p.category,
        position: p.position,
        part_group: p.partGroup,
        is_preventative: isPrev,
        updated_at: new Date().toISOString(),
      };
      // Same sub_category rollout-window fallback as insertPart above.
      let { error } = await sb
        .from("repair_entries")
        .update({ ...baseUpdate, sub_category: p.subCategory })
        .eq("id", p.id);
      if (error && isMissingColumnError(error, "sub_category")) {
        ({ error } = await sb.from("repair_entries").update(baseUpdate).eq("id", p.id));
      }
      if (error) throw new Error(`Could not update part: ${error.message}`);
      if (p.reminderInterval != null && p.partGroup) {
        await upsertReminder(sb, p.partGroup, p.reminderInterval, p.category);
      }
    } else {
      await insertPart(sb, serviceId, p);
    }
  }

  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
  if (toDelete.length > 0) {
    await sb.from("repair_entries").delete().in("id", toDelete);
  }

  const removeIds = jsonArray(formData, "remove_receipt_ids").filter(
    (v): v is string => typeof v === "string",
  );
  await removeReceipts(sb, serviceId, removeIds);
  await persistReceipts(
    sb,
    serviceId,
    receipts,
    parts.map((p) => p.description),
    f.serviceDate,
  );
  await autoLinkServiceParts(sb, serviceId);
}

/**
 * Delete ONE receipt off a service — what the doc viewer's Delete calls. The
 * service itself is untouched: a visit with no receipt is still a visit.
 */
export async function deleteReceipt(
  serviceId: string,
  attachmentId: string,
): Promise<void> {
  if (!serviceId || !attachmentId) throw new Error("Missing receipt.");
  const sb = createServiceRoleClient();
  await removeReceipts(sb, serviceId, [attachmentId]);
}

/**
 * Delete a whole service (visit): its parts, their related links, and its
 * receipts all cascade; the receipt storage objects are removed first.
 */
export async function deleteService(serviceId: string): Promise<void> {
  if (!serviceId) throw new Error("Missing service.");
  const sb = createServiceRoleClient();
  await removeServiceStorage(sb, serviceId);
  const { error } = await sb.from("repair_services").delete().eq("id", serviceId);
  if (error) throw new Error(`Could not delete service: ${error.message}`);
}

/**
 * Delete a single PART. If it was the last part of its service, the now-empty
 * service (and its receipts) is removed too.
 */
export async function deletePart(entryId: string): Promise<void> {
  if (!entryId) throw new Error("Missing part.");
  const sb = createServiceRoleClient();

  const { data: part } = await sb
    .from("repair_entries")
    .select("service_id")
    .eq("id", entryId)
    .maybeSingle<{ service_id: string | null }>();

  const { error } = await sb.from("repair_entries").delete().eq("id", entryId);
  if (error) throw new Error(`Could not delete part: ${error.message}`);

  const serviceId = part?.service_id ?? null;
  if (serviceId) {
    const { count } = await sb
      .from("repair_entries")
      .select("id", { count: "exact", head: true })
      .eq("service_id", serviceId)
      .is("deleted_at", null);
    if ((count ?? 0) === 0) {
      await removeServiceStorage(sb, serviceId);
      await sb.from("repair_services").delete().eq("id", serviceId);
    }
  }
}

// ---------------------------------------------------------------------------
// Reminders.

export async function setReminderDismissed(
  reminderId: string,
  dismissed: boolean,
): Promise<void> {
  if (!reminderId) throw new Error("Missing reminder.");
  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("repair_reminders")
    .update({
      dismissed_at: dismissed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reminderId);
  if (error) throw new Error(`Could not update reminder: ${error.message}`);
}
