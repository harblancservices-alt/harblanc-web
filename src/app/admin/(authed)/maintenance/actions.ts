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

// Expense category was removed from the maintenance UI. The
// maintenance_log.category column stays in the DB but is no longer written.

// Payment method was removed from the maintenance UI. The
// maintenance_log.payment_method column stays in place but is no longer
// written or read.

type SB = ReturnType<typeof createServiceRoleClient>;

type ReceiptMeta = {
  storagePath: string;
  name: string;
  type: string;
  size: number;
};

/**
 * One expense LINE on a service: a description + amount, plus its receipts.
 * `newReceipts` were uploaded directly to storage this session (only metadata
 * reaches the action — no bytes). `existingReceiptIds` (edit mode) are
 * attachment ids already saved that belong to this line.
 */
type ExpenseInput = {
  description: string | null;
  amount: number | null;
  newReceipts: ReceiptMeta[];
  existingReceiptIds: string[];
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

/**
 * Parse the `expenses` JSON the client sends — the expense lines for a service.
 * Each line carries description + amount + its receipts. Fully-empty lines (no
 * description, amount, or receipts) are dropped. Throws on a bad receipt so the
 * modal surfaces it inline.
 */
function parseExpenses(formData: FormData): ExpenseInput[] {
  const raw = str(formData, "expenses");
  if (!raw) return [];
  let parsed: unknown = [];
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Could not read the expense lines.");
  }
  if (!Array.isArray(parsed)) return [];
  const out: ExpenseInput[] = [];
  for (const e of parsed as Record<string, unknown>[]) {
    const description =
      (typeof e.description === "string"
        ? e.description.trim().slice(0, 200)
        : "") || null;
    const amount = moneyOrNull(
      typeof e.amount === "string"
        ? e.amount
        : typeof e.amount === "number"
          ? String(e.amount)
          : null,
    );
    const newReceipts: ReceiptMeta[] = [];
    if (Array.isArray(e.newReceipts)) {
      for (const r of e.newReceipts as Record<string, unknown>[]) {
        const meta = validateReceiptMeta(r);
        if (meta) newReceipts.push(meta);
      }
    }
    const existingReceiptIds = Array.isArray(e.existingReceiptIds)
      ? (e.existingReceiptIds as unknown[]).filter(
          (v): v is string => typeof v === "string",
        )
      : [];
    if (
      description == null &&
      amount == null &&
      newReceipts.length === 0 &&
      existingReceiptIds.length === 0
    ) {
      continue; // drop fully-empty line
    }
    out.push({ description, amount, newReceipts, existingReceiptIds });
  }
  return out;
}

/**
 * Create one maintenance_expenses row per expense line on a log, then tie each
 * receipt to its line via maintenance_attachments.expense_id — newly-uploaded
 * receipts get inserted with the line's id, and edit-mode receipts that were
 * kept get re-pointed to it. Shared by add + update.
 */
