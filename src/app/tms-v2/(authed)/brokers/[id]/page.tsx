import Link from "next/link";
import { notFound } from "next/navigation";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { DataList, type DataListColumn } from "@/components/tms-v2/ui/DataList";
import { Money } from "@/components/tms-v2/ui/Money";
import { getBrokerProfile, type BrokerLane } from "@/lib/data/broker-profile";
import { BrokerProfileHeader } from "./BrokerProfileHeader";
import { BrokerProfileTabs } from "./BrokerProfileTabs";
import { BrokerHistoryCard } from "./BrokerHistoryCard";
import { Panel, Row, AgeRow } from "./BrokerPanels";
import { BrokerActions, ContactsSection } from "./BrokerActions";

// Money-affecting data, read fresh every visit — matches Today's pattern.
export const dynamic = "force-dynamic";

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
];

/** Mobile card for the Lanes section — same rounded-card family as
 * BrokerHistoryCard/LoadCard, replacing DataList's stacked-row render on
 * phones (lanes have no detail page of their own, so this stays a plain
 * card rather than a Link). Desktop keeps the DataList table below. */
function LaneCard({ lane }: { lane: BrokerLane }) {
  return (
    <div className="rounded-xl border border-line bg-card p-3.5 shadow-e1">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[14px] font-semibold text-fg">
          {lane.origin} → {lane.destination}
        </span>
        <span className="shrink-0 text-[12px] text-fg-muted">
          {lane.count} {lane.count === 1 ? "load" : "loads"}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        <Money value={lane.gross} tone="none" className="font-semibold" />
        <span className="text-fg-muted">
          avg <Money value={lane.avgRate} tone="none" className="font-medium" />
        </span>
        {lane.avgRatePerMile > 0 ? <span className="text-fg-muted">${lane.avgRatePerMile.toFixed(2)}/mi</span> : null}
      </div>
    </div>
  );
}

/**
 * Broker profile — rebuilt per Brent's split verdict on the legacy /admin
 * profile: the TOP he disliked (both legacy's and V2's prior versions,
 * explicitly rejected), the sections BELOW he liked and asked to keep.
 * `BrokerProfileHeader` is the new top, built to his final spec (avatar +
 * name + status + factoring + MC/DOT, then a hairline, then an A/R·revenue·
 * loads money row — no call/email buttons). Everything below reproduces
 * legacy's Overview/Contacts/Documents/Load History tabs (BrokerDetail.tsx)
 * in V2 tokens: same structure and data, modernized look only.
 */
export default async function BrokerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getBrokerProfile(id);
  if (!profile) notFound();

  const { identity, kpis, aging, contacts, lanes, loadHistory } = profile;

  const overview = (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel title="Broker summary">
        <Row label="Loads (all-time)" value={String(kpis.loadsCount)} />
        <Row label="Total gross" value={<Money value={kpis.gross} tone="none" className="font-medium" />} />
        <Row label="Total net" value={<Money value={kpis.net} className="font-medium" />} />
      </Panel>

      <Panel title="Receivables snapshot">
        <Row label="Total gross" value={<Money value={kpis.gross} tone="none" className="font-medium" />} />
        <Row label="Outstanding (A/R)" value={<Money value={kpis.arOutstanding} tone={kpis.arOutstanding > 0 ? "negative" : "none"} className="font-medium" />} />
        <Row label="Estimated net" value={<Money value={kpis.net} className="font-medium" />} />
      </Panel>

      <Panel title="A/R aging">
        <AgeRow label="0–7 days" count={aging.d0to7Count} amount={aging.d0to7} />
        <AgeRow label="8–14 days" count={aging.d8to14Count} amount={aging.d8to14} />
        <AgeRow label="15–30 days" count={aging.d15to30Count} amount={aging.d15to30} />
        <AgeRow label="31+ days" count={aging.d31plusCount} amount={aging.d31plus} />
      </Panel>

      <Panel title="Compliance">
        <Row label="MC number" value={identity.mcNumber ?? "Not on file"} muted={!identity.mcNumber} />
        <Row label="DOT number" value={identity.dotNumber ?? "Not on file"} muted={!identity.dotNumber} />
        <Row label="Authority" value={identity.authority ?? "Not on file"} muted={!identity.authority} />
        <Row label="Insurance" value={identity.insurance ?? "Not on file"} muted={!identity.insurance} />
      </Panel>

      <div className="lg:col-span-2">
        <Panel title="Notes">
          {identity.notes ? (
            <p className="whitespace-pre-wrap px-3.5 py-3 text-[13px] text-fg">{identity.notes}</p>
          ) : (
            <p className="px-3.5 py-3 text-[13px] italic text-fg-subtle">No notes on file for this broker.</p>
          )}
        </Panel>
      </div>
    </div>
  );

  const documentsTab = (
    <Panel title="Documents & compliance">
      <Row label="Operating authority" value={identity.authority ?? "Not on file"} muted={!identity.authority} />
      <Row label="Insurance certificate" value={identity.insurance ?? "Not on file"} muted={!identity.insurance} />
      <Row label="W9" value={identity.w9 ?? "Not on file"} muted={!identity.w9} />
      <Row label="1099" value={identity.ten99 ?? "Not on file"} muted={!identity.ten99} />
      <div className="border-t border-line bg-elevated px-3.5 py-2.5 text-[11px] italic text-fg-subtle">
        File uploads aren&apos;t wired up yet — record reference numbers or status via Edit broker for now.
      </div>
    </Panel>
  );

  const historyTab =
    loadHistory.length === 0 ? (
      <div className="rounded-xl border border-dashed border-line-strong bg-card px-4 py-10 text-center">
        <p className="text-[13px] text-fg-muted">No loads booked with this broker yet.</p>
      </div>
    ) : (
      <div className="flex flex-col gap-2">
        {loadHistory.map((l) => (
          <BrokerHistoryCard key={l.id} load={l} />
        ))}
      </div>
    );

  return (
    <PageScroll>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <Link href="/tms-v2/brokers" className="text-[13px] text-fg-muted hover:text-fg">
            ← Brokers
          </Link>
          <BrokerActions identity={identity} />
        </div>

        <BrokerProfileHeader identity={identity} loadsCount={kpis.loadsCount} gross={kpis.gross} arOutstanding={kpis.arOutstanding} />

        <BrokerProfileTabs
          contactsCount={contacts.length}
          historyCount={loadHistory.length}
          overview={overview}
          contacts={<ContactsSection brokerId={identity.id} contacts={contacts} />}
          documents={documentsTab}
          history={historyTab}
        />

        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold text-fg">Lanes ({lanes.length})</h2>

          {/* Mobile — Load Board-style card list. */}
          <div className="no-scrollbar lg:hidden">
            {lanes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line-strong bg-card px-4 py-10 text-center shadow-e1">
                <p className="text-[13px] text-fg-muted">No lanes yet — this broker has no booked loads.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {lanes.map((l) => (
                  <LaneCard key={`${l.origin}->${l.destination}`} lane={l} />
                ))}
              </div>
            )}
          </div>

          {/* Desktop — unchanged table (later PC pass owns this). */}
          <div className="hidden lg:block">
            <DataList
              columns={LANE_COLUMNS}
              rows={lanes}
              rowKey={(l) => `${l.origin}->${l.destination}`}
              emptyMessage="No lanes yet — this broker has no booked loads."
            />
          </div>
        </section>
      </div>
    </PageScroll>
  );
}
