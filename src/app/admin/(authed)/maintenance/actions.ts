"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { groupKey, isPosition } from "@/lib/dispatch/repair-log";

/**
 * Repair-log actions. Service-role client (admin-only, behind the authed
 * shell), matching the loads/brokers posture. Actions throw on failure so the
 * modal surfaces the error inline instead of failing silently.
 *
 * Receipts follow the SAME flow as the legacy maintenance / load-document
 * uploads: the client mints a signed upload URL (createReceiptUploadUrl),
 * uploads the bytes directly to the private `maintenance-receipts` bucket, then
 * sends only the file metadata here.
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
const RECEIPT_BUCKET = "maintenance-receipts";
const RECEIPT_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
  "application/pdf",
]);
const RECEIPT_MAX_BYTES = 20 * 1024 * 1024;

type ReceiptMeta = {
  storagePath: string;
  name: string;
  type: string;
  size: number;
};

/** Validate one uploaded-receipt metadata blob; throws on bad mime/size. */
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

function sanitizeFilename(name: string): string {
  const trimmed = name.trim().slice(0, 80);
  return (
    trimmed
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") || "upload"
  );
}

export type CreateUploadUrlResult =
  | { ok: true; bucket: string; path: string; token: string }
  | { ok: false; reason: string };

/**
 * Mint a signed upload URL so the CLIENT can upload a receipt's bytes directly
 * to the private maintenance-receipts bucket — bypassing the Server Action /
 * Vercel request-body limit that phone photos exceed. The path isn't tied to an
 * entry id (the entry is created afterward); the stored file_path is all the
 * read side needs. (Identical to the legacy maintenance flow.)
 */
