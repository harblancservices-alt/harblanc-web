import { createServiceRoleClient } from "@/lib/supabase/server";
import { CAMERA_BUCKET, CAMERA_PREFIX, SIGNED_URL_TTL_SECONDS, isMissingTable } from "@/lib/camera/shared";

/**
 * Camera — server-side CRUD + storage orchestration only (signed-upload-URL
 * minting, batch/photo row writes, storage object deletes). Shared by both
 * /admin and /tms-v2, each of which adds only its own app-specific behavior
 * on top (demo-mode gate and revalidatePath targets for /admin;
 * revalidatePath targets for /tms-v2, which has no demo mode) — see the two
 * wrapper files: src/app/admin/(authed)/camera/actions.ts and
 * src/actions/tms-v2/camera.ts.
 *
 * Deliberately excludes anything browser-specific: the actual getUserMedia
 * capture, client-side image compression, and the direct-to-storage upload
 * call (uploadFileToSignedUrl) all stay in the "use client" capture
 * component (src/app/tms-v2/(authed)/camera/[batchId]/CameraCapture.tsx and
 * its admin equivalent) — this module only ever runs server-side and is
 * called exclusively from "use server" action files, never imported by a
 * Client Component directly.
 *
 * Bucket name, storage-path prefix, signed-URL TTL, and the missing-table
 * check are NOT redefined here — they're reused as-is from
 * src/lib/camera/shared.ts (already a neutral, client-safe module both
 * apps' read layers also import from), so existing uploaded photos and
 * batches stay reachable at the exact same bucket/path convention this
 * extraction does not touch.
 *
 * No company/user scoping or per-caller authorization here by design — this
 * is a single-tenant domain (no org column on camera_batches/camera_photos),
 * and every caller is already behind the shared admin session gate
 * (src/middleware.ts) before it can reach a Server Action that calls these.
 */

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB — matches the load-documents cap.

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

export async function createCameraBatch(nameRaw?: string): Promise<CreateBatchResult> {
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
    return { ok: true, id: data.id };
  } catch (e) {
    console.error("[createCameraBatch] failed:", e);
    return { ok: false, reason: e instanceof Error ? e.message : "Unexpected error." };
  }
}

/**
 * Step 1 of a capture: mint a signed upload URL for a fresh JPEG path in the
 * camera namespace of the load-documents bucket. The browser then uploads the
 * compressed bytes straight to storage. No bytes pass through this action.
 */
export async function createCameraUploadUrl(batchId: string): Promise<UploadUrlResult> {
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

/**
 * Step 2 of a capture: record the metadata row for a photo already uploaded to
 * storage, assigning the next `seq` in the batch. Returns a signed URL so the
 * client can show the new thumbnail immediately.
 */
export async function recordCameraPhoto(
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

    return { ok: true, id: data.id, seq: data.seq, url };
  } catch (e) {
    console.error("[recordCameraPhoto] failed:", e);
    return { ok: false, reason: e instanceof Error ? e.message : "Unexpected error." };
  }
}

/** Delete one photo (storage object + row). Numbering renumbers on reload. */
export async function deleteCameraPhoto(batchId: string, photoId: string): Promise<SimpleResult> {
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
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Unexpected error." };
  }
}

/** Delete a whole batch: remove every storage object, then the batch row
 * (photo rows cascade). */
export async function deleteCameraBatch(batchId: string): Promise<SimpleResult> {
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
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Unexpected error." };
  }
}
