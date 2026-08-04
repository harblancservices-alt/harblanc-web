/**
 * The pagination contract every `lib/data/*` list function returns
 * (v2-architecture.md §3c). Putting `{ page, pageSize }` in the parameter
 * type and `Paginated<T>` in the return type means a screen can't
 * accidentally regress to an unbounded read without a visible, awkward
 * type mismatch — the same "make the correct path the only path" idea as
 * the money engine (§3a), applied to query shape instead of business logic.
 */

export type Paginated<T> = {
  rows: T[];
  totalCount: number;
  hasMore: boolean;
};

export const DEFAULT_PAGE_SIZE = 25;

/** 1-based page number -> Supabase's inclusive `.range(from, to)` bounds. */
export function pageRange(page: number, pageSize: number): { from: number; to: number } {
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const safeSize = Number.isFinite(pageSize) && pageSize >= 1 ? Math.floor(pageSize) : DEFAULT_PAGE_SIZE;
  const from = (safePage - 1) * safeSize;
  const to = from + safeSize - 1;
  return { from, to };
}

export function toPaginated<T>(rows: T[], totalCount: number, page: number, pageSize: number): Paginated<T> {
  return { rows, totalCount, hasMore: page * pageSize < totalCount };
}
