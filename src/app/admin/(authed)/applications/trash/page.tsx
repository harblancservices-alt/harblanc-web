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
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="pb-5">
        <p className="font-mono text-xs tracking-[0.12em] text-red-600 uppercase">
          Trash
        </p>
        <h1 className="mt-2 text-2xl font-display tracking-tight text-black sm:text-3xl">
          Trashed applications
        </h1>
      </header>

      <div className="mt-1 mb-1 flex items-start gap-3 border-l-2 border-red-600 bg-zinc-100 px-4 py-3">
        <div>
          <p className="font-mono text-xs tracking-[0.12em] text-red-600 uppercase">
            Retention
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-black">
            Deleted records remain recoverable for 30 days. After that, an
            auto-purge job removes them permanently.
          </p>
        </div>
      </div>

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
        <p className="mt-12 text-sm text-black">Trash is empty.</p>
      ) : (
        <ApplicationTrashTable rows={rows} />
      )}
    </div>
  );
}
