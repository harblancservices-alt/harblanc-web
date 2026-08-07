import Link from "next/link";

type Props = {
  statusOptions: { value: string; label: string }[];
  brokers: { id: string; name: string }[];
  status?: string;
  brokerId?: string;
  search?: string;
  year: number;
  month: number;
};

/**
 * Search + status/broker filter row for the Load Board — compact, one
 * row, matching Brent's explicit ask ("keep the search + status/broker
 * filters, but compact — not a tall stack"). A plain GET form (same
 * pattern Expenses' own filter bar already uses) rather than client-side
 * router.push-per-change: one submit re-runs the same server-paginated,
 * scoped listLoads() query (v2-architecture.md §3c), no local
 * list-filtering. Legacy's board has search but no status/broker filter
 * at all — those are tms-v2's own addition, kept per Brent's explicit
 * instruction to keep them rather than drop them to match legacy exactly.
 */
export function LoadBoardFilters({ statusOptions, brokers, status, brokerId, search, year, month }: Props) {
  const hasFilter = !!status || !!brokerId || !!search;

  return (
    <form className="flex flex-wrap items-center gap-2" method="GET">
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />
      <input
        type="text"
        name="q"
        defaultValue={search ?? ""}
        placeholder="Search load #, broker, lane…"
        className="h-9 w-52 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none"
      />
      <select
        name="status"
        defaultValue={status ?? ""}
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
        name="brokerId"
        defaultValue={brokerId ?? ""}
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
      <button type="submit" className="h-9 rounded-md border border-line-strong bg-card px-3 text-[13px] font-medium text-fg hover:bg-elevated">
        Filter
      </button>
      {hasFilter ? (
        <Link href={`/tms-v2/loads?year=${year}&month=${month}`} className="text-[13px] text-fg-muted underline">
          Clear
        </Link>
      ) : null}
    </form>
  );
}
