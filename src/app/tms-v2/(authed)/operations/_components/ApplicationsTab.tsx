import Link from "next/link";
import { listApplications, listArchivedApplications } from "@/lib/data/pipeline";
import { ApplicationsListClient } from "./ApplicationsListClient";
import { ArchivedApplicationsSection } from "./ArchivedApplicationsSection";

const PAGE_SIZE = 25;

function buildHref(page: number): string {
  return `/tms-v2/operations?tab=applications&page=${page}`;
}

/** No `status` column exists on `applications` (current-tms-audit.md §15)
 * — the table deliberately omits a status pill rather than fabricate one,
 * same restraint v2-design.md §19 calls for. */
export async function ApplicationsTab({ page }: { page: number }) {
  const [list, archived] = await Promise.all([
    listApplications({ page, pageSize: PAGE_SIZE }),
    listArchivedApplications(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <ApplicationsListClient rows={list.rows} />

      <div className="flex items-center justify-between text-[13px] text-fg-muted">
        <span>
          {list.totalCount} application{list.totalCount === 1 ? "" : "s"} · page {page}
        </span>
        <div className="flex gap-3">
          {page > 1 ? (
            <Link href={buildHref(page - 1)} className="underline">
              ← Prev
            </Link>
          ) : null}
          {list.hasMore ? (
            <Link href={buildHref(page + 1)} className="underline">
              Next →
            </Link>
          ) : null}
        </div>
      </div>

      <ArchivedApplicationsSection applications={archived} />
    </div>
  );
}
