"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { FILE_BUCKETS, type FileSource } from "@/lib/admin/files";

/**
 * Files page — lazy signing. The client holds the full file timeline as
 * metadata and requests signed URLs only for the storage paths currently on
 * screen (a page at a time). Read-only: this action never writes.
 *
 * Runs behind the authed admin shell (service-role client). Paths are grouped
 * by bucket and validated against the known file buckets before signing, so
 * only our three upload buckets can ever be signed here.
 */

const ALLOWED = new Set<string>(Object.values(FILE_BUCKETS));
const SIGNED_URL_TTL_SECONDS = 3600;

export type SignRef = { bucket: string; path: string };

/**
 * Batch-sign the given (bucket, path) pairs. Returns a flat map of
 * `${bucket}\n${path}` → signed URL so the client can look each one up. Paths
 * that fail to sign are simply omitted (the row still renders, just without a
 * thumbnail / open link).
 */
export async function signFiles(
  refs: SignRef[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!Array.isArray(refs) || refs.length === 0) return out;

  // Group unique paths per allowed bucket.
  const byBucket = new Map<string, Set<string>>();
  for (const r of refs) {
    if (!r || typeof r.bucket !== "string" || typeof r.path !== "string") continue;
    if (!ALLOWED.has(r.bucket) || !r.path) continue;
    const set = byBucket.get(r.bucket) ?? new Set<string>();
    set.add(r.path);
    byBucket.set(r.bucket, set);
  }
  if (byBucket.size === 0) return out;

  const sb = createServiceRoleClient();
  await Promise.all(
    Array.from(byBucket.entries()).map(async ([bucket, paths]) => {
      const list = Array.from(paths);
      const { data } = await sb.storage
        .from(bucket)
        .createSignedUrls(list, SIGNED_URL_TTL_SECONDS);
      for (const s of data ?? []) {
        if (s.path && s.signedUrl && !s.error) {
          out[`${bucket}\n${s.path}`] = s.signedUrl;
        }
      }
    }),
  );
  return out;
}

/**
 * Delete one file from the Files timeline, at its real source.
 *
 * The timeline is a UNION of three tables, so there is no single row to delete
 * — the source tag on the FileItem picks the table, bucket and column names.
 * Storage objects (and the WebP thumbnail, where there is one) go first, then
 * the row; a missing row is a no-op so a double-tap can't error.
 *
 * Deliberately NOT reusing the per-feature actions (deleteLoadDocument et al):
 * those each revalidate their own detail route and, for maintenance, take a
 * service id the timeline doesn't carry. This resolves everything from the
 * row itself.
 */
export async function deleteFile(
  source: FileSource,
  rowId: string,
): Promise<void> {
  if (!rowId) throw new Error("Missing file.");
  const sb = createServiceRoleClient();

  if (source === "load") {
    const { data: row } = await sb
      .from("load_documents")
      .select("id, load_id, storage_path, thumb_path")
      .eq("id", rowId)
      .maybeSingle<{
        id: string;
        load_id: string;
        storage_path: string;
        thumb_path: string | null;
      }>();
    if (!row) return;
    const paths = [row.storage_path, row.thumb_path].filter(
      (p): p is string => !!p,
    );
    if (paths.length > 0) {
      await sb.storage.from(FILE_BUCKETS.load).remove(paths);
    }
    await sb.from("load_documents").delete().eq("id", row.id);
    revalidatePath(`/admin/dispatch/loads/${row.load_id}`);
  } else if (source === "receipt") {
    const { data: row } = await sb
      .from("repair_attachments")
      .select("id, file_path, thumb_path")
      .eq("id", rowId)
      .maybeSingle<{
        id: string;
        file_path: string;
        thumb_path: string | null;
      }>();
    if (!row) return;
    const paths = [row.file_path, row.thumb_path].filter(
      (p): p is string => !!p,
    );
    if (paths.length > 0) {
      await sb.storage.from(FILE_BUCKETS.receipt).remove(paths);
    }
    await sb.from("repair_attachments").delete().eq("id", row.id);
    revalidatePath("/admin/maintenance", "layout");
  } else {
    const { data: row } = await sb
      .from("shipment_intake_uploads")
      .select("id, storage_path")
      .eq("id", rowId)
      .maybeSingle<{ id: string; storage_path: string }>();
    if (!row) return;
    if (row.storage_path) {
      await sb.storage.from(FILE_BUCKETS.intake).remove([row.storage_path]);
    }
    await sb.from("shipment_intake_uploads").delete().eq("id", row.id);
    revalidatePath("/admin/quotes", "layout");
  }

  revalidatePath("/admin/files");
  revalidatePath("/admin");
}
