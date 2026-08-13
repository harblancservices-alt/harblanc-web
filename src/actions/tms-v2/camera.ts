"use server";

import { revalidatePath } from "next/cache";
import {
  createCameraBatchLive as legacyCreateCameraBatch,
  createCameraUploadUrlLive as legacyCreateCameraUploadUrl,
  recordCameraPhotoLive as legacyRecordCameraPhoto,
  deleteCameraPhotoLive as legacyDeleteCameraPhoto,
  deleteCameraBatchLive as legacyDeleteCameraBatch,
  type CreateBatchResult,
  type UploadUrlResult,
  type RecordPhotoResult,
  type SimpleResult,
} from "@/app/admin/(authed)/camera/actions";

/**
 * Camera capture writes for /tms-v2 — thin wrappers around V1's signed-
 * upload-URL + batch/photo action layer (src/app/admin/(authed)/camera/
 * actions.ts), same pattern as src/actions/tms-v2/documents.ts. Calls the
 * `*Live` variants (ungated core, no `blockedByDemo()` check) — /tms-v2 has
 * no demo mode of its own, so its writes must never be silently no-op'd by
 * admin's demo cookie. These wrappers only add /tms-v2's own
 * revalidatePath targets on top of V1's.
 */

function revalidateCameraPaths(batchId?: string) {
  revalidatePath("/tms-v2/camera");
  if (batchId) revalidatePath(`/tms-v2/camera/${batchId}`);
}

export async function createCameraBatch(name?: string): Promise<CreateBatchResult> {
  const res = await legacyCreateCameraBatch(name);
  if (res.ok) revalidateCameraPaths();
  return res;
}

export async function createCameraUploadUrl(batchId: string): Promise<UploadUrlResult> {
  return legacyCreateCameraUploadUrl(batchId);
}

export async function recordCameraPhoto(batchId: string, storagePath: string, sizeBytes: number): Promise<RecordPhotoResult> {
  const res = await legacyRecordCameraPhoto(batchId, storagePath, sizeBytes);
  if (res.ok) revalidateCameraPaths(batchId);
  return res;
}

export async function deleteCameraPhoto(batchId: string, photoId: string): Promise<SimpleResult> {
  const res = await legacyDeleteCameraPhoto(batchId, photoId);
  if (res.ok) revalidateCameraPaths(batchId);
  return res;
}

export async function deleteCameraBatch(batchId: string): Promise<SimpleResult> {
  const res = await legacyDeleteCameraBatch(batchId);
  if (res.ok) revalidateCameraPaths();
  return res;
}
