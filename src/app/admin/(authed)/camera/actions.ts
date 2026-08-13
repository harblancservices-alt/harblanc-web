"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { blockedByDemo } from "@/lib/admin/demo";
import {
  CAMERA_BUCKET,
  CAMERA_PREFIX,
  SIGNED_URL_TTL_SECONDS,
  isMissingTable,
} from "@/lib/camera/shared";

/**
 * Camera feature — service-role server actions (mutations + signed-upload URL
 * minting). Mirrors the load-document plumbing: photos upload DIRECTLY to
 * storage from the browser via a signed upload URL (bypassing the Server
 * Action / Vercel body limit that phone photos blow past), then a tiny
 * metadata action records the row.
 */

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB — matches the load-documents cap.

export type CreateBatchResult =
  | { ok: true; id: string }
  | { ok: false; reason: string };

export type UploadUrlResult =
  | { ok: true; bucket: string; path: string; token: string }
  | { ok: false; reason: string };

export type RecordPhotoResult =
  | { ok: true; id: string; seq: number; url: string | null }
  | { ok: false; reason: string };

export type SimpleResult = { ok: true } | { ok: false; reason: string };

function todayLabel(): string {
  try {
    return new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Ungated core — tms-v2 has no demo mode of its own (src/actions/tms-v2/
 * camera.ts calls this directly), so its writes can never be silently
 * no-op'd by /admin's demo cookie. Admin's own gated export below is
 * unchanged. */
export async function createCameraBatchLive(
  nameRaw?: string,
): Promise<CreateBatchResult> {
  try {
    const name = (nameRaw ?? "").trim() || `BOL scan · ${todayLabel()}`;
    const sb = createServiceRoleClient();
    const { data, error } = await sb
      .from("camera_batches")
      .insert({ name: name.slice(0, 120) })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) {
      if (isMissingTable(error)) {
        return {
          ok: false,
          reason: "Camera storage isn't set up yet — apply the database migration first.",
        };
      }
      return { ok: false, reason: `Could not create batch: ${error?.message ?? "unknown error"}` };
    }
    revalidatePath("/admin/camera");
    return { ok: true, id: data.id };
  } catch (e) {
    console.error("[createCameraBatch] failed:", e);
    return { ok: false, reason: e instanceof Error ? e.message : "Unexpected error." };
  }
}

/** Admin's own gated entry point — unchanged behavior. */
export async function createCameraBatch(
  nameRaw?: string,
): Promise<CreateBatchResult> {
  if (await blockedByDemo()) {
    return { ok: false, reason: "Demo mode — the camera is disabled." };
  }
  return createCameraBatchLive(nameRaw);
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

/**
 * Step 1 of a capture: mint a signed upload URL for a fresh JPEG path in the
 * camera namespace of the load-documents bucket. The browser then uploads the
 * compressed bytes straight to storage. No bytes pass through this action.
 */
/** Ungated core — see createCameraBatchLive's header for why. */
export async function createCameraUploadUrlLive(
  batchId: string,
): Promise<UploadUrlResult> {
  try {
    if (!batchId) return { ok: false, reason: "Missing batch." };
    const uuid = crypto.randomUUID();
    const path = `${CAMERA_PREFIX}/${batchId}/${uuid}.jpg`;
    const sb = createServiceRoleClient();
    const { data, error } = await sb.storage
      .from(CAMERA_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      return { ok: false, reason: `Could not start upload: ${error?.message ?? "unknown error"}` };
    }
    return { ok: true, bucket: CAMERA_BUCKET, path: data.path, token: data.token };
  } catch (e) {
    console.error("[createCameraUploadUrl] failed:", e);
    return { ok: false, reason: e instanceof Error ? e.message : "Unexpected error." };
  }
}

/** Admin's own gated entry point — unchanged behavior. */
export async function createCameraUploadUrl(
  batchId: string,
): Promise<UploadUrlResult> {
  if (await blockedByDemo()) {
    return { ok: false, reason: "Demo mode — the camera is disabled." };
  }
  return createCameraUploadUrlLive(batchId);
}

/**
 * Step 2 of a capture: record the metadata row for a photo already uploaded to
 * storage, assigning the next `seq` in the batch. Returns a signed URL so the
 * client can show the new thumbnail immediately.
 */
/** Ungated core — see createCameraBatchLive's header for why. */
export async function recordCameraPhotoLive(
  batchId: string,
  storagePath: string,
  sizeBytes: number,
): Promise<RecordPhotoResult> {
  try {
    if (!batchId || !storagePath) {
      return { ok: false, reason: "Missing photo details." };
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return { ok: false, reason: "Empty photo." };
    }
    if (sizeBytes > MAX_BYTES) {
      return { ok: false, reason: "Photo is too large (max 15 MB)." };
    }
    const sb = createServiceRoleClient();

    // Next seq = max existing + 1 (captures are serial, so no contention).
    const { data: last } = await sb
      .from("camera_photos")
      .select("seq")
      .eq("batch_id", batchId)
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle<{ seq: number }>();
    const seq = (last?.seq ?? 0) + 1;

    const { data, error } = await sb
      .from("camera_photos")
      .insert({
        batch_id: batchId,
        storage_path: storagePath,
        mime_type: "image/jpeg",
        size_bytes: Math.round(sizeBytes),
        seq,
      })
      .select("id, seq")
      .single<{ id: string; seq: number }>();

    if (error || !data) {
      // Remove the just-uploaded orphan so a failed insert leaves no junk.
      await sb.storage.from(CAMERA_BUCKET).remove([storagePath]);
      return { ok: false, reason: `Save failed: ${error?.message ?? "unknown error"}` };
    }

    let url: string | null = null;
    const { data: signed } = await sb.storage
      .from(CAMERA_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
    url = signed?.signedUrl ?? null;

    revalidatePath(`/admin/camera/${batchId}`);
    revalidatePath("/admin/camera");
    return { ok: true, id: data.id, seq: data.seq, url };
  } catch (e) {
    console.error("[recordCameraPhoto] failed:", e);
    return { ok: false, reason: e instanceof Error ? e.message : "Unexpected error." };
  }
}

/** Admin's own gated entry point — unchanged behavior. */
export async function recordCameraPhoto(
  batchId: string,
  storagePath: string,
  sizeBytes: number,
): Promise<RecordPhotoResult> {
  if (await blockedByDemo()) {
    return { ok: false, reason: "Demo mode — the camera is disabled." };
  }
  return recordCameraPhotoLive(batchId, storagePath, sizeBytes);
}

/** Delete one photo (storage object + row). Numbering renumbers on reload. */
/** Ungated core — see createCameraBatchLive's header for why. */
export async function deleteCameraPhotoLive(
  batchId: string,
  photoId: string,
): Promise<SimpleResult> {
  try {
    const sb = createServiceRoleClient();
    const { data: row } = await sb
      .from("camera_photos")
      .select("id, storage_path")
      .eq("id", photoId)
      .eq("batch_id", batchId)
      .maybeSingle<{ id: string; storage_path: string }>();
    if (!row) return { ok: true }; // already gone
    await sb.storage.from(CAMERA_BUCKET).remove([row.storage_path]);
    await sb.from("camera_photos").delete().eq("id", row.id);
    revalidatePath(`/admin/camera/${batchId}`);
    revalidatePath("/admin/camera");
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Unexpected error." };
  }
}

/** Admin's own gated entry point — unchanged behavior. */
export async function deleteCameraPhoto(
  batchId: string,
  photoId: string,
): Promise<SimpleResult> {
  if (await blockedByDemo()) {
    return { ok: false, reason: "Demo mode — the camera is disabled." };
  }
  return deleteCameraPhotoLive(batchId, photoId);
}

/** Delete a whole batch: remove every storage object, then the batch row
 * (photo rows cascade). Ungated core — see createCameraBatchLive's header
 * for why. */
export async function deleteCameraBatchLive(batchId: string): Promise<SimpleResult> {
  try {
    const sb = createServiceRoleClient();
    const { data: rows } = await sb
      .from("camera_photos")
      .select("storage_path")
      .eq("batch_id", batchId)
      .returns<{ storage_path: string }[]>();
    const paths = (rows ?? []).map((r) => r.storage_path);
    if (paths.length > 0) {
      await sb.storage.from(CAMERA_BUCKET).remove(paths);
    }
    const { error } = await sb.from("camera_batches").delete().eq("id", batchId);
    if (error) return { ok: false, reason: error.message };
    revalidatePath("/admin/camera");
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Unexpected error." };
  }
}

/** Admin's own gated entry point — unchanged behavior. */
export async function deleteCameraBatch(batchId: string): Promise<SimpleResult> {
  if (await blockedByDemo()) {
    return { ok: false, reason: "Demo mode — the camera is disabled." };
  }
  return deleteCameraBatchLive(batchId);
}
