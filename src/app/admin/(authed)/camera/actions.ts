"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { blockedByDemo } from "@/lib/admin/demo";
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
 * Camera feature — service-role server actions (mutations + signed-upload URL
 * minting). Mirrors the load-document plumbing: photos upload DIRECTLY to
 * storage from the browser via a signed upload URL (bypassing the Server
 * Action / Vercel body limit that phone photos blow past), then a tiny
 * metadata action records the row.
 *
 * The actual CRUD + storage orchestration now lives in the neutral
 * src/lib/domain/camera.ts module, shared with /tms-v2's own wrapper
 * (src/actions/tms-v2/camera.ts) — this file only adds what's specific to
 * /admin: the demo-mode gate and revalidating /admin's own paths.
 * renameCameraBatch has no /tms-v2 counterpart (a feature gap in both apps,
 * predating this extraction) and is unchanged below.
 */

export async function createCameraBatch(
  nameRaw?: string,
): Promise<CreateBatchResult> {
  if (await blockedByDemo()) {
    return { ok: false, reason: "Demo mode — the camera is disabled." };
  }
  const result = await createCameraBatchShared(nameRaw);
  if (result.ok) revalidatePath("/admin/camera");
  return result;
}

/** Rename a batch. */
export async function renameCameraBatch(
  batchId: string,
  nameRaw: string,
): Promise<SimpleResult> {
  if (await blockedByDemo()) {
    return { ok: false, reason: "Demo mode — the camera is disabled." };
  }
  const name = nameRaw.trim();
  if (!name) return { ok: false, reason: "Name can't be empty." };
  try {
    const sb = createServiceRoleClient();
    const { error } = await sb
      .from("camera_batches")
      .update({ name: name.slice(0, 120) })
      .eq("id", batchId);
    if (error) return { ok: false, reason: error.message };
    revalidatePath("/admin/camera");
    revalidatePath(`/admin/camera/${batchId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Unexpected error." };
  }
}

export async function createCameraUploadUrl(
  batchId: string,
): Promise<UploadUrlResult> {
  if (await blockedByDemo()) {
    return { ok: false, reason: "Demo mode — the camera is disabled." };
  }
  return createCameraUploadUrlShared(batchId);
}

export async function recordCameraPhoto(
  batchId: string,
  storagePath: string,
  sizeBytes: number,
): Promise<RecordPhotoResult> {
  if (await blockedByDemo()) {
    return { ok: false, reason: "Demo mode — the camera is disabled." };
  }
  const result = await recordCameraPhotoShared(batchId, storagePath, sizeBytes);
  if (result.ok) {
    revalidatePath(`/admin/camera/${batchId}`);
    revalidatePath("/admin/camera");
  }
  return result;
}

export async function deleteCameraPhoto(
  batchId: string,
  photoId: string,
): Promise<SimpleResult> {
  if (await blockedByDemo()) {
    return { ok: false, reason: "Demo mode — the camera is disabled." };
  }
  const result = await deleteCameraPhotoShared(batchId, photoId);
  if (result.ok) {
    revalidatePath(`/admin/camera/${batchId}`);
    revalidatePath("/admin/camera");
  }
  return result;
}

export async function deleteCameraBatch(batchId: string): Promise<SimpleResult> {
  if (await blockedByDemo()) {
    return { ok: false, reason: "Demo mode — the camera is disabled." };
  }
  const result = await deleteCameraBatchShared(batchId);
  if (result.ok) revalidatePath("/admin/camera");
  return result;
}
