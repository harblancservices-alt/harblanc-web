"use server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { FILE_BUCKETS } from "@/lib/admin/files";

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