export async function createReceiptUploadUrl(
  fileName: string,
  mimeType: string,
  sizeBytes: number,
): Promise<CreateUploadUrlResult> {
  try {
    if (!RECEIPT_MIME.has(mimeType)) {
      return {
        ok: false,
        reason: `Unsupported file "${fileName}" (${mimeType || "unknown"}). Use JPG, PNG, HEIC, WEBP, or PDF.`,
      };
    }
    if (sizeBytes > RECEIPT_MAX_BYTES) {
      return {
        ok: false,
        reason: `"${fileName}" is too large (${Math.round(sizeBytes / 1024 / 1024)} MB). Max 20 MB.`,
      };
    }
    const group = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const prefix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const path = `maintenance/uploads/${group}/${prefix}-${sanitizeFilename(fileName)}`;
    const sb = createServiceRoleClient();
    const { data, error } = await sb.storage
      .from(RECEIPT_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      return {
        ok: false,
        reason: `Could not start upload: ${error?.message ?? "unknown error"}`,
      };
    }
    return { ok: true, bucket: RECEIPT_BUCKET, path: data.path, token: data.token };
  } catch (e) {
    console.error("[createReceiptUploadUrl] failed:", e);
    return {
      ok: false,
      reason: `Could not start upload: ${e instanceof Error ? e.message : "unexpected error"}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Shared field parsing for the log-repair form.

type RepairFields = {
  description: string;
  odometer: number | null;
  serviceDate: string;
  cost: number | null;
  notes: string | null;
  position: string | null;
  partGroup: string | null;
  reminderInterval: number | null;
};

function parseRepairFields(fd: FormData): RepairFields {
  const description = str(fd, "description");
  if (!description) throw new Error("Enter what was repaired or serviced.");

  const odometer = intOrNull(fd, "odometer");
  if (odometer != null && odometer < 0) {
    throw new Error("Odometer can't be negative.");
  }

  const serviceDate =
    str(fd, "service_date") ?? new Date().toISOString().slice(0, 10);

  const rawPos = str(fd, "position");
  const position = rawPos && isPosition(rawPos) ? rawPos : null;

  let partGroup = str(fd, "part_group");
  const reminderInterval = intOrNull(fd, "reminder_interval_miles");

  // A set-part (has a position) or a reminder needs a group to hang off of;
  // default it to the description so simple reminders need no extra field.
  if (!partGroup && (position || (reminderInterval != null && reminderInterval > 0))) {
    partGroup = description;
  }

  return {
    description: description.slice(0, 200),
    odometer,
    serviceDate,
    cost: moneyOrNull(str(fd, "cost")),
    notes: str(fd, "notes"),
    position,
    partGroup: partGroup ? partGroup.slice(0, 120) : null,
    reminderInterval:
      reminderInterval != null && reminderInterval > 0 ? reminderInterval : null,
  };
}

/**
 * Create/refresh the reminder overlay for a part_group. Called after an entry
 * with a reminder interval is saved. Matches an existing reminder case-
 * insensitively by part_group; updates its interval + un-dismisses it, or
 * inserts a new one. The reminder's next-due derives from the group's entries,
 * so nothing else needs writing here.
 */
async function upsertReminder(
  sb: SB,
  partGroup: string,
  intervalMiles: number,
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
        dismissed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await sb.from("repair_reminders").insert({
      label: partGroup,
      part_group: partGroup,
      interval_miles: intervalMiles,
    });
  }
}

/** Insert repair_attachments rows for freshly-uploaded receipts. */
async function persistReceipts(
  sb: SB,
  entryId: string,
  receipts: ReceiptMeta[],
): Promise<void> {
  for (const r of receipts) {
    const { error } = await sb.from("repair_attachments").insert({
      entry_id: entryId,
      file_path: r.storagePath,
      thumb_path: null,
      file_name: r.name.slice(0, 240),
      content_type: r.type || null,
      size_bytes: r.size,
    });
    if (error) {
      await sb.storage.from(RECEIPT_BUCKET).remove([r.storagePath]);
      throw new Error(`Could not record receipt ("${r.name}"): ${error.message}`);
    }
  }
}

// Canonical unordered link pair (a < b) so the same relation isn't stored twice.
function linkPair(x: string, y: string): { a: string; b: string } {
  return x < y ? { a: x, b: y } : { a: y, b: x };
}

async function linkEntries(sb: SB, entryId: string, otherId: string): Promise<void> {
  if (!otherId || otherId === entryId) return;
  const { a, b } = linkPair(entryId, otherId);
  // Ignore duplicate-pair unique violations (already linked).
  const { error } = await sb.from("repair_links").insert({ a_id: a, b_id: b });
  if (error && !/duplicate|unique/i.test(error.message)) {
    throw new Error(`Could not link repair: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Entry CRUD.

/** Log a new repair entry (+ receipts, optional reminder, optional links). */
export async function logRepair(formData: FormData): Promise<void> {
  const sb = createServiceRoleClient();
  const f = parseRepairFields(formData);
  const receipts = parseReceipts(formData);

  const { data: entry, error } = await sb
    .from("repair_entries")
    .insert({
      description: f.description,
      odometer: f.odometer,
      service_date: f.serviceDate,
      cost: f.cost,
      notes: f.notes,
      position: f.position,
      part_group: f.partGroup,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !entry) {
    throw new Error(`Could not save repair: ${error?.message ?? "unknown error"}`);
  }

  await persistReceipts(sb, entry.id, receipts);

  if (f.reminderInterval != null && f.partGroup) {
    await upsertReminder(sb, f.partGroup, f.reminderInterval);
  }

  for (const id of jsonArray(formData, "related_ids")) {
    if (typeof id === "string") await linkEntries(sb, entry.id, id);
  }

  revalidatePath("/admin/maintenance");
  revalidatePath("/admin");
}

/** Edit an existing repair entry (+ add/remove receipts, refresh reminder). */
export async function updateRepair(
  entryId: string,
  formData: FormData,
): Promise<void> {
  if (!entryId) throw new Error("Missing repair entry.");
  const sb = createServiceRoleClient();
  const f = parseRepairFields(formData);
  const receipts = parseReceipts(formData);

  const { error: updErr } = await sb
    .from("repair_entries")
    .update({
      description: f.description,
      odometer: f.odometer,
      service_date: f.serviceDate,
      cost: f.cost,
      notes: f.notes,
      position: f.position,
      part_group: f.partGroup,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entryId)
    .is("deleted_at", null);
  if (updErr) throw new Error(`Could not update repair: ${updErr.message}`);

  // Remove receipts the user deleted (storage first, then rows).
  const removeIds = jsonArray(formData, "remove_receipt_ids").filter(
    (v): v is string => typeof v === "string",
  );
  if (removeIds.length > 0) {
    const { data: rows } = await sb
      .from("repair_attachments")
      .select("id, file_path, thumb_path")
      .eq("entry_id", entryId)
      .in("id", removeIds)
      .returns<{ id: string; file_path: string; thumb_path: string | null }[]>();
    const paths = (rows ?? [])
      .flatMap((r) => [r.file_path, r.thumb_path])
      .filter((p): p is string => !!p);
    if (paths.length > 0) await sb.storage.from(RECEIPT_BUCKET).remove(paths);
    if (rows && rows.length > 0) {
      await sb
        .from("repair_attachments")
        .delete()
        .eq("entry_id", entryId)
        .in("id", rows.map((r) => r.id));
    }
  }

  await persistReceipts(sb, entryId, receipts);

  if (f.reminderInterval != null && f.partGroup) {
    await upsertReminder(sb, f.partGroup, f.reminderInterval);
  }

  revalidatePath("/admin/maintenance");
  revalidatePath(`/admin/maintenance/${entryId}`);
  revalidatePath("/admin");
}

/**
 * Delete a repair entry. Cascades remove its receipts + links (FKs); we
 * best-effort delete the receipt storage objects first so the private bucket
 * doesn't accumulate orphans.
 */
export async function deleteRepair(entryId: string): Promise<void> {
  if (!entryId) throw new Error("Missing repair entry.");
  const sb = createServiceRoleClient();

  const { data: atts } = await sb
    .from("repair_attachments")
    .select("file_path, thumb_path")
    .eq("entry_id", entryId)
    .returns<{ file_path: string | null; thumb_path: string | null }[]>();
  const paths = (atts ?? [])
    .flatMap((a) => [a.file_path, a.thumb_path])
    .filter((p): p is string => !!p);
  if (paths.length > 0) await sb.storage.from(RECEIPT_BUCKET).remove(paths);

  const { error } = await sb.from("repair_entries").delete().eq("id", entryId);
  if (error) throw new Error(`Could not delete repair: ${error.message}`);

  revalidatePath("/admin/maintenance");
  revalidatePath("/admin");
}

// ---------------------------------------------------------------------------
// Related links.

export async function attachRelated(
  entryId: string,
  otherId: string,
): Promise<void> {
  const sb = createServiceRoleClient();
  await linkEntries(sb, entryId, otherId);
  revalidatePath(`/admin/maintenance/${entryId}`);
  revalidatePath(`/admin/maintenance/${otherId}`);
}

export async function detachRelated(
  entryId: string,
  otherId: string,
): Promise<void> {
  if (!entryId || !otherId) return;
  const sb = createServiceRoleClient();
  const { a, b } = linkPair(entryId, otherId);
  const { error } = await sb
    .from("repair_links")
    .delete()
    .eq("a_id", a)
    .eq("b_id", b);
  if (error) throw new Error(`Could not unlink repair: ${error.message}`);
  revalidatePath(`/admin/maintenance/${entryId}`);
  revalidatePath(`/admin/maintenance/${otherId}`);
}

// ---------------------------------------------------------------------------
// Reminders.

/** Turn a reminder off (or back on) without touching the log history. */
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
  revalidatePath("/admin/maintenance");
  revalidatePath("/admin");
}
