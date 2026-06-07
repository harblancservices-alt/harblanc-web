import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { SectionTabs } from "../../SectionTabs";
import {
  ApplicationTrashTable,
  type ApplicationTrashRow,
} from "./ApplicationTrashTable";

export const metadata: Metadata = {
  title: "Application trash",
  robots: { index: false, follow: false },
};

/**
 * Level 6.6 — Trashed applications page.
 *
 * Mirrors Quotes Trash (6.5): max-w-4xl, V3 hero with right-aligned
 * counts, compact retention strip in place of the heavy retention card,
 * SectionTabs nav, then the trash feed itself.
 *
 * Loader unchanged. No server-action or retention-logic changes.
 */

async function loadTrashedApplications(): Promise<{
  rows: ApplicationTrashRow[];
  activeCount: number;
}> {
  const sb = createServiceRoleClient();
  const [{ data }, { count }] = await Promise.all([
    sb
      .from("applications")
      .select(
        "id, created_at, deleted_at, delete_after, name, phone, email, equipment_type, cdl_status",
      )
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false }),
    sb
      .from("applications")
      .select("*", { count: "exact", head: true })
      .is("deleted_at", null),
  ]);
  return {
    rows: (data ?? []) as ApplicationTrashRow[],
    activeCount: count ?? 0,
  };
}

export default async function ApplicationsTrashPage() {
  const { rows, activeCount } = await loadTrashedApplications();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      {/* L1: Page identity — mirrors Quotes Trash 6.5 exactly. */}
      <header className="flex flex-wrap items-end justify-between gap-4 pb-5 sm:pb-6">
        <div>
          <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.28em] text-black">
            Trash
          </p>
          <h1 className="mt-1 text-[30px] font-bold leading-none tracking-tight text-black sm:text-[36px] lg:text-[40px]">
            Trashed applications
          </h1>
        </div>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-black text-right leading-snug">
          {rows.length} trashed
          <br />
          {activeCount} active
        </p>
      </header>

      {/* L2: Retention strip — single compact cream line. */}
      <section
        aria-label="Retention policy"
        className="mb-4 flex items-baseline gap-3 border-l-[3px] border-black bg-[#fafaf6] px-4 py-2.5 sm:gap-4 sm:px-5"
      >
        <p className="shrink-0 font-mono text-[10.5px] font-bold uppercase tracking-[0.22em] text-black">
          Retention
        </p>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-black/70">
          Recoverable for 30 days · Auto-removed after expiration
        </p>
      </section>

      <SectionTabs
        tabs={[
          {
            label: "Active",
            href: "/admin/applications",
            count: activeCount,
          },
          {
            label: "Trash",
            href: "/admin/applications/trash",
            count: rows.length,
            active: true,
          },
        ]}
      />

      {rows.length === 0 ? (
        <p className="mt-12 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-black/55">
          Trash is empty.
        </p>
      ) : (
        <ApplicationTrashTable rows={rows} />
      )}
    </div>
  );
}
