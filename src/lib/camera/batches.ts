import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  CAMERA_BUCKET,
  SIGNED_URL_TTL_SECONDS,
  bolName,
  isMissingTable,
  type BatchDetail,
  type BatchSummary,
} from "./shared";

/**
 * Camera feature — SERVER-side data loading (service-role). Client-safe
 * helpers + types live in ./shared and are re-exported here for convenience.
 *
 * Photos are stored in the EXISTING private `load-documents` bucket (the same
 * one BOL/POD/rate-con uploads use), namespaced under a `camera/{batchId}/`
 * prefix so they never collide with per-load documents. The tables have RLS
 * enabled with no policies (deny-all to anon/auth).
 *
 * All loaders are RESILIENT to the tables not existing yet (before the
 * migration is applied to the live DB): a missing-relation error is treated
 * as "no batches / empty", never a crash.
 */

export {
  CAMERA_BUCKET,
  CAMERA_PREFIX,
  SIGNED_URL_TTL_SECONDS,
  bolName,
  isMissingTable,
} from "./shared";
export type { BatchSummary, BatchPhoto, BatchDetail } from "./shared";

/**
 * List every batch newest-first with its photo count. Returns [] if the
 * tables don't exist yet or on any load error (page treats it as empty).
 */
export async function listBatchesWithCounts(): Promise<BatchSummary[]> {
  const sb = createServiceRoleClient();

  const { data: batchRows, error: batchErr } = await sb
    .from("camera_batches")
    .select("id, name, created_at")
    .order("created_at", { ascending: false })
    .returns<{ id: string; name: string; created_at: string }[]>();

  if (batchErr) {
    if (isMissingTable(batchErr)) return [];
    console.error("[camera] listBatches failed:", batchErr);
    return [];
  }
  const batches = batchRows ?? [];
  if (batches.length === 0) return [];

  const { data: photoRows, error: photoErr } = await sb
    .from("camera_photos")
    .select("batch_id")
    .returns<{ batch_id: string }[]>();
  if (photoErr && !isMissingTable(photoErr)) {
    console.error("[camera] listBatches photo count failed:", photoErr);
  }

  const counts = new Map<string, number>();
  for (const p of photoRows ?? []) {
    counts.set(p.batch_id, (counts.get(p.batch_id) ?? 0) + 1);
  }

  return batches.map((b) => ({
    id: b.id,
    name: b.name,
    createdAt: b.created_at,
    photoCount: counts.get(b.id) ?? 0,
  }));
}

/**
 * Load one batch + its ordered photos, signing each for display. Returns null
 * if the batch doesn't exist or the tables aren't migrated yet.
 */
export async function getBatchWithPhotos(
  batchId: string,
): Promise<BatchDetail | null> {
  const sb = createServiceRoleClient();

  const { data: batch, error: batchErr } = await sb
    .from("camera_batches")
    .select("id, name, created_at")
    .eq("id", batchId)
    .maybeSingle<{ id: string; name: string; created_at: string }>();

  if (batchErr) {
    if (isMissingTable(batchErr)) return null;
    console.error("[camera] getBatch failed:", batchErr);
    return null;
  }
  if (!batch) return null;

  const { data: photoRows, error: photoErr } = await sb
    .from("camera_photos")
    .select("id, seq, storage_path")
    .eq("batch_id", batchId)
    .order("seq", { ascending: true })
    .returns<{ id: string; seq: number; storage_path: string }[]>();
  if (photoErr && !isMissingTable(photoErr)) {
    console.error("[camera] getBatch photos failed:", photoErr);
  }
  const rows = photoRows ?? [];

  // Sign all paths in one call for display.
  const urlByPath = new Map<string, string>();
  if (rows.length > 0) {
    const { data: signed } = await sb.storage
      .from(CAMERA_BUCKET)
      .createSignedUrls(rows.map((r) => r.storage_path), SIGNED_URL_TTL_SECONDS);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl && !s.error) urlByPath.set(s.path, s.signedUrl);
    }
  }

  return {
    id: batch.id,
    name: batch.name,
    createdAt: batch.created_at,
    photos: rows.map((r, i) => ({
      id: r.id,
      seq: r.seq,
      storagePath: r.storage_path,
      name: bolName(i + 1),
      url: urlByPath.get(r.storage_path) ?? null,
    })),
  };
}
