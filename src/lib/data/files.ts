import { createServiceRoleClient } from "@/lib/supabase/server";
import { loadAllFiles, type FileCategory, type FileItem, type FileSource } from "@/lib/admin/files";

export type { FileItem, FileSource, FileCategory } from "@/lib/admin/files";

export type FileRow = FileItem & {
  /** Signed view/download URL — populated only for the current search/
   * filter result set (lazy signing, per the audit's already-correct
   * lever, moved server-side). */
  url: string | null;
  thumbUrl: string | null;
};

export type ListFilesOptions = {
  q?: string;
  /** Scope to one document type (rate_con/bol/signed_bol/pod/load_other/
   * receipt/application) — replaces the old coarser `source` (load/
   * receipt/intake) filter now that the page groups/colors by the finer
   * category instead. */
  category?: FileCategory;
};

export type FileCategoryCounts = Partial<Record<FileCategory, number>>;

export type FilesPage = { rows: FileRow[]; totalCount: number; counts: FileCategoryCounts };

/**
 * `FileItem.parentHref` is admin's own canonical "open record" link
 * (`/admin/dispatch/loads/…`, `/admin/maintenance/…`, `/admin/quotes/…`) —
 * correct for admin's Files page, but tms-v2 has its own routes for the
 * same records. Rewrite by source rather than admin-deleting the field, so
 * tms-v2's Files page / search / command palette never send a user into
 * /admin.
 */
const WORKSPACE_PARENT_PREFIX: Record<FileSource, [admin: string, tmsV2: string]> = {
  load: ["/admin/dispatch/loads/", "/tms-v2/loads/"],
  receipt: ["/admin/maintenance", "/tms-v2/maintenance"],
  intake: ["/admin/quotes/", "/tms-v2/operations/"],
};

export function toWorkspaceHref(item: Pick<FileItem, "source" | "parentHref">): string {
  const [adminPrefix, tmsV2Prefix] = WORKSPACE_PARENT_PREFIX[item.source];
  return item.parentHref.startsWith(adminPrefix)
    ? tmsV2Prefix + item.parentHref.slice(adminPrefix.length)
    : item.parentHref;
}

/**
 * Searchable view over /admin's existing canonical file aggregation
 * (`lib/admin/files.ts`'s `loadAllFiles()` — the one source of truth for
 * "every uploaded document," reused here rather than reimplemented, per
 * v2-architecture.md §2's "second copy shouldn't exist" rule).
 *
 * No pagination (dropped 2026-08-08 when the page moved to per-type
 * grouped sections — a "page" of results doesn't group cleanly, and this
 * one-truck operation's realistic total is well under a hundred files, so
 * signing and rendering everything that matches the current search/filter
 * is simpler and still bounded in practice).
 *
 * Bypasses the shared `DataSource` interface deliberately, the same way
 * `lib/data/loads.ts`'s `getLoadDetail()` does — Files/Camera aren't in
 * `DataSource`'s method set, and extending that shared, concurrently-edited
 * interface is out of this phase's scope.
 */
export async function listFiles(opts: ListFilesOptions): Promise<FilesPage> {
  const all = await loadAllFiles();

  const q = opts.q?.trim().toLowerCase();
  const searchFiltered = q ? all.filter((f) => f.searchText.includes(q)) : all;

  const counts: FileCategoryCounts = {};
  for (const item of searchFiltered) counts[item.category] = (counts[item.category] ?? 0) + 1;

  const filtered = opts.category ? searchFiltered.filter((f) => f.category === opts.category) : searchFiltered;

  const rows = await signAll(filtered);
  return { rows, totalCount: filtered.length, counts };
}

async function signAll(items: FileItem[]): Promise<FileRow[]> {
  if (items.length === 0) return [];
  const sb = createServiceRoleClient();

  const pathsByBucket = new Map<string, Set<string>>();
  for (const item of items) {
    const set = pathsByBucket.get(item.bucket) ?? new Set<string>();
    set.add(item.storagePath);
    if (item.thumbPath) set.add(item.thumbPath);
    pathsByBucket.set(item.bucket, set);
  }

  const urlByKey = new Map<string, string>();
  await Promise.all(
    Array.from(pathsByBucket.entries()).map(async ([bucket, paths]) => {
      const { data } = await sb.storage
        .from(bucket)
        .createSignedUrls(Array.from(paths), 3600);
      for (const s of data ?? []) {
        if (s.path && s.signedUrl && !s.error) {
          urlByKey.set(`${bucket}:${s.path}`, s.signedUrl);
        }
      }
    }),
  );

  return items.map((item) => ({
    ...item,
    parentHref: toWorkspaceHref(item),
    url: urlByKey.get(`${item.bucket}:${item.storagePath}`) ?? null,
    thumbUrl: item.thumbPath
      ? (urlByKey.get(`${item.bucket}:${item.thumbPath}`) ?? null)
      : null,
  }));
}
