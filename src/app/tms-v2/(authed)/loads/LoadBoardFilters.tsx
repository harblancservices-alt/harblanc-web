"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Props = {
  statusOptions: { value: string; label: string }[];
  brokers: { id: string; name: string }[];
  status?: string;
  brokerId?: string;
};

/**
 * Status/broker filter bar for the Load Board (v2-design.md §4). URL-state
 * only — no client cache, no local list-filtering — so every filter change
 * re-runs the same server-paginated, scoped `listLoads()` query
 * (v2-architecture.md §3c) rather than filtering an already-fetched page.
 */
export function LoadBoardFilters({ statusOptions, brokers, status, brokerId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={status ?? ""}
        onChange={(e) => update("status", e.target.value)}
        aria-label="Filter by status"
        className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none"
      >
        <option value="">All statuses</option>
        {statusOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={brokerId ?? ""}
        onChange={(e) => update("brokerId", e.target.value)}
        aria-label="Filter by broker"
        className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none"
      >
        <option value="">All brokers</option>
        {brokers.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </div>
  );
}