async function persistExpenseLines(
  sb: SB,
  logId: string,
  expenses: ExpenseInput[],
): Promise<void> {
  for (const e of expenses) {
    const { data: exp, error: expErr } = await sb
      .from("maintenance_expenses")
      .insert({ log_id: logId, description: e.description, amount: e.amount })
      .select("id")
      .single<{ id: string }>();
    if (expErr || !exp) {
      throw new Error(
        `Could not save expense: ${expErr?.message ?? "unknown error"}`,
      );
    }
    for (const r of e.newReceipts) {
      const { error: attErr } = await sb.from("maintenance_attachments").insert({
        log_id: logId,
        expense_id: exp.id,
        file_path: r.storagePath,
        thumb_path: null,
        file_name: r.name.slice(0, 240),
        content_type: r.type || null,
        size_bytes: r.size,
        amount: null,
        label: null,
      });
      if (attErr) {
        await sb.storage.from(RECEIPT_BUCKET).remove([r.storagePath]);
        throw new Error(
          `Could not record receipt ("${r.name}"): ${attErr.message}`,
        );
      }
    }
    if (e.existingReceiptIds.length > 0) {
      const { error: relErr } = await sb
        .from("maintenance_attachments")
        .update({ expense_id: exp.id })
        .eq("log_id", logId)
        .in("id", e.existingReceiptIds);
      if (relErr) {
        throw new Error(`Could not link receipts: ${relErr.message}`);
      }
    }
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

  // Expense lines (each with optional receipts already uploaded to storage by
  // the client). The service total auto-sums the line amounts. (Category +
  // payment method removed from the UI — those columns are no longer written.)
  const expenses = parseExpenses(formData);
  const total = expenses.reduce((s, e) => s + (e.amount ?? 0), 0);
  const totalCost = total > 0 ? Math.round(total * 100) / 100 : null;

  // 1. Insert the log row (need its id for the expense + receipt rows).
  const { data: log, error: logErr } = await sb
    .from("maintenance_log")
    .insert({
      item_id: itemId,
      service_name: serviceName,
      service_odo: odo,
      service_date: date,
      notes,
      total_cost: totalCost,
    })
    .select("id")
    .single<{ id: string }>();
  if (logErr || !log) {
    throw new Error(`Could not save service: ${logErr?.message ?? "unknown error"}`);
  }

  // 2. Logging a service ALWAYS overrides the item's current reading: set its
  //    last-service odometer/date to the entered values (no matter the prior
  //    baseline) so next-due recomputes. This is why there's no "reset
  //    baseline" button — logging a service is the reset. (Editing a past
  //    entry, in updateMaintenanceService, deliberately does NOT do this.)
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

  // 3. Create each expense line and tie its receipts to it.
  await persistExpenseLines(sb, log.id, expenses);

  revalidatePath("/admin/maintenance");
  if (itemId) revalidatePath(`/admin/maintenance/${itemId}`);
  revalidatePath("/admin");
}

/**
 * Edit an existing service record: update its maintenance_log row (type,
 * date, odometer, notes, total cost), add new
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

  // Expense lines drive the total now (manual total + payment method + category
  // removed from the UI; those columns are no longer written).
  const expenses = parseExpenses(formData);
  const total = expenses.reduce((s, e) => s + (e.amount ?? 0), 0);
  const totalCost = total > 0 ? Math.round(total * 100) / 100 : null;

  // 1. Update the log row.
  const { error: updErr } = await sb
    .from("maintenance_log")
    .update({
      item_id: itemId,
      service_name: serviceName,
      service_odo: odo,
      service_date: date,
      notes,
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

  // 3. Rebuild this log's expense lines from the payload: delete the old rows
  //    (receipts survive — attachment.expense_id is set NULL on cascade) and
  //    recreate, re-tying each receipt (kept or newly uploaded) to its line.
  const { error: delExpErr } = await sb
    .from("maintenance_expenses")
    .delete()
    .eq("log_id", logId);
  if (delExpErr) {
    throw new Error(`Could not update expenses: ${delExpErr.message}`);
  }
  await persistExpenseLines(sb, logId, expenses);

  revalidatePath("/admin/maintenance");
  revalidatePath(`/admin/maintenance/service/${logId}`);
  if (itemId) revalidatePath(`/admin/maintenance/${itemId}`);
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
  revalidatePath(`/admin/maintenance/${itemId}`);
  revalidatePath("/admin"); // dashboard oil/fuel-filter widget
}

/**
 * Reset an item's last-service baseline — clears last_service_odo and
 * last_service_date so the item returns to "Set baseline" and the next-due
 * recalculates from the next service logged. Used from the item detail page
 * when Brent wants to start the interval clock over (e.g. a wrong odometer
 * was entered, or the schedule drifted). Does NOT touch the service log —
 * the logged history and its receipts/costs stay intact.
 */
export async function resetMaintenanceBaseline(itemId: string): Promise<void> {
  if (!itemId) throw new Error("Missing maintenance item.");
  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("maintenance_items")
    .update({
      last_service_odo: null,
      last_service_date: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .is("deleted_at", null);
  if (error) throw new Error(`Could not reset baseline: ${error.message}`);

  revalidatePath("/admin/maintenance");
  revalidatePath(`/admin/maintenance/${itemId}`);
  revalidatePath("/admin");
}

/**
 * Soft-delete a maintenance ITEM (set deleted_at) so it drops off the list and
 * its detail page 404s. Logged services for it stay in the global service
 * history (their item_id still points here, but the item is hidden). Lets Brent
 * remove items himself instead of asking for a SQL delete.
 */
export async function deleteMaintenanceItem(itemId: string): Promise<void> {
  if (!itemId) throw new Error("Missing maintenance item.");
  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("maintenance_items")
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .is("deleted_at", null);
  if (error) throw new Error(`Could not delete item: ${error.message}`);

  revalidatePath("/admin/maintenance");
  revalidatePath(`/admin/maintenance/${itemId}`);
  revalidatePath("/admin");
}

/**
 * Hard-delete a logged SERVICE entry (maintenance_log row). The DB FK cascades
 * remove its maintenance_expenses and maintenance_attachments rows; we also
 * best-effort delete the receipt storage objects first so the private bucket
 * doesn't accumulate orphans. The item's last-service baseline is NOT touched
 * (deleting a historical entry shouldn't move the schedule).
 */
export async function deleteMaintenanceService(logId: string): Promise<void> {
  if (!logId) throw new Error("Missing service entry.");
  const sb = createServiceRoleClient();

  // Grab item_id (for revalidation) + receipt paths (for storage cleanup)
  // before the row + its cascades disappear.
  const { data: logRow } = await sb
    .from("maintenance_log")
    .select("item_id")
    .eq("id", logId)
    .maybeSingle<{ item_id: string | null }>();

  const { data: atts } = await sb
    .from("maintenance_attachments")
    .select("file_path, thumb_path")
    .eq("log_id", logId)
    .returns<{ file_path: string | null; thumb_path: string | null }[]>();
  const paths = (atts ?? [])
    .flatMap((a) => [a.file_path, a.thumb_path])
    .filter((p): p is string => !!p);
  if (paths.length > 0) {
    await sb.storage.from(RECEIPT_BUCKET).remove(paths);
  }

  const { error } = await sb.from("maintenance_log").delete().eq("id", logId);
  if (error) throw new Error(`Could not delete service: ${error.message}`);

  revalidatePath("/admin/maintenance");
  revalidatePath(`/admin/maintenance/service/${logId}`);
  if (logRow?.item_id) revalidatePath(`/admin/maintenance/${logRow.item_id}`);
  revalidatePath("/admin");
}
