"use server";

import { revalidatePath } from "next/cache";
import { createCrmServerClient, requireCrmUser } from "@/lib/crm/auth";
import { defaultBatchLabel, buildManifest, type Manifest, type ManifestItem } from "./snapshotManifest";
import { MANIFEST_TTL_SECONDS, signPaths } from "./snapshot-data";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * SNAPSHOT — the writes.
 *
 * recordSnapshot is the hot path: it runs once per photo, four hundred times
 * a sitting, while Brent is still shooting. It does the least work that can
 * possibly be correct — one insert, no revalidatePath. Revalidating here
 * would rebuild the page on every shot and turn a camera into a slideshow.
 * The capture screen keeps its own optimistic list instead and the server
 * list is only re-read when somebody actually asks for it.
 */

/** Start a batch. The row exists BEFORE the first photo, which is what makes
 * the batch survive a dropped connection: its id is in the URL, so reloading
 * lands back in the same batch rather than starting a nameless new one. */
export async function createBatch(note?: string): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  const user = await requireCrmUser();
  if (user.role !== "owner") return { ok: false, error: "Admins only." };

  const supabase = await createCrmServerClient();

  const { data: existing } = await supabase
    .from("crm_snapshot_batches")
    .select("label")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(60);

  const label = defaultBatchLabel(
    new Date(),
    ((existing ?? []) as { label: string }[]).map((b) => b.label),
  );

  const { data, error } = await supabase
    .from("crm_snapshot_batches")
    .insert({
      org_id: user.orgId,
      user_id: user.id,
      label,
      note: note?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: "Could not start the batch." };

  revalidatePath("/crm/admin/snapshot");
  return { ok: true, id: data.id as string };
}

/**
 * Record one captured photo. Called after the browser has already put the
 * file in storage — the file never passes through the server, same mechanism
 * as BolSection and CommodityPhotoTiles.
 *
 * `seq` comes from the client because the client is the only thing that
 * knows the order the shutter actually fired in; uploads finish out of order
 * under concurrency. There is no unique constraint on it — a duplicate seq
 * from a retry is harmless, and losing shooting order is not.
 */
export async function recordSnapshot(input: {
  batchId: string;
  seq: number;
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireCrmUser();
  if (user.role !== "owner") return { ok: false, error: "Admins only." };

  const supabase = await createCrmServerClient();
  const { data, error } = await supabase
    .from("crm_snapshots")
    .insert({
      org_id: user.orgId,
      batch_id: input.batchId,
      user_id: user.id,
      seq: input.seq,
      file_name: input.fileName,
      storage_path: input.storagePath,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: "Could not save that shot." };
  // Deliberately no revalidatePath — see this file's header.
  return { ok: true, id: data.id as string };
}

/** Soft-delete a bad shot. The storage object stays (recoverable), the same
 * call deleteBolDocument and deleteCommodityPhoto make. */
export async function deleteSnapshot(id: string, batchId: string): Promise<ActionResult> {
  const user = await requireCrmUser();
  if (user.role !== "owner") return { ok: false, error: "Admins only." };

  const supabase = await createCrmServerClient();
  const { error } = await supabase
    .from("crm_snapshots")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { ok: false, error: "Could not delete that shot." };
  revalidatePath(`/crm/admin/snapshot/${batchId}`);
  return { ok: true };
}

/** Close a batch (done shooting) or reopen it. Closing is a marker for the
 * parsing session, not a lock — a reopened batch takes more photos. */
export async function setBatchClosed(batchId: string, closed: boolean): Promise<ActionResult> {
  const user = await requireCrmUser();
  if (user.role !== "owner") return { ok: false, error: "Admins only." };

  const supabase = await createCrmServerClient();
  const { error } = await supabase
    .from("crm_snapshot_batches")
    .update({ closed_at: closed ? new Date().toISOString() : null })
    .eq("id", batchId);

  if (error) return { ok: false, error: "Could not update the batch." };
  revalidatePath(`/crm/admin/snapshot/${batchId}`);
  revalidatePath("/crm/admin/snapshot");
  return { ok: true };
}

export async function renameBatch(batchId: string, label: string): Promise<ActionResult> {
  const user = await requireCrmUser();
  if (user.role !== "owner") return { ok: false, error: "Admins only." };
  const trimmed = label.trim();
  if (!trimmed) return { ok: false, error: "Give the batch a name." };

  const supabase = await createCrmServerClient();
  const { error } = await supabase
    .from("crm_snapshot_batches")
    .update({ label: trimmed })
    .eq("id", batchId);

  if (error) return { ok: false, error: "Could not rename the batch." };
  revalidatePath(`/crm/admin/snapshot/${batchId}`);
  revalidatePath("/crm/admin/snapshot");
  return { ok: true };
}

/**
 * The handoff. Every UNPARSED photo in the batch with a long-lived signed
 * URL, in shooting order, plus the contract telling a cold session how to
 * mark work done.
 *
 * Generated on demand rather than stored, because signed URLs expire — a
 * manifest saved yesterday is a list of dead links, which is worse than no
 * manifest at all.
 */
export async function batchManifest(
  batchId: string,
): Promise<{ ok: true; manifest: Manifest } | { ok: false; error: string }> {
  const user = await requireCrmUser();
  if (user.role !== "owner") return { ok: false, error: "Admins only." };

  const supabase = await createCrmServerClient();

  const { data: batchRow } = await supabase
    .from("crm_snapshot_batches")
    .select("id, label, note, created_at, closed_at")
    .eq("id", batchId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!batchRow) return { ok: false, error: "That batch is gone." };

  const { count: total } = await supabase
    .from("crm_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId)
    .is("deleted_at", null);

  const { data } = await supabase
    .from("crm_snapshots")
    .select("id, seq, file_name, storage_path, captured_at")
    .eq("batch_id", batchId)
    .is("deleted_at", null)
    .is("parsed_at", null)
    .order("seq", { ascending: true });

  const rows = (data ?? []) as {
    id: string;
    seq: number;
    file_name: string;
    storage_path: string;
    captured_at: string;
  }[];

  const signed = await signPaths(rows.map((r) => r.storage_path), MANIFEST_TTL_SECONDS);

  const items: ManifestItem[] = rows.map((r) => ({
    id: r.id,
    seq: r.seq,
    fileName: r.file_name,
    storagePath: r.storage_path,
    capturedAt: r.captured_at,
    url: signed.get(r.storage_path) ?? null,
  }));

  return {
    ok: true,
    manifest: buildManifest({
      batch: {
        id: batchRow.id as string,
        label: batchRow.label as string,
        note: (batchRow.note as string | null) ?? null,
        createdAt: batchRow.created_at as string,
        closedAt: (batchRow.closed_at as string | null) ?? null,
      },
      items,
      total: total ?? items.length,
      now: new Date(),
      ttlSeconds: MANIFEST_TTL_SECONDS,
    }),
  };
}
