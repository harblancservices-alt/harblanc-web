import Link from "next/link";
import { DataList, type DataListColumn } from "@/components/tms-v2/ui/DataList";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { listApplications, listArchivedApplications, type ApplicationRow } from "@/lib/data/pipeline";
import { ArchivedApplicationsSection } from "./ArchivedApplicationsSection";

const PAGE_SIZE = 25;

const COLUMNS: DataListColumn<ApplicationRow>[] = [
  { key: "name", header: "Name", render: (a) => <span className="font-medium text-fg">{a.name}</span> },
  { key: "phone", header: "Phone", render: (a) => a.phone },
  { key: "email", header: "Email", render: (a) => a.email, hideOnMobile: true },
  { key: "equipment", header: "Equipment", render: (a) => a.equipmentType },
  { key: "cdl", header: "CDL", render: (a) => a.cdlStatus, hideOnMobile: true },
  { key: "experience", header: "Experience", render: (a) => (a.yearsExperience ? `${a.yearsExperience} yrs` : "—"), hideOnMobile: true },
  { key: "home", header: "Home base", render: (a) => a.homeBase ?? "—", hideOnMobile: true },
  { key: "created", header: "Submitted", render: (a) => <DateTimeCST value={a.createdAt} mode="date" />, align: "right" },
];

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
      <DataList
        columns={COLUMNS}
        rows={list.rows}
        rowKey={(a) => a.id}
        getHref={(a) => `/tms-v2/operations/applications/${a.id}`}
        emptyMessage="No applications submitted yet."
      />

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
