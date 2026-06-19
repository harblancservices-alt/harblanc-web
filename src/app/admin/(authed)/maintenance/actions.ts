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

  // Validate every receipt up front so we don't half-create a record.
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  for (const f of files) {
    if (!RECEIPT_MIME.has(f.type)) {
      throw new Error(
        `Unsupported file "${f.name}" (${f.type || "unknown"}). Use JPG, PNG, HEIC, WEBP, or PDF.`,
      );
    }
    if (f.size > RECEIPT_MAX_BYTES) {
      throw new Error(
        `"${f.name}" is too large (${Math.round(f.size / 1024 / 1024)} MB). Max 20 MB.`,
      );
    }
  }

  // 1. Insert the log row (need its id for the receipt path).
  const { data: log, error: logErr } = await sb
    .from("maintenance_log")
    .insert({
      item_id: itemId,
      service_name: serviceName,
      service_odo: odo,
      service_date: date,
      notes,
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

  // 3. Upload each receipt → maintenance/{log_id}/{file}, record an attachment.
  for (const f of files) {
    const path = `maintenance/${log.id}/${crypto
      .randomUUID()
      .replace(/-/g, "")
      .slice(0, 12)}-${sanitizeFilename(f.name)}`;
    const bytes = new Uint8Array(await f.arrayBuffer());
    const { error: upErr } = await sb.storage
      .from(RECEIPT_BUCKET)
      .upload(path, bytes, { contentType: f.type, upsert: false });
    if (upErr) {
      throw new Error(`Receipt upload failed ("${f.name}"): ${upErr.message}`);
    }
    const { error: attErr } = await sb.from("maintenance_attachments").insert({
      log_id: log.id,
      file_path: path,
      file_name: f.name.slice(0, 240),
      content_type: f.type,
      size_bytes: f.size,
    });
    if (attErr) {
      await sb.storage.from(RECEIPT_BUCKET).remove([path]);
      throw new Error(`Could not record receipt ("${f.name}"): ${attErr.message}`);
    }
  }

  revalidatePath("/admin/maintenance");
  revalidatePath("/admin");
}

/**
 * Log a completed service: append a maintenance_log row and roll the item's
 * last-service bookend forward so the next-due recalculates.
 */
export async function logMaintenance(formData: FormData): Promise<void> {
  const sb = createServiceRoleClient();

  const itemId = str(formData, "item_id");
  if (!itemId) throw new Error("Missing maintenance item.");

  const odo = intOrNull(formData, "service_odo");
  if (odo == null || odo < 0) {
    throw new Error("Enter the odometer reading the service was done at.");
  }

  const date = str(formData, "service_date") ?? new Date().toISOString().slice(0, 10);
  const notes = str(formData, "notes");

  const { error: logErr } = await sb.from("maintenance_log").insert({
    item_id: itemId,
    service_odo: odo,
    service_date: date,
    notes,
  });
  if (logErr) throw new Error(`Could not log service: ${logErr.message}`);

  const { error: updErr } = await sb
    .from("maintenance_items")
    .update({
      last_service_odo: odo,
      last_service_date: date,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .is("deleted_at", null);
  if (updErr) throw new Error(`Could not update item: ${updErr.message}`);

  revalidatePath("/admin/maintenance");
  revalidatePath("/admin"); // dashboard oil/fuel-filter widget
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
