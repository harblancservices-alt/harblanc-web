import { createServiceRoleClient } from "@/lib/supabase/server";
import { SectionTabs } from "../SectionTabs";
import {
  ApplicationsDarkTable,
  type ApplicationDarkRow,
} from "../applications/ApplicationsDarkTable";

/**
 * Operations · Applications tab.
 *
 * The former /admin/applications list page, moved into the Operations hub.
 * Loader (loadApplications) is unchanged. The dark dense work-queue table
 * (ApplicationsDarkTable) is already the V2 look shared with Loads; this just
 * drops the standalone PageHeader (now the hub's) and adds the Active/Trash
 * SectionTabs so the tab matches Quotes.
 *
 * Schema untouched — applications have no `status` column today, so the table
 * deliberately omits a status pill rather than fake one.
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

export async function ApplicationsPanel() {
  const { rows, trashCount } = await loadApplications();

  return (
    <div>
      <SectionTabs
        tabs={[
          {
            label: "Active",
            href: "/admin/operations?tab=applications",
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

      <div className="mt-4">
        <ApplicationsDarkTable rows={rows} />
      </div>

      <p className="mt-3 px-1 font-mono text-[12px] text-fg-subtle">
        Sorted by most recent. Click any row to open the application.
      </p>
    </div>
  );
}
