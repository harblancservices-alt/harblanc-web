import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { SectionTabs } from "../../SectionTabs";
import {
  QuoteTrashTable,
  type QuoteTrashRow,
} from "./QuoteTrashTable";

export const metadata: Metadata = {
  title: "Quote trash",
  robots: { index: false, follow: false },
};

async function loadTrashedQuotes(): Promise<{
  rows: QuoteTrashRow[];
  activeCount: number;
}> {
  const sb = createServiceRoleClient();
  const [{ data }, { count }] = await Promise.all([
    sb
      .from("quote_requests")
      .select(
        "id, created_at, deleted_at, delete_after, name, email, phone, commodity",
      )
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false }),
    sb
      .from("quote_requests")
      .select("*", { count: "exact", head: true })
      .is("deleted_at", null),
  ]);
  return { rows: (data ?? []) as QuoteTrashRow[], activeCount: count ?? 0 };
}

export default async function QuotesTrashPage() {
  const { rows, activeCount } = await loadTrashedQuotes();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="pb-5">
        <p className="font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
          Trash
        </p>
        <h1 className="mt-2 text-2xl font-display tracking-tight text-white sm:text-3xl">
          Trashed quote requests
        </h1>
      </header>

      <div className="mt-1 mb-1 flex items-start gap-3 border-l-2 border-red-600 bg-neutral-900/40 px-4 py-3">
        <div>
          <p className="font-mono text-[10px] tracking-[0.22em] text-red-500 uppercase">
            Retention
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-300">
            Deleted records remain recoverable for 30 days. After that, an
            auto-purge job removes them permanently.
          </p>
        </div>
      </div>

      <SectionTabs
        tabs={[
          {
            label: "Active",
            href: "/admin/quotes",
            count: activeCount,
          },
          {
            label: "Trash",
            href: "/admin/quotes/trash",
            count: rows.length,
            active: true,
          },
        ]}
      />

      {rows.length === 0 ? (
        <p className="mt-12 text-sm text-neutral-500">Trash is empty.</p>
      ) : (
        <QuoteTrashTable rows={rows} />
      )}
    </div>
  );
}
