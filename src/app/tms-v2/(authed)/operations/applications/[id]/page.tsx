import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { getApplicationDetail } from "@/lib/data/pipeline";
import { formatPhone } from "@/lib/domain/phone";
import { ApplicationActions } from "./ApplicationActions";

// Trash status/retention window is time-sensitive — read fresh every visit.
export const dynamic = "force-dynamic";

function shortAppId(id: string): string {
  return `APP ${id.slice(0, 8).toUpperCase()}`;
}

/** Applications detail — read, contact, decide (ported from legacy's
 * applications/[id]/page.tsx). No "convert to lead" or "mark reviewed"
 * action exists here by design, matching legacy's own restraint. */
export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = await getApplicationDetail(id);
  if (!app) notFound();

  const isTrashed = app.deletedAt !== null;

  const operationsTokens = [app.equipmentType, app.cdlStatus, app.yearsExperience ? `${app.yearsExperience} yrs experience` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <PageScroll>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <Link href="/tms-v2/operations?tab=applications" className="text-[13px] text-fg-muted hover:text-fg">
            ← Applications
          </Link>
          <PageHeader title={app.name} actions={<ApplicationActions id={app.id} isTrashed={isTrashed} />} />
          <p className="text-[13px] text-fg-muted">
            {shortAppId(app.id)} · Received <DateTimeCST value={app.createdAt} />
          </p>
        </div>

        {isTrashed ? (
          <div className="rounded-lg border border-warn bg-warn-bg px-3 py-2.5 text-[13px] text-warn">
            In trash — moved <DateTimeCST value={app.deletedAt} />
            {app.deleteAfter ? (
              <>
                {" "}
                · auto-removed <DateTimeCST value={app.deleteAfter} mode="date" />
              </>
            ) : null}
          </div>
        ) : null}

        <section className="flex flex-col gap-2 rounded-xl border border-line bg-card p-4 shadow-e1">
          <h2 className="text-[15px] font-semibold text-fg">Contact</h2>
          <div className="flex flex-col gap-1 text-[14px]">
            <span className="font-medium text-fg">{app.name}</span>
            {app.phone ? (
              <a href={`tel:${app.phone}`} className="text-accent hover:underline">
                {formatPhone(app.phone)}
              </a>
            ) : null}
            {app.email ? (
              <a href={`mailto:${app.email}`} className="text-accent hover:underline">
                {app.email}
              </a>
            ) : null}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold text-fg">Operations</h2>
          <p className="text-[14px] text-fg">{operationsTokens || "—"}</p>
          {app.homeBase ? <p className="text-[13px] text-fg-muted">Home base: {app.homeBase}</p> : null}
        </section>

        {app.message ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-[15px] font-semibold text-fg">Message</h2>
            <p className="whitespace-pre-wrap rounded-md border border-line bg-elevated px-3 py-2.5 text-[14px] text-fg">{app.message}</p>
          </section>
        ) : null}

        <details className="rounded-md border border-line px-3 py-2.5 text-[13px] text-fg-muted">
          <summary className="cursor-pointer font-medium text-fg">Forensics</summary>
          <div className="mt-2 flex flex-col gap-1">
            <span>
              Created: <DateTimeCST value={app.createdAt} />
            </span>
            {app.deletedAt ? (
              <span>
                Deleted: <DateTimeCST value={app.deletedAt} />
              </span>
            ) : null}
            {app.deleteAfter ? (
              <span>
                Auto-purge: <DateTimeCST value={app.deleteAfter} />
              </span>
            ) : null}
            <span>Application ID: {app.id}</span>
            {app.ip ? <span>IP: {app.ip}</span> : null}
            {app.userAgent ? <span className="truncate">User agent: {app.userAgent}</span> : null}
          </div>
        </details>
      </div>
    </PageScroll>
  );
}
