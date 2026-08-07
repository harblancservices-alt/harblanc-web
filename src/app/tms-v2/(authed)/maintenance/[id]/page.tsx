import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { getRepairEntryDetail } from "@/lib/data/maintenance";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { FreshnessBadge, MoneyLine } from "../_components/parts";
import { EntryActions } from "./EntryActions";

// A service's cost/receipts/links can change between visits — read live,
// matching Load Detail's own force-dynamic choice.
export const dynamic = "force-dynamic";

export default async function RepairEntryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entry = await getRepairEntryDetail(id);
  if (!entry) notFound();

  const { service } = entry;

  return (
    <PageScroll>
    <div className="flex flex-col gap-6">
      <Link
        href="/tms-v2/maintenance"
        className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-fg-muted hover:text-fg"
      >
        ← Maintenance
      </Link>

      <PageHeader
        title={entry.description}
        description={entry.partGroup ?? entry.category}
        badge={entry.freshness ? <FreshnessBadge freshness={entry.freshness} /> : null}
        actions={<EntryActions entry={entry} />}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center rounded-full bg-elevated px-2.5 py-0.5 text-[12px] font-medium text-fg-muted">
          {entry.category}
        </span>
        {entry.position ? (
          <span className="inline-flex items-center rounded-full bg-elevated px-2.5 py-0.5 text-[12px] font-medium text-fg-muted">
            {entry.position}
          </span>
        ) : null}
        {entry.reminderIntervalMiles != null ? (
          <span className="inline-flex items-center rounded-full bg-elevated px-2.5 py-0.5 text-[12px] font-medium text-fg-muted">
            ↻ Every {entry.reminderIntervalMiles.toLocaleString()} mi
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section className="flex flex-col gap-4">
          <h2 className="text-[15px] font-semibold text-fg">This visit</h2>
          <dl className="flex flex-col divide-y divide-line border-y border-line">
            <div className="flex items-center justify-between py-2.5 text-[14px]">
              <span className="text-fg-muted">Date</span>
              <DateTimeCST value={service.date} mode="date" />
            </div>
            <div className="flex items-center justify-between py-2.5 text-[14px]">
              <span className="text-fg-muted">Odometer</span>
              <span className="text-fg">{service.odometer != null ? `${service.odometer.toLocaleString()} mi` : "—"}</span>
            </div>
            <div className="flex items-center justify-between py-2.5 text-[14px]">
              <span className="text-fg-muted">Shop</span>
              <span className="text-fg">{service.shop ?? "—"}</span>
            </div>
            <MoneyLine label="Total cost" value={service.totalCost} bold />
          </dl>

          {service.notes ? (
            <div>
              <h3 className="mb-1.5 text-[13px] font-medium text-fg-muted">Notes</h3>
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-fg">{service.notes}</p>
            </div>
          ) : null}

          {entry.otherParts.length > 0 ? (
            <div>
              <h3 className="mb-1.5 text-[13px] font-medium text-fg-muted">
                Also replaced this visit ({entry.otherParts.length})
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {entry.otherParts.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1 text-[12.5px] text-fg"
                  >
                    {p.position ? `${p.position} ` : ""}
                    {p.description}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-[15px] font-semibold text-fg">Attachments</h2>
          {service.receipts.length === 0 ? (
            <p className="text-[13px] text-fg-muted">No receipts uploaded for this visit.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {service.receipts.map((r) =>
                r.url ? (
                  <a
                    key={r.id}
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-[13px] text-fg hover:bg-elevated"
                  >
                    <span className="min-w-0 truncate">{r.name}</span>
                    <span className="shrink-0 text-fg-muted">{r.isImage ? "Image" : "PDF"}</span>
                  </a>
                ) : (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-[13px] text-fg-muted"
                  >
                    <span className="min-w-0 truncate">{r.name}</span>
                    <span className="shrink-0">Unavailable</span>
                  </div>
                ),
              )}
            </div>
          )}

          <h2 className="mt-2 text-[15px] font-semibold text-fg">Related repairs ({entry.relatedParts.length})</h2>
          {entry.relatedParts.length === 0 ? (
            <p className="text-[13px] text-fg-muted">Nothing linked yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {entry.relatedParts.map((r) => (
                <Link
                  key={r.id}
                  href={`/tms-v2/maintenance/${r.id}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-[13px] text-fg hover:bg-elevated"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{r.description}</div>
                    <div className="text-[12px] text-fg-muted">
                      <DateTimeCST value={r.date} mode="date" />
                      {r.odometer != null ? ` · ${r.odometer.toLocaleString()} mi` : ""}
                    </div>
                  </div>
                  <FreshnessBadge freshness={r.freshness} className="shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
    </PageScroll>
  );
}
