"use server";

import { revalidatePath } from "next/cache";
import {
  createCameraBatch as createCameraBatchShared,
  createCameraUploadUrl as createCameraUploadUrlShared,
  recordCameraPhoto as recordCameraPhotoShared,
  deleteCameraPhoto as deleteCameraPhotoShared,
  deleteCameraBatch as deleteCameraBatchShared,
  type CreateBatchResult,
  type UploadUrlResult,
  type RecordPhotoResult,
  type SimpleResult,
} from "@/lib/domain/camera";

/**
 * Camera capture writes for /tms-v2 — thin wrappers around the neutral
 * signed-upload-URL + batch/photo core (src/lib/domain/camera.ts), shared
 * with /admin's own wrapper (src/app/admin/(authed)/camera/actions.ts),
 * same pattern as src/actions/tms-v2/documents.ts. /tms-v2 has no demo mode
 * of its own, so unlike admin's wrapper this one calls the shared core
 * directly with no demo gate. These wrappers only add /tms-v2's own
 * revalidatePath targets.
 */

function revalidateCameraPaths(batchId?: string) {
  revalidatePath("/tms-v2/camera");
  if (batchId) revalidatePath(`/tms-v2/camera/${batchId}`);
}

export async function createCameraBatch(name?: string): Promise<CreateBatchResult> {
  const res = await createCameraBatchShared(name);
  if (res.ok) revalidateCameraPaths();
  return res;
}

export async function createCameraUploadUrl(batchId: string): Promise<UploadUrlResult> {
  return createCameraUploadUrlShared(batchId);
}

export async function recordCameraPhoto(batchId: string, storagePath: string, sizeBytes: number): Promise<RecordPhotoResult> {
  const res = await recordCameraPhotoShared(batchId, storagePath, sizeBytes);
  if (res.ok) revalidateCameraPaths(batchId);
  return res;
}

export async function deleteCameraPhoto(batchId: string, photoId: string): Promise<SimpleResult> {
  const res = await deleteCameraPhotoShared(batchId, photoId);
  if (res.ok) revalidateCameraPaths(batchId);
  return res;
}

export async function deleteCameraBatch(batchId: string): Promise<SimpleResult> {
  const res = await deleteCameraBatchShared(batchId);
  if (res.ok) revalidateCameraPaths();
  return res;
}
