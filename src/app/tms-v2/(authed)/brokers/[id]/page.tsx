import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { KpiTile } from "@/components/tms-v2/ui/KpiTile";
import { Money } from "@/components/tms-v2/ui/Money";
import { StatusPill } from "@/components/tms-v2/ui/StatusPill";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { DataList, type DataListColumn } from "@/components/tms-v2/ui/DataList";
import { getBrokerProfile, type BrokerContact, type BrokerLane, type BrokerLoadHistoryRow } from "@/lib/data/broker-profile";
import { BrokerStatusPill } from "../_lib/broker-status";

// Money-affecting data, read fresh every visit — matches Today's pattern.
export const dynamic = "force-dynamic";

const HISTORY_COLUMNS: DataListColumn<BrokerLoadHistoryRow>[] = [
  { key: "load", header: "Load", render: (l) => l.loadNumber ?? l.id.slice(0, 8) },
  { key: "lane", header: "Lane", render: (l) => `${l.origin ?? "—"} → ${l.destination ?? "—"}` },
  { key: "equipment", header: "Equipment", render: (l) => l.equipment ?? "—", hideOnMobile: true },
  { key: "delivery", header: "Delivered", render: (l) => <DateTimeCST value={l.deliveryDate} mode="date" /> },
  { key: "status", header: "Status", render: (l) => <StatusPill status={l.status} domain="load" />, hideOnMobile: true },
  { key: "rate", header: "Rate", render: (l) => <Money value={l.financials.gross} tone="none" />, align: "right" },
  { key: "net", header: "Net", render: (l) => <Money value={l.financials.net} />, align: "right" },
];

const LANE_COLUMNS: DataListColumn<BrokerLane>[] = [
  { key: "lane", header: "Lane", render: (l) => `${l.origin} → ${l.destination}` },
  { key: "count", header: "Loads", render: (l) => String(l.count), align: "right" },
  { key: "gross", header: "Gross", render: (l) => <Money value={l.gross} tone="none" />, align: "right" },
  { key: "avgRate", header: "Avg rate", render: (l) => <Money value={l.avgRate} tone="none" />, align: "right", hideOnMobile: true },
  {
    key: "rpm",
    header: "$/mi",
    render: (l) => (l.avgRatePerMile > 0 ? `$${l.avgRatePerMile.toFixed(2)}` : "—"),
    align: "right",
    hideOnMobile: true,
  },
  { key: "last", header: "Last delivered", render: (l) => <DateTimeCST value={l.lastDeliveryDate} mode="date" />, hideOnMobile: true },
];

function ContactRow({ contact }: { contact: BrokerContact }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2.5 text-[14px] last:border-b-0">
      <div>
        <span className="font-medium text-fg">{contact.name ?? "Unnamed contact"}</span>
        {contact.title ? <span className="ml-2 text-fg-muted">{contact.title}</span> : null}
        {contact.isBackhaul ? (
          <span className="ml-2 inline-flex items-center rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-medium text-warn">
            Backhaul
          </span>
        ) : null}
      </div>
      <div className="flex gap-4 text-fg-muted">
        <span>{contact.phone ?? "—"}</span>
        <span>{contact.email ?? "—"}</span>
      </div>
    </div>
  );
}

export default async function BrokerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getBrokerProfile(id);
  if (!profile) notFound();

  const { identity, kpis, aging, contacts, lanes, loadHistory } = profile;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/tms-v2/brokers" className="text-[13px] text-fg-muted hover:text-fg">
          ← Brokers
        </Link>
        <PageHeader
          title={identity.name}
          description={[
            identity.mcNumber ? `MC ${identity.mcNumber}` : null,
            identity.dotNumber ? `DOT ${identity.dotNumber}` : null,
            identity.factoring ? "Factoring ✓" : "No factoring",
          ]
            .filter(Boolean)
            .join(" · ")}
          badge={<BrokerStatusPill status={identity.status} />}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label="Loads" value={String(kpis.loadsCount)} />
        <KpiTile label="Gross (all-time)" value={<Money value={kpis.gross} tone="none" />} />
        <KpiTile label="Net (all-time)" value={<Money value={kpis.net} />} />
        <KpiTile label="A/R outstanding" value={<Money value={kpis.arOutstanding} tone={kpis.arOutstanding > 0 ? "negative" : "none"} />} />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold text-fg">A/R aging</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile label="0–7 days" value={<Money value={aging.d0to7} tone="none" />} />
          <KpiTile label="8–14 days" value={<Money value={aging.d8to14} tone="none" />} />
          <KpiTile label="15–30 days" value={<Money value={aging.d15to30} tone={aging.d15to30 > 0 ? "negative" : "none"} />} />
          <KpiTile label="31+ days" value={<Money value={aging.d31plus} tone={aging.d31plus > 0 ? "negative" : "none"} />} />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold text-fg">Contacts ({contacts.length})</h2>
        {contacts.length === 0 ? (
          <p className="text-[13px] text-fg-muted">No contacts on file for this broker.</p>
        ) : (
          <div className="rounded-lg border border-line bg-card px-3">
            {contacts.map((c) => (
              <ContactRow key={c.id} contact={c} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold text-fg">Lanes ({lanes.length})</h2>
        <DataList
          columns={LANE_COLUMNS}
          rows={lanes}
          rowKey={(l) => `${l.origin}->${l.destination}`}
          emptyMessage="No lanes yet — this broker has no booked loads."
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold text-fg">Load history ({loadHistory.length})</h2>
        <DataList
          columns={HISTORY_COLUMNS}
          rows={loadHistory}
          rowKey={(l) => l.id}
          emptyMessage="No loads booked with this broker yet."
        />
      </section>
    </div>
  );
}
