"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { blockedByDemo } from "@/lib/admin/demo";

const RETENTION_DAYS = 30;

export async function softDeleteApplication(id: string): Promise<void> {
  if (await blockedByDemo()) redirect("/admin/operations?tab=applications"); // DEMO: no-op.
  await requireAdmin();
  const sb = createServiceRoleClient();
  const now = new Date();
  const deleteAfter = new Date(
    now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  const { error } = await sb
    .from("applications")
    .update({
      deleted_at: now.toISOString(),
      delete_after: deleteAfter.toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Soft delete failed: ${error.message}`);
  }

  revalidatePath("/admin/operations");
  revalidatePath("/admin/applications/trash");
  revalidatePath(`/admin/applications/${id}`);
  revalidatePath("/admin");
  redirect("/admin/operations?tab=applications");
}

export async function restoreApplication(id: string): Promise<void> {
  if (await blockedByDemo()) redirect("/admin/operations?tab=applications"); // DEMO: no-op.
  await requireAdmin();
  const sb = createServiceRoleClient();

  const { error } = await sb
    .from("applications")
    .update({
      deleted_at: null,
      delete_after: null,
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Restore failed: ${error.message}`);
  }

  revalidatePath("/admin/operations");
  revalidatePath("/admin/applications/trash");
  revalidatePath(`/admin/applications/${id}`);
  revalidatePath("/admin");
  redirect("/admin/operations?tab=applications");
}

export async function permanentlyDeleteApplication(id: string): Promise<void> {
  if (await blockedByDemo()) redirect("/admin/applications/trash"); // DEMO: no-op.
  await requireAdmin();
  const sb = createServiceRoleClient();

  const { data: row, error: readError } = await sb
    .from("applications")
    .select("deleted_at")
    .eq("id", id)
    .maybeSingle<{ deleted_at: string | null }>();

  if (readError) {
    throw new Error(`Lookup failed: ${readError.message}`);
  }
  if (!row) {
    throw new Error("Application not found.");
  }
  if (row.deleted_at === null) {
    throw new Error(
      "Cannot permanently delete an active application. Move it to trash first.",
    );
  }

  const { error: deleteError } = await sb
    .from("applications")
    .delete()
    .eq("id", id);

  if (deleteError) {
    throw new Error(`Permanent delete failed: ${deleteError.message}`);
  }

  revalidatePath("/admin/applications");
  revalidatePath("/admin/applications/trash");
  revalidatePath("/admin");
  redirect("/admin/applications/trash");
}

/* ────────────────────────────────────────────────────────────── */
/* Batch variants for bulk selection in list views.               */
/* ────────────────────────────────────────────────────────────── */

function readIds(formData: FormData): string[] {
  return formData
    .getAll("ids")
    .map((v) => String(v))
    .filter((s) => s.length > 0);
}

export async function softDeleteApplications(
  formData: FormData,
): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  await requireAdmin();
  const ids = readIds(formData);
  if (ids.length === 0) return;

  const sb = createServiceRoleClient();
  const now = new Date();
  const deleteAfter = new Date(
    now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  const { error } = await sb
    .from("applications")
    .update({
      deleted_at: now.toISOString(),
      delete_after: deleteAfter.toISOString(),
    })
    .in("id", ids);

  if (error) {
    throw new Error(`Bulk soft delete failed: ${error.message}`);
  }

  revalidatePath("/admin/applications");
  revalidatePath("/admin/applications/trash");
  revalidatePath("/admin");
}

export async function restoreApplications(formData: FormData): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  await requireAdmin();
  const ids = readIds(formData);
  if (ids.length === 0) return;

  const sb = createServiceRoleClient();

  const { error } = await sb
    .from("applications")
    .update({ deleted_at: null, delete_after: null })
    .in("id", ids);

  if (error) {
    throw new Error(`Bulk restore failed: ${error.message}`);
  }

  revalidatePath("/admin/applications");
  revalidatePath("/admin/applications/trash");
  revalidatePath("/admin");
}

export async function permanentlyDeleteApplications(
  formData: FormData,
): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  await requireAdmin();
  const ids = readIds(formData);
  if (ids.length === 0) return;

  const sb = createServiceRoleClient();

  const { data: rows, error: readError } = await sb
    .from("applications")
    .select("id, deleted_at")
    .in("id", ids)
    .returns<{ id: string; deleted_at: string | null }[]>();

  if (readError) {
    throw new Error(`Lookup failed: ${readError.message}`);
  }
  if (!rows || rows.length === 0) {
    throw new Error("No matching applications found.");
  }

  const stillActive = rows.filter((r) => r.deleted_at === null);
  if (stillActive.length > 0) {
    throw new Error(
      `Cannot permanently delete: ${stillActive.length} of ${rows.length} selected row(s) are still active. Move them to trash first.`,
    );
  }

  const { error: deleteError } = await sb
    .from("applications")
    .delete()
    .in("id", ids);

  if (deleteError) {
    throw new Error(`Bulk permanent delete failed: ${deleteError.message}`);
  }

  revalidatePath("/admin/applications/trash");
  revalidatePath("/admin");
}
