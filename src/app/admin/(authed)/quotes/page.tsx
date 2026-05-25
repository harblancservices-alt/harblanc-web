import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { SectionTabs } from "../SectionTabs";
import { QuoteListTable, type QuoteListRow } from "./QuoteListTable";

export const metadata: Metadata = {
  title: "Quote requests",
  robots: { index: false, follow: false },
};

async function loadQuotes(): Promise<{
  rows: QuoteListRow[];
  trashCount: number;
}> {
  const sb = createServiceRoleClient();
  const [{ data }, { count }] = await Promise.all([
    sb
      .from("quote_requests")
      .select(
        "id, created_at, name, email, phone, commodity, weight, lead_status, pickup_zip, delivery_zip",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    sb
      .from("quote_requests")
      .select("*", { count: "exact", head: true })
      .not("deleted_at", "is", null),
  ]);
  return { rows: (data ?? []) as QuoteListRow[], trashCount: count ?? 0 };
}

export default async function QuotesPage() {
  const { rows, trashCount } = await loadQuotes();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="pb-5">
        <p className="font-mono text-xs tracking-[0.12em] text-red-600 uppercase">
          Quote requests
        </p>
        <h1 className="mt-2 text-2xl font-display tracking-tight text-black sm:text-3xl">
          Inbound freight quotes
        </h1>
      </header>

      <SectionTabs
        tabs={[
          {
            label: "Active",
            href: "/admin/quotes",
            count: rows.length,
            active: true,
          },
          {
            label: "Trash",
            href: "/admin/quotes/trash",
            count: trashCount,
          },
        ]}
      />

      {rows.length === 0 ? (
        <p className="mt-12 text-sm text-black">
          No active quote requests.
        </p>
      ) : (
        <QuoteListTable rows={rows} />
      )}
    </div>
  );
}
