import Link from "next/link";
import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { Money } from "@/components/tms-v2/ui/Money";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { listBrokerDirectory, type BrokerDirectoryRow, type BrokerSortKey } from "@/lib/data/broker-directory";
import { NewBrokerButton } from "./NewBrokerButton";

// Money-affecting data, read fresh every visit — matches Today's pattern.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const SORT_OPTIONS = ["name", "gross", "loads", "ar"] as const;
const SORT_LABEL: Record<BrokerSortKey, string> = { name: "Name", gross: "Gross", loads: "Loads", ar: "A/R" };
const SORT_LABEL_LONG: Record<BrokerSortKey, string> = { name: "Name (A–Z)", gross: "Gross (high)", loads: "Loads (high)", ar: "A/R (high)" };

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

/** Desktop's existing row — untouched (later PC pass owns this). */
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

/** Mobile's "compact directory" row — a single tight line: small avatar
 * (with a quiet amber dot when A/R is owed, not a big chip), name, loads
 * count, gross. Denser than the desktop row above on purpose. */
function CompactBrokerRow({ b }: { b: BrokerDirectoryRow }) {
  return (
    <Link
      href={`/tms-v2/brokers/${b.id}`}
      className="flex items-center gap-2.5 border-b border-line px-3 py-2 transition-colors last:border-b-0 hover:bg-elevated"
    >
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-elevated text-[11px] font-semibold text-fg-muted">
        {initials(b.name)}
        {b.arOutstanding > 0 ? (
          <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-warn ring-2 ring-card" />
        ) : null}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">{b.name}</span>
      <span className="shrink-0 text-[12px] tabular-nums text-fg-muted">{b.loadsCount}</span>
      <Money value={b.gross} tone="none" className="shrink-0 text-[13px] font-semibold" />
    </Link>
  );
}

/**
 * Brokers list. Mobile-scoped redesign (standing rule) — Brent picked the
 * "compact directory" direction: one clean search field + a compact
 * "+ New" beside it, a row of sort PILLS (Name/Gross/Loads/A/R — A/R is
 * new, listBrokerDirectory's sort gained that key) with the count
 * right-aligned, then tight one-line rows (small avatar, name, loads,
 * gross) with hairline dividers instead of the heavier two-line rows —
 * and a quiet amber dot on the avatar for brokers that owe A/R, replacing
 * what would otherwise be a loud chip. Desktop keeps its existing
 * PageHeader/search-form/sort-links/two-line-row layout unchanged (later
 * PC pass owns that) — both blocks read the same listBrokerDirectory()
 * call, gated by lg:hidden / hidden lg:block.
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
  const sort: BrokerSortKey = sortRaw === "gross" || sortRaw === "loads" || sortRaw === "ar" ? sortRaw : "name";

  const list = await listBrokerDirectory({ page, pageSize: PAGE_SIZE, search, sort });
  const countLabel = `${list.totalCount} broker${list.totalCount === 1 ? "" : "s"}`;

  return (
    <PageScroll
      header={
        <>
          {/* Mobile — compact top row: search + compact New, one line. */}
          <form className="flex items-center gap-2 lg:hidden" method="GET">
            <input type="hidden" name="sort" value={sort} />
            <input
              type="text"
              name="q"
              defaultValue={search ?? ""}
              placeholder="Search name, MC, or DOT"
              className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-card px-3 text-[14px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
            />
            <NewBrokerButton />
          </form>

          {/* Desktop — unchanged. */}
          <div className="hidden lg:block">
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
          </div>
        </>
      }
    >
      {/* Mobile — sort pills + count, then the compact-directory card. */}
      <div className="lg:hidden">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {SORT_OPTIONS.map((s) => (
              <Link
                key={s}
                href={buildHref({ q: search, sort: s })}
                className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${
                  sort === s ? "bg-accent text-white" : "bg-elevated text-fg-muted"
                }`}
              >
                {SORT_LABEL[s]}
              </Link>
            ))}
          </div>
          <span className="shrink-0 text-[12px] text-fg-muted">{countLabel}</span>
        </div>

        {list.rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong bg-card px-4 py-10 text-center">
            <p className="text-[13px] text-fg-muted">{search ? `No match for "${search}".` : "No brokers yet."}</p>
          </div>
        ) : (
          <div className="no-scrollbar overflow-hidden rounded-xl border border-line bg-card shadow-e1">
            {list.rows.map((b) => (
              <CompactBrokerRow key={b.id} b={b} />
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between text-[12px] text-fg-muted">
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
      </div>

      {/* Desktop — unchanged. */}
      <div className="hidden lg:block">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1 text-[13px]">
            <span className="text-fg-muted">Sort:</span>
            {(["name", "gross", "loads"] as const).map((s) => (
              <Link
                key={s}
                href={buildHref({ q: search, sort: s })}
                className={`rounded-md px-2 py-1 font-medium ${sort === s ? "bg-elevated text-fg" : "text-fg-muted hover:text-fg"}`}
              >
                {SORT_LABEL_LONG[s]}
              </Link>
            ))}
          </div>
          <span className="text-[13px] text-fg-muted">{countLabel}</span>
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
      </div>
    </PageScroll>
  );
}
