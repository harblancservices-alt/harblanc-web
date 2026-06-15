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

/**
 * Level 6.5 — Trashed quotes page.
 *
 * Visual structure mirrors the Active Quotes feed (max-w-4xl, V3 hero
 * eyebrow + bold heading + right-aligned meta column). Below the hero
 * sits a single compact retention strip, then the SectionTabs nav, then
 * the trash feed itself.
 *
 * No server-action or retention-logic changes. Loader unchanged.
 */

async function loadTrashedQuotes(): Promise<{
  rows: QuoteTrashRow[];
  activeCount: number;
}> {
  const sb = createServiceRoleClient();
  const [{ data }, { count }] = await Promise.all([
    sb
      .from("quote_requests")
      .select(
        "id, created_at, deleted_at, delete_after, name, email, phone, commodity, pickup_zip, delivery_zip",
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
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      {/* L1: Page identity — mirrors Active Quotes hero exactly. */}
      <header className="flex flex-wrap items-end justify-between gap-4 pb-5 sm:pb-6">
        <div>
          <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.28em] text-fg">
            Trash
          </p>
          <h1 className="mt-1 text-[30px] font-bold leading-none tracking-tight text-fg sm:text-[36px] lg:text-[40px]">
            Trashed quotes
          </h1>
        </div>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-fg text-right leading-snug">
          {rows.length} trashed
          <br />
          {activeCount} active
        </p>
      </header>

      {/* L2: Retention strip — single compact cream line. */}
      <section
        aria-label="Retention policy"
        className="mb-4 flex items-baseline gap-3 border-l-[3px] border-line bg-[#fafaf6] px-4 py-2.5 sm:gap-4 sm:px-5"
      >
        <p className="shrink-0 font-mono text-[10.5px] font-bold uppercase tracking-[0.22em] text-fg">
          Retention
        </p>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-fg-muted">
          Recoverable for 30 days · Auto-removed after expiration
        </p>
      </section>

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
        <p className="mt-12 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-fg-subtle">
          Trash is empty.
        </p>
      ) : (
        <QuoteTrashTable rows={rows} />
      )}
    </div>
  );
}
