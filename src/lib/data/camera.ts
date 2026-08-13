import { getBatchWithPhotos, listBatchesWithCounts } from "@/lib/camera/batches";
import type { BatchDetail, BatchSummary } from "@/lib/camera/shared";

export type { BatchDetail, BatchPhoto, BatchSummary } from "@/lib/camera/shared";

/**
 * tms-v2's read-only entry point onto the existing Camera feature
 * (`lib/camera/*`, shared with `/admin`, unchanged). Stays outside
 * `DataSource` for the same reason `lib/data/files.ts` does: Camera isn't
 * part of that shared interface's method set yet.
 *
 * `listBatchesWithCounts()`/`getBatchWithPhotos()` are already resilient to
 * `camera_batches`/`camera_photos` not existing on prod (degrade to
 * empty/null on a missing-table error, per `lib/camera/shared.ts`'s
 * `isMissingTable()`) — that behavior is preserved as-is here.
 */
export async function listCameraBatches(): Promise<BatchSummary[]> {
  return listBatchesWithCounts();
}

export async function getCameraBatch(batchId: string): Promise<BatchDetail | null> {
  return getBatchWithPhotos(batchId);
}
