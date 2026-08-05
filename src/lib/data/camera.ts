import { isDemoMode } from "@/lib/admin/demo";
import { getBatchWithPhotos, listBatchesWithCounts } from "@/lib/camera/batches";
import type { BatchDetail, BatchSummary } from "@/lib/camera/shared";

export type { BatchDetail, BatchPhoto, BatchSummary } from "@/lib/camera/shared";

/**
 * tms-v2's read-only entry point onto the existing Camera feature
 * (`lib/camera/*`, shared with `/admin`, unchanged). Adds only the
 * `isDemoMode()` guard — matching the exact precedent `/admin/camera`'s own
 * `page.tsx` already uses (never query real data in demo mode) — and stays
 * outside `DataSource` for the same reason `lib/data/files.ts` does: Camera
 * isn't part of that shared interface's method set yet.
 *
 * `listBatchesWithCounts()`/`getBatchWithPhotos()` are already resilient to
 * `camera_batches`/`camera_photos` not existing on prod (degrade to
 * empty/null on a missing-table error, per `lib/camera/shared.ts`'s
 * `isMissingTable()`) — that behavior is preserved as-is here.
 */
export async function listCameraBatches(): Promise<BatchSummary[]> {
  if (await isDemoMode()) return [];
  return listBatchesWithCounts();
}

export async function getCameraBatch(batchId: string): Promise<BatchDetail | null> {
  if (await isDemoMode()) return null;
  return getBatchWithPhotos(batchId);
}
