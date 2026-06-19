"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Maintenance actions. Service-role client (admin-only, behind the authed
 * shell), matching the loads/brokers posture. Actions throw on failure so
 * the modal surfaces the error inline instead of failing silently.
 */

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

// Parse a dollar amount string ("$1,250.50" → 1250.5). Null when blank/invalid
// or negative. Rounded to cents for numeric(10,2).
function moneyOrNull(raw: string | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned.length === 0) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

// Expense categories offered on the Add Service form (kept in sync with the
// client select). The category is stored verbatim in maintenance_log.category.
const EXPENSE_CATEGORIES = new Set([
  "Suspension",
  "Tires",
  "Engine",
  "Drivetrain/Transmission",
  "Brakes",
  "Fluids & Filters",
  "Electrical",
  "Other",
]);

// Payment methods (kept in sync with the client select). Stored verbatim in
// maintenance_log.payment_method.
const PAYMENT_METHODS = new Set(["Cash", "Credit", "Debit", "Check", "Other"]);

type ReceiptMeta = {
  storagePath: string;
  name: string;
  type: string;
  size: number;
  amount: number | null;
  label: string | null;
};

/**
 * Parse the receipts JSON the client sends after uploading each file directly
 * to storage (no bytes in the action payload). Validates mime/size; throws on a
 * bad file so the modal surfaces it inline.
 */
function parseReceiptMetas(formData: FormData): ReceiptMeta[] {
  const out: ReceiptMeta[] = [];
  const raw = str(formData, "receipts");
  if (!raw) return out;
  let parsed: unknown = [];
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Could not read the uploaded receipts.");
  }
  if (!Array.isArray(parsed)) return out;
  for (const r of parsed as Record<string, unknown>[]) {
    const storagePath = typeof r.storagePath === "string" ? r.storagePath : "";
    if (!storagePath) continue;
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
    out.push({
      storagePath,
      name,
      type,
      size,
      amount: moneyOrNull(typeof r.amount === "string" ? r.amount : null),
      label:
        (typeof r.label === "string" ? r.label.trim().slice(0, 60) : "") || null,
    });
  }
  return out;
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
 * Vercel request-body limit that phone photos exceed. The path isn't tied to a
 * log id (the log is created later by addMaintenanceService); the stored
 * file_path is all the read side needs.
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

/**
 * Add a service record (from the top "Add Service" flow). The service type is
 * either a seeded maintenance_item (item_id set) or a custom typed name
 * (item_id null, service_name holds the text). Rolls a seeded item's
 * last-service bookend forward, and uploads any receipt files to the private
 * maintenance-receipts bucket, recording one maintenance_attachments row each.
 */
export async function addMaintenanceService(formData: FormData): Promise<void> {
  const sb = createServiceRoleClient();

  const odo = intOrNull(formData, "service_odo");
  if (odo == null || odo < 0) {
    throw new Error("Enter the odometer reading the service was done at.");
  }
  const date =
    str(formData, "service_date") ?? new Date().toISOString().slice(0, 10);
  const notes = str(formData, "notes");

  // Resolve the service type: a seeded item, or a custom typed name.
  const rawItemId = str(formData, "item_id");
  let itemId: string | null = null;
  let serviceName: string | null = null;
  if (rawItemId) {
    const { data: item } = await sb
      .from("maintenance_items")
      .select("id, name")
      .eq("id", rawItemId)
      .is("deleted_at", null)
      .maybeSingle<{ id: string; name: string }>();
    if (!item) throw new Error("That maintenance item no longer exists.");
    itemId = item.id;
    serviceName = item.name;
  } else {
    serviceName = str(formData, "service_name");
    if (!serviceName) {
      throw new Error("Pick a service type or enter a custom service name.");
    }
  }

  // Expense category + payment method (optional; ignored if unknown).
  const rawCategory = str(formData, "category");
  const category =
    rawCategory && EXPENSE_CATEGORIES.has(rawCategory) ? rawCategory : null;
  const rawPayment = str(formData, "payment_method");
  const paymentMethod =
    rawPayment && PAYMENT_METHODS.has(rawPayment) ? rawPayment : null;

  // Receipts were uploaded directly to storage by the client (bypassing the
  // body limit); the action receives only their metadata as JSON.
  const receipts = parseReceiptMetas(formData);

  // Total cost: a manual override wins; otherwise auto-sum the receipt amounts.
  const sumOfReceipts = receipts.reduce((s, r) => s + (r.amount ?? 0), 0);
  const overrideTotal = moneyOrNull(str(formData, "total_cost"));
  const totalCost =
    overrideTotal != null
      ? overrideTotal
      : sumOfReceipts > 0
        ? Math.round(sumOfReceipts * 100) / 100
        : null;

  // 1. Insert the log row (need its id for the receipt path).
  const { data: log, error: logErr } = await sb
    .from("maintenance_log")
    .insert({
      item_id: itemId,
      service_name: serviceName,
      service_odo: odo,
      service_date: date,
      notes,
      category,
      payment_method: paymentMethod,
      total_cost: totalCost,
    })
    .select("id")
    .single<{ id: string }>();
  if (logErr || !log) {
    throw new Error(`Could not save service: ${logErr?.message ?? "unknown error"}`);
  }

  // 2. Roll the seeded item forward so next-due recalculates.
  if (itemId) {
    const { error: updErr } = await sb
      .from("maintenance_items")
      .update({
        last_service_odo: odo,
        last_service_date: date,
        updated_at: new Date().toISOString(),
      })
      .eq("id", itemId)
      .is("deleted_at", null);
    if (updErr) {
      throw new Error(`Service saved, but the item didn't update: ${updErr.message}`);
    }
  }

  // 3. Record one attachment row per receipt (already uploaded to storage by
  //    the client), carrying its own amount + label. No bytes, no thumbnails.
  for (const r of receipts) {
    const { error: attErr } = await sb.from("maintenance_attachments").insert({
      log_id: log.id,
      file_path: r.storagePath,
      thumb_path: null,
      file_name: r.name.slice(0, 240),
      content_type: r.type || null,
      size_bytes: r.size,
      amount: r.amount,
      label: r.label,
    });
    if (attErr) {
      await sb.storage.from(RECEIPT_BUCKET).remove([r.storagePath]);
      throw new Error(`Could not record receipt ("${r.name}"): ${attErr.message}`);
    }
  }

  revalidatePath("/admin/maintenance");
  revalidatePath("/admin");
}

