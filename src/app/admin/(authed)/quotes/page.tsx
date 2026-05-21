import type { Metadata } from "next";
import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { formatTimestampShort, isNew } from "@/lib/admin/format";

export const metadata: Metadata = {
  title: "Quote requests",
  robots: { index: false, follow: false },
};

type Row = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  phone: string;
  commodity: string;
  weight: string;
};

async function loadQuotes(): Promise<Row[]> {
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("quote_requests")
    .select("id, created_at, name, email, phone, commodity, weight")
    .order("created_at", { ascending: false });
  return (data ?? []) as Row[];
}

const colSpec =
  "grid grid-cols-[180px_minmax(140px,1fr)_140px_minmax(160px,1fr)_minmax(140px,1fr)_120px] gap-x-4";

export default async function QuotesPage() {
  const rows = await loadQuotes();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="flex items-baseline justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <p className="font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
            Quote requests
          </p>
          <h1 className="mt-2 text-2xl font-display tracking-tight text-white sm:text-3xl">
            Inbound freight quotes
          </h1>
        </div>
        <span className="font-mono text-[11px] tracking-[0.18em] text-neutral-500 uppercase">
          {rows.length} {rows.length === 1 ? "request" : "requests"}
        </span>
      </header>

      {rows.length === 0 ? (
        <p className="mt-12 text-sm text-neutral-500">
          No active quote requests.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <div className="min-w-[920px]">
            <div className={`${colSpec} border-b border-neutral-800 px-3 py-2.5`}>
              <Th>Received</Th>
              <Th>Name</Th>
              <Th>Phone</Th>
              <Th>Email</Th>
              <Th>Commodity</Th>
              <Th>Weight</Th>
            </div>
            <div className="divide-y divide-neutral-900">
              {rows.map((r) => (
                <Link
                  key={r.id}
                  href={`/admin/quotes/${r.id}`}
                  className={`${colSpec} items-center px-3 py-2.5 transition-colors hover:bg-neutral-900`}
                >
                  <span className="flex items-center gap-2 font-mono text-xs text-neutral-300">
                    {isNew(r.created_at) ? (
                      <span className="font-mono text-[9px] tracking-[0.22em] text-red-500 uppercase">
                        New
                      </span>
                    ) : null}
                    <span>{formatTimestampShort(r.created_at)}</span>
                  </span>
                  <span className="truncate text-sm font-semibold text-white">
                    {r.name}
                  </span>
                  <span className="font-mono text-xs text-neutral-300">
                    {r.phone}
                  </span>
                  <span className="truncate text-xs text-neutral-300">
                    {r.email}
                  </span>
                  <span className="truncate text-sm text-neutral-300">
                    {r.commodity}
                  </span>
                  <span className="font-mono text-xs text-neutral-300">
                    {r.weight}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase">
      {children}
    </span>
  );
}
