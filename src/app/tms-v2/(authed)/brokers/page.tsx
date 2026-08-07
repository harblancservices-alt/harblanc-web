import Link from "next/link";
import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { Money } from "@/components/tms-v2/ui/Money";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { listBrokerDirectory, type BrokerDirectoryRow, type BrokerSortKey } from "@/lib/data/broker-directory";
import { NewBrokerButton } from "./NewBrokerButton";

// Money-affecting data, read fresh every visit — matches Today's pattern.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function buildHref(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") usp.set(k, String(v));
  }
  const qs = usp.toString();
  return qs ? `/tms-v2/brokers?${qs}` : "/tms-v2/brokers";
}

function BrokerRow({ b }: { b: BrokerDirectoryRow }) {
  return (
    <Link
      href={`/tms-v2/brokers/${b.id}`}
      className="flex items-center gap-2.5 border-b border-line px-3.5 py-2.5 transition-colors last:border-b-0 hover:bg-elevated"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-elevated text-[13px] font-semibold text-fg-muted">
        {initials(b.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold leading-tight text-fg">{b.name}</span>
        <span className="block text-[12px] text-fg-muted">
          {b.loadsCount} {b.loadsCount === 1 ? "load" : "loads"}
          {b.status && b.status !== "active" ? ` · ${b.status}` : ""}
        </span>
      </span>
      <Money value={b.gross} tone="none" className="shrink-0 text-[13px] font-bold" />
    </Link>
  );
}

/**
 * Brokers list — reverted to legacy /admin's operation (BrokerListSidebar.tsx):
 * avatar-chip rows with loads count + gross-in-green, a name/MC/DOT search,
 * and a Name/Gross/Loads sort selector — no KPI strip, no bulk actions,
 * matching what legacy never had either. Kept as tms-v2's existing
 * server-paginated single page rather than legacy's master-detail sidebar
 * shell (a bigger IA change Brent didn't ask for) — this restyles the row
 * and controls to match, not the split-pane layout.
 */
export default async function BrokersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const search = typeof sp.q === "string" ? sp.q : undefined;
  const page = typeof sp.page === "string" ? Math.max(1, Number(sp.page) || 1) : 1;
  const sortRaw = typeof sp.sort === "string" ? sp.sort : undefined;
  const sort: BrokerSortKey = sortRaw === "gross" || sortRaw === "loads" ? sortRaw : "name";

  const list = await listBrokerDirectory({ page, pageSize: PAGE_SIZE, search, sort });

  return (
    <PageScroll
      header={
        <>
          <PageHeader title="Brokers" actions={<NewBrokerButton />} />

          <form className="flex flex-wrap items-center gap-2" method="GET">
            <input type="hidden" name="sort" value={sort} />
            <input
              type="text"
              name="q"
              defaultValue={search ?? ""}
              placeholder="Search by name, MC, or DOT"
              className="h-9 w-64 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none"
            />
            <button type="submit" className="h-9 rounded-md border border-line-strong bg-card px-3 text-[13px] font-medium text-fg hover:bg-elevated">
              Search
            </button>
            {search ? (
              <Link href={buildHref({ sort })} className="text-[13px] text-fg-muted underline">
                Clear
              </Link>
            ) : null}
          </form>
        </>
      }
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1 text-[13px]">
          <span className="text-fg-muted">Sort:</span>
          {(["name", "gross", "loads"] as const).map((s) => (
            <Link
              key={s}
              href={buildHref({ q: search, sort: s })}
              className={`rounded-md px-2 py-1 font-medium ${sort === s ? "bg-elevated text-fg" : "text-fg-muted hover:text-fg"}`}
            >
              {s === "name" ? "Name (A–Z)" : s === "gross" ? "Gross (high)" : "Loads (high)"}
            </Link>
          ))}
        </div>
        <span className="text-[13px] text-fg-muted">{list.totalCount} broker{list.totalCount === 1 ? "" : "s"}</span>
      </div>

      {list.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-card px-4 py-10 text-center">
          <p className="text-[13px] text-fg-muted">{search ? `No match for "${search}".` : "No brokers yet."}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-card shadow-e1">
          {list.rows.map((b) => (
            <BrokerRow key={b.id} b={b} />
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-[13px] text-fg-muted">
        <span>Page {page}</span>
        <div className="flex gap-3">
          {page > 1 ? (
            <Link href={buildHref({ q: search, sort, page: page - 1 })} className="underline">
              ← Prev
            </Link>
          ) : null}
          {list.hasMore ? (
            <Link href={buildHref({ q: search, sort, page: page + 1 })} className="underline">
              Next →
            </Link>
          ) : null}
        </div>
      </div>
    </PageScroll>
  );
}
