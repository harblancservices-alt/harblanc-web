import type { Metadata } from "next";
import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  ApplicationsDarkTable,
  type ApplicationDarkRow,
} from "./ApplicationsDarkTable";

export const metadata: Metadata = {
  title: "Applications",
  robots: { index: false, follow: false },
};

/**
 * Applications page — dark FreightGain visual system.
 *
 * Replaces the legacy V3 feed-card surface with the same dark dense
 * work-queue style used by Loads and the Dashboard. ApplicationListTable
 * (the old light-themed component) remains on disk for backward
 * compatibility but is no longer imported by this route. Trash route
 * (/admin/applications/trash) is unchanged.
 *
 * Schema untouched — applications have no `status` column today, so the
 * table deliberately omits a status pill rather than fake one.
 */

async function loadApplications(): Promise<{
  rows: ApplicationDarkRow[];
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
  return {
    rows: (data ?? []) as ApplicationDarkRow[],
    trashCount: count ?? 0,
  };
}

export default async function ApplicationsPage() {
  const { rows, trashCount } = await loadApplications();

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="w-full px-4 py-5 sm:px-6 sm:py-6 lg:px-10">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-indigo-600">
              Applications
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <h1 className="text-[24px] font-semibold leading-none tracking-tight text-fg tabular-nums">
                {rows.length} active
              </h1>
              {trashCount > 0 ? (
                <Link
                  href="/admin/applications/trash"
                  prefetch={false}
                  className="font-mono text-[12px] font-medium text-fg-muted hover:text-fg"
                >
                  {trashCount} in trash →
                </Link>
              ) : null}
            </div>
          </div>
        </header>

        <ApplicationsDarkTable rows={rows} />

        <p className="mt-3 px-1 font-mono text-[12px] text-fg-subtle">
          Sorted by most recent. Click any row to open the application.
        </p>
      </div>
    </div>
  );
}
