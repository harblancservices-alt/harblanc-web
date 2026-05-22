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
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="pb-5">
        <p className="font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
          Applications
        </p>
        <h1 className="mt-2 text-2xl font-display tracking-tight text-white sm:text-3xl">
          Owner-operator applications
        </h1>
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
        <p className="mt-12 text-sm text-neutral-500">
          No incoming applications.
        </p>
      ) : (
        <ApplicationListTable rows={rows} />
      )}
    </div>
  );
}
