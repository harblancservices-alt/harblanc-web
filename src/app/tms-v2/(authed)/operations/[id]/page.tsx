import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { KpiTile } from "@/components/tms-v2/ui/KpiTile";
import { Money } from "@/components/tms-v2/ui/Money";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { getPipelineDetail } from "@/lib/data/pipeline";
import { suggestedNext, LEAD_STATUS_LABELS, isLeadStatus } from "@/lib/dispatch/status";
import { LeadStatusPill } from "../_lib/lead-status";
import { describeEvent } from "../_lib/timeline";

// Money/status-affecting data — read fresh every visit, matches the hub.
export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-2 text-[14px] last:border-b-0">
      <span className="text-fg-muted">{label}</span>
      <span className="text-right text-fg">{value}</span>
    </div>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="text-[15px] font-semibold text-fg">{children}</h2>;
}

export default async function PipelineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getPipelineDetail(id);
  if (!detail) notFound();

  const { identity, shipment, estimates, finalizedQuotes, bols, payment, events } = detail;
  const next = isLeadStatus(identity.leadStatus) ? suggestedNext(identity.leadStatus) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/tms-v2/operations?tab=quotes" className="text-[13px] text-fg-muted hover:text-fg">
          ← Operations
        </Link>
        <PageHeader
          title={identity.name}
          description={[
            `${identity.originLabel} → ${identity.destLabel}`,
            identity.miles ? `${identity.miles.toLocaleString()} mi` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          badge={<LeadStatusPill status={identity.leadStatus} />}
        />
        <p className="text-[13px] text-fg-muted">
          Created <DateTimeCST value={identity.createdAt} mode="date" />
          {identity.leadStatusUpdatedAt ? (
            <>
              {" "}
              · Status updated <DateTimeCST value={identity.leadStatusUpdatedAt} />
            </>
          ) : null}
          {next && isLeadStatus(identity.leadStatus) ? (
            <> · Likely next: {LEAD_STATUS_LABELS[next]} (informational — advancing lands in a later phase)</>
          ) : null}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label="Commodity" value={identity.commodity} />
        <KpiTile label="Weight" value={identity.weight} />
        <KpiTile
          label="Payment"
          value={payment.summary.total != null ? <Money value={payment.summary.outstanding} tone={payment.summary.outstanding > 0 ? "negative" : "none"} /> : "—"}
          delta={payment.summary.total != null ? (payment.summary.isPaidInFull ? "Paid in full" : "Outstanding") : "No total set yet"}
          deltaTone={payment.summary.isPaidInFull ? "positive" : payment.summary.total != null ? "negative" : "neutral"}
        />
        <KpiTile label="Pickup date" value={identity.pickupDate ? <DateTimeCST value={identity.pickupDate} mode="date" /> : "—"} />
      </div>

      <section className="flex flex-col gap-2">
        <SectionHeading>Customer</SectionHeading>
        <div className="rounded-lg border border-line bg-card px-3">
          <Row label="Email" value={identity.email} />
          <Row label="Phone" value={identity.phone} />
          {identity.notes ? <Row label="Notes" value={identity.notes} /> : null}
        </div>
      </section>

      {shipment ? (
        <section className="flex flex-col gap-2">
          <SectionHeading>Shipment details ({shipment.status === "submitted" ? "submitted" : "in progress"})</SectionHeading>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-line bg-card p-3">
              <p className="mb-2 text-[13px] font-medium text-fg-muted">Pickup</p>
              <p className="text-[14px] text-fg">{shipment.pickup.company ?? "—"}</p>
              <p className="text-[13px] text-fg-muted">{shipment.pickup.contactName ?? "—"} {shipment.pickup.contactPhone ? `· ${shipment.pickup.contactPhone}` : ""}</p>
              <p className="text-[13px] text-fg-muted">{shipment.pickup.address ?? "—"}</p>
              <p className="text-[13px] text-fg-muted">Window: {shipment.pickup.window ?? "—"}</p>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <p className="mb-2 text-[13px] font-medium text-fg-muted">Delivery</p>
              <p className="text-[14px] text-fg">{shipment.delivery.company ?? "—"}</p>
              <p className="text-[13px] text-fg-muted">{shipment.delivery.contactName ?? "—"} {shipment.delivery.contactPhone ? `· ${shipment.delivery.contactPhone}` : ""}</p>
              <p className="text-[13px] text-fg-muted">{shipment.delivery.address ?? "—"}</p>
              <p className="text-[13px] text-fg-muted">Window: {shipment.delivery.window ?? "—"}</p>
            </div>
          </div>
          <div className="rounded-lg border border-line bg-card px-3">
            <Row label="Commodity details" value={shipment.commodityDetails ?? "—"} />
            <Row label="Dimensions (L × W × H)" value={shipment.dimensions ?? "—"} />
            <Row label="Exact weight" value={shipment.exactWeightLbs ? `${shipment.exactWeightLbs.toLocaleString()} lbs` : "—"} />
            <Row label="Loading responsibility" value={shipment.loadingResponsibility ?? "—"} />
            <Row label="Unloading responsibility" value={shipment.unloadingResponsibility ?? "—"} />
            {shipment.specialRequirements ? <Row label="Special requirements" value={shipment.specialRequirements} /> : null}
            {shipment.notes ? <Row label="Notes" value={shipment.notes} /> : null}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <SectionHeading>Sent artifacts</SectionHeading>
        <div className="rounded-lg border border-line bg-card px-3">
          {estimates.length === 0 && finalizedQuotes.length === 0 && bols.length === 0 ? (
            <p className="py-3 text-[13px] text-fg-muted">Nothing sent yet.</p>
          ) : (
            <>
              {estimates.map((e) => (
                <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2.5 text-[14px] last:border-b-0">
                  <div>
                    <span className="font-medium text-fg">Range estimate</span>{" "}
                    <span className="text-fg-muted">
                      {e.linehaulLow != null || e.linehaulHigh != null ? (
                        <>
                          <Money value={e.linehaulLow} tone="none" />–<Money value={e.linehaulHigh} tone="none" />
                        </>
                      ) : (
                        "—"
                      )}
                    </span>
                    <span className="ml-2 text-fg-muted">
                      {e.sentAt ? <>sent <DateTimeCST value={e.sentAt} /></> : "draft"}
                      {e.acceptedAt ? " · accepted" : e.declinedAt ? " · declined" : ""}
                    </span>
                  </div>
                  {e.sentAt ? (
                    <div className="flex gap-3 text-[13px]">
                      <a className="underline" href={`/admin/quotes/${id}/estimate-email/${e.id}`} target="_blank" rel="noreferrer">
                        View email
                      </a>
                      <a className="underline" href={`/admin/quotes/${id}/estimate-pdf/${e.id}`} target="_blank" rel="noreferrer">
                        View PDF
                      </a>
                    </div>
                  ) : null}
                </div>
              ))}
              {finalizedQuotes.map((f) => (
                <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2.5 text-[14px] last:border-b-0">
                  <div>
                    <span className="font-medium text-fg">Finalized quote #{f.number}</span>{" "}
                    <Money value={f.totalAmount} tone="none" />
                    <span className="ml-2 text-fg-muted">
                      {f.sentAt ? <>sent <DateTimeCST value={f.sentAt} /></> : "draft"}
                      {f.confirmedAt ? " · confirmed" : ""}
                    </span>
                  </div>
                  {f.sentAt ? (
                    <div className="flex gap-3 text-[13px]">
                      <a className="underline" href={`/admin/quotes/${id}/finalized-quote-email/${f.id}`} target="_blank" rel="noreferrer">
                        View email
                      </a>
                      <a className="underline" href={`/admin/quotes/${id}/finalized-quote-pdf/${f.id}`} target="_blank" rel="noreferrer">
                        View PDF
                      </a>
                    </div>
                  ) : null}
                </div>
              ))}
              {bols.map((b) => (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2.5 text-[14px] last:border-b-0">
                  <div>
                    <span className="font-medium text-fg">BOL #{b.number}</span>
                    <span className="ml-2 text-fg-muted">{b.sentAt ? <>sent <DateTimeCST value={b.sentAt} /></> : "draft"}</span>
                  </div>
                  {b.sentAt ? (
                    <div className="flex gap-3 text-[13px]">
                      <a className="underline" href={`/admin/quotes/${id}/bol-email/${b.id}`} target="_blank" rel="noreferrer">
                        View email
                      </a>
                      <a className="underline" href={`/admin/quotes/${id}/bol-pdf/${b.id}`} target="_blank" rel="noreferrer">
                        View PDF
                      </a>
                    </div>
                  ) : null}
                </div>
              ))}
            </>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading>Payment status</SectionHeading>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiTile label="Total" value={payment.summary.total != null ? <Money value={payment.summary.total} tone="none" /> : "—"} />
          <KpiTile label="Paid" value={<Money value={payment.summary.paid} tone="none" />} />
          <KpiTile
            label="Outstanding"
            value={payment.summary.total != null ? <Money value={payment.summary.outstanding} tone={payment.summary.outstanding > 0 ? "negative" : "none"} /> : "—"}
          />
        </div>
        {payment.entries.length > 0 ? (
          <div className="rounded-lg border border-line bg-card px-3">
            {payment.entries.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 text-[14px] last:border-b-0">
                <span className="text-fg-muted">
                  <DateTimeCST value={p.receivedAt} mode="date" /> · {p.method.replace(/_/g, " ")} · {p.status}
                  {p.reference ? ` · ref ${p.reference}` : ""}
                </span>
                <Money value={p.amount} tone="none" />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-fg-muted">No payments recorded yet.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading>Activity ({events.length})</SectionHeading>
        {events.length === 0 ? (
          <p className="text-[13px] text-fg-muted">No events yet.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-line rounded-lg border border-line bg-card px-3">
            {events.map((ev) => {
              const { label, description } = describeEvent(ev.kind, ev.payload);
              return (
                <li key={ev.id} className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 py-2 text-[14px]">
                  <span className="whitespace-nowrap font-mono text-[12px] tabular-nums text-fg-muted">
                    <DateTimeCST value={ev.createdAt} />
                  </span>
                  <span>
                    <span className="font-medium text-fg">{label}</span>
                    {description ? <span className="ml-2 text-fg-muted">{description}</span> : null}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