/**
 * Edit an existing service record: update its maintenance_log row (type,
 * category, payment method, date, odometer, notes, total cost), add new
 * receipts (uploaded directly to storage by the client), and remove receipts
 * the user deleted. Does NOT roll the item's last-service bookend — editing a
 * historical entry shouldn't move the schedule; it's for fixing cost / adding
 * receipts after the fact.
 */
export async function updateMaintenanceService(
  logId: string,
  formData: FormData,
): Promise<void> {
  const sb = createServiceRoleClient();

  const odo = intOrNull(formData, "service_odo");
  if (odo == null || odo < 0) {
    throw new Error("Enter the odometer reading the service was done at.");
  }
  const date =
    str(formData, "service_date") ?? new Date().toISOString().slice(0, 10);
  const notes = str(formData, "notes");

  // Service type: a seeded item, or a custom typed name.
  const rawItemId = str(formData, "item_id");
  let itemId: string | null = null;
  let serviceName: string | null = null;
  if (rawItemId) {
    const { data: item } = await sb
      .from("maintenance_items")
      .select("id, name")
      .eq("id", rawItemId)
      .is("deleted_at", null)
      .maybeSingle<{ id: string; name: string }>();
    if (!item) throw new Error("That maintenance item no longer exists.");
    itemId = item.id;
    serviceName = item.name;
  } else {
    serviceName = str(formData, "service_name");
    if (!serviceName) {
      throw new Error("Pick a service type or enter a custom service name.");
    }
  }

  const rawCategory = str(formData, "category");
  const category =
    rawCategory && EXPENSE_CATEGORIES.has(rawCategory) ? rawCategory : null;
  const rawPayment = str(formData, "payment_method");
  const paymentMethod =
    rawPayment && PAYMENT_METHODS.has(rawPayment) ? rawPayment : null;
  const totalCost = moneyOrNull(str(formData, "total_cost"));

  // 1. Update the log row.
  const { error: updErr } = await sb
    .from("maintenance_log")
    .update({
      item_id: itemId,
      service_name: serviceName,
      service_odo: odo,
      service_date: date,
      notes,
      category,
      payment_method: paymentMethod,
      total_cost: totalCost,
    })
    .eq("id", logId);
  if (updErr) {
    throw new Error(`Could not update service: ${updErr.message}`);
  }

  // 2. Remove attachments the user deleted (scoped to this log).
  let removeIds: string[] = [];
  const rawRemove = str(formData, "remove_attachment_ids");
  if (rawRemove) {
    try {
      const parsed = JSON.parse(rawRemove);
      if (Array.isArray(parsed)) {
        removeIds = parsed.filter((v): v is string => typeof v === "string");
      }
    } catch {
      // ignore malformed list — just don't remove anything
    }
  }
  if (removeIds.length > 0) {
    const { data: rows } = await sb
      .from("maintenance_attachments")
      .select("id, file_path")
      .eq("log_id", logId)
      .in("id", removeIds)
      .returns<{ id: string; file_path: string }[]>();
    const paths = (rows ?? []).map((r) => r.file_path).filter(Boolean);
    if (paths.length > 0) {
      await sb.storage.from(RECEIPT_BUCKET).remove(paths);
    }
    if (rows && rows.length > 0) {
      await sb
        .from("maintenance_attachments")
        .delete()
        .eq("log_id", logId)
        .in(
          "id",
          rows.map((r) => r.id),
        );
    }
  }

  // 3. Insert new receipts (already uploaded to storage by the client).
  const newReceipts = parseReceiptMetas(formData);
  for (const r of newReceipts) {
    const { error: attErr } = await sb.from("maintenance_attachments").insert({
      log_id: logId,
      file_path: r.storagePath,
      thumb_path: null,
      file_name: r.name.slice(0, 240),
      content_type: r.type || null,
      size_bytes: r.size,
      amount: r.amount,
      label: r.label,
    });
    if (attErr) {
      await sb.storage.from(RECEIPT_BUCKET).remove([r.storagePath]);
      throw new Error(`Could not record receipt ("${r.name}"): ${attErr.message}`);
    }
  }

  revalidatePath("/admin/maintenance");
  revalidatePath("/admin");
}

/** Adjust an item's mileage interval (and optional notes). */
export async function updateMaintenanceInterval(
  formData: FormData,
): Promise<void> {
  const sb = createServiceRoleClient();

  const itemId = str(formData, "item_id");
  if (!itemId) throw new Error("Missing maintenance item.");

  const interval = intOrNull(formData, "interval_miles");
  if (interval == null || interval <= 0) {
    throw new Error("Interval must be a positive number of miles.");
  }
  const notes = str(formData, "notes");

  const { error } = await sb
    .from("maintenance_items")
    .update({
      interval_miles: interval,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .is("deleted_at", null);
  if (error) throw new Error(`Could not update interval: ${error.message}`);

  revalidatePath("/admin/maintenance");
  revalidatePath("/admin"); // dashboard oil/fuel-filter widget
}
