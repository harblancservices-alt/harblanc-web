import { createServiceRoleClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/admin/demo";
import { loadAllFiles, type FileItem, type FileSource } from "@/lib/admin/files";
import { pageRange, toPaginated, type Paginated } from "./pagination";

export type { FileItem, FileSource } from "@/lib/admin/files";

export type FileRow = FileItem & {
  /** Signed view/download URL — populated only for the current page's rows
   * (lazy signing, per the audit's already-correct lever, moved server-side
   * so only what's on screen is ever signed). */
  url: string | null;
  thumbUrl: string | null;
};

export type ListFilesOptions = {
  page: number;
  pageSize: number;
  q?: string;
  source?: FileSource;
};

export type FileSourceCounts = Record<FileSource, number>;

export type FilesPage = Paginated<FileRow> & { counts: FileSourceCounts };

const EMPTY_COUNTS: FileSourceCounts = { load: 0, receipt: 0, intake: 0 };

/**
 * Searchable, paginated view over /admin's existing canonical file
 * aggregation (`lib/admin/files.ts`'s `loadAllFiles()` — the one source of
 * truth for "every uploaded document," reused here rather than
 * reimplemented, per v2-architecture.md §2's "second copy shouldn't exist"
 * rule). This module adds what the admin Files page still does client-side:
 * search/type scoping and pagination happen here, server-side, so only the
 * current page's rows are ever serialized to the client or signed.
 *
 * Bypasses the shared `DataSource` interface deliberately, the same way
 * `lib/data/loads.ts`'s `getLoadDetail()` does — Files/Camera aren't in
 * `DataSource`'s method set, and extending that shared, concurrently-edited
 * interface is out of this phase's scope.
 */
export async function listFiles(opts: ListFilesOptions): Promise<FilesPage> {
  if (await isDemoMode()) {
    return { rows: [], totalCount: 0, hasMore: false, counts: EMPTY_COUNTS };
  }

  const all = await loadAllFiles();

  const q = opts.q?.trim().toLowerCase();
  const searchFiltered = q ? all.filter((f) => f.searchText.includes(q)) : all;

  const counts: FileSourceCounts = { load: 0, receipt: 0, intake: 0 };
  for (const item of searchFiltered) counts[item.source] += 1;

  const filtered = opts.source
    ? searchFiltered.filter((f) => f.source === opts.source)
    : searchFiltered;

  const totalCount = filtered.length;
  const { from, to } = pageRange(opts.page, opts.pageSize);
  const pageItems = filtered.slice(from, to + 1);

  const rows = await signPage(pageItems);
  return { ...toPaginated(rows, totalCount, opts.page, opts.pageSize), counts };
}

async function signPage(items: FileItem[]): Promise<FileRow[]> {
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
    url: urlByKey.get(`${item.bucket}:${item.storagePath}`) ?? null,
    thumbUrl: item.thumbPath
      ? (urlByKey.get(`${item.bucket}:${item.thumbPath}`) ?? null)
      : null,
  }));
}
