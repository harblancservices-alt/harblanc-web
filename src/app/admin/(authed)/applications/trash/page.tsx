import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
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
 * Trashed applications — the Operations · Applications trash view.
 *
 * V2 "Fleet Ops" chrome to match the Operations hub: canvas frame, PageHeader
 * (eyebrow "Operations" + title), the shared Active/Trash SectionTabs, and a
 * V2 retention strip. Loader and server actions are unchanged.
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
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <PageHeader
          eyebrow="Operations"
          title="Trashed applications"
          className="mb-4"
          date={`${rows.length} trashed · ${activeCount} active`}
        />

        {/* Retention — V2 inset strip with a 3px accent edge. */}
        <div className="relative mb-4 overflow-hidden rounded-md border border-line bg-inset px-4 py-2.5 shadow-e1">
          <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-accent" />
          <p className="pl-2 font-mono text-[11px] text-ink-3">
            <span className="font-bold uppercase tracking-[0.14em] text-ink-2">
              Retention
            </span>
            {" · "}Recoverable for 30 days · auto-removed after expiration
          </p>
        </div>

        <SectionTabs
          tabs={[
            {
              label: "Active",
              href: "/admin/operations?tab=applications",
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
          <p className="mt-8 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-ink-3">
            Trash is empty.
          </p>
        ) : (
          <ApplicationTrashTable rows={rows} />
        )}
      </div>
    </div>
  );
}
