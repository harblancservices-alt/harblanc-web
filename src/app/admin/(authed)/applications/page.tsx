import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { SectionTabs } from "../SectionTabs";
import {
  ApplicationListTable,
  type ApplicationListRow,
} from "./ApplicationListTable";

export const metadata: Metadata = {
  title: "Applications",
  robots: { index: false, follow: false },
};

/**
 * Level 6.6 — Active Applications page.
 *
 * Visual structure mirrors Active Quotes (6.3): max-w-4xl, V3 hero with
 * eyebrow + bold heading + right-aligned counts column. Below the hero
 * sits the SectionTabs nav, then the applications feed itself.
 *
 * Loader unchanged. No server-action or schema changes.
 */

async function loadApplications(): Promise<{
  rows: ApplicationListRow[];
  trashCount: number;
}> {
  const sb = createServiceRoleClient();
  const [{ data }, { count }] = await Promise.all([
    sb
      .from("applications")
      .select(
        "id, created_at, name, phone, email, equipment_type, cdl_status, years_experience, home_base",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    sb
      .from("applications")
      .select("*", { count: "exact", head: true })
      .not("deleted_at", "is", null),
  ]);
  return { rows: (data ?? []) as ApplicationListRow[], trashCount: count ?? 0 };
}

export default async function ApplicationsPage() {
  const { rows, trashCount } = await loadApplications();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      {/* V3 hero — eyebrow + bold title + right-aligned meta */}
      <header className="flex flex-wrap items-end justify-between gap-4 pb-5 sm:pb-6">
        <div>
          <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.28em] text-black">
            Applications
          </p>
          <h1 className="mt-1 text-[30px] font-bold leading-none tracking-tight text-black sm:text-[36px] lg:text-[40px]">
            Owner-operator applications
          </h1>
        </div>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-black text-right leading-snug">
          {rows.length} active
          <br />
          {trashCount} trashed
        </p>
      </header>

      <SectionTabs
        tabs={[
          {
            label: "Active",
            href: "/admin/applications",
            count: rows.length,
            active: true,
          },
          {
            label: "Trash",
            href: "/admin/applications/trash",
            count: trashCount,
          },
        ]}
      />

      {rows.length === 0 ? (
        <p className="mt-12 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-black/55">
          No incoming applications.
        </p>
      ) : (
        <ApplicationListTable rows={rows} />
      )}
    </div>
  );
}
