"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StatusTag, type StatusTone } from "@/components/ui/StatusTag";
import { BROKER_AVATAR, brokerInitial, formatPhone, telHref, usd, usd2 } from "../_util";
import {
  updateBroker,
  softDeleteBroker,
  addBrokerContact,
  updateBrokerContact,
  deleteBrokerContact,
} from "../actions";
import { markLoadPaid } from "../../loads/actions";

// Status pill styling for the broker's load-history cards, matching the
// dashboard's Active loads pills.
const HISTORY_STATUS_TONE: Record<string, StatusTone> = {
  pending: "amber",
  assigned: "amber",
  loaded: "steel",
  delivered: "green",
  cancelled: "slate",
};
const HISTORY_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  assigned: "Rolling",
  loaded: "Loaded",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

type Phone = { number: string; ext: string | null; label: string | null };
type Email = { address: string; label: string | null };
export type BrokerContact = {
  id: string;
  name: string | null;
  title: string | null;
  phones: Phone[];
  emails: Email[];
  is_backhaul: boolean;
};

export type Lane = {
  lane: string;
  origin: string;
  destination: string;
  count: number;
  gross: number;
  avgRate: number;
  miles: number;
  avgRpm: number;
  lastDate: string;
};

export type BrokerDetailData = {
  broker: {
    id: string;
    name: string;
    status: string;
    mc: string | null;
    dot: string | null;
    type: string | null;
    phone: string | null;
    email: string | null;
    office: string | null;
    timezone: string | null;
    authority: string | null;
    insurance: string | null;
    w9: string | null;
    ten99: string | null;
    notes: string | null;
    factoring: boolean;
  };
  kpis: { loads: number; gross: number; net: number; ar: number };
  summary: {
    totalLoads: number;
    delivered: number;
    active: number;
    cancelled: number;
    gross: number;
    avgRate: number;
    avgMiles: number;
  };
  receivables: { gross: number; collected: number; ar: number; net: number };
  aging: {
    b1: number; c1: number; b2: number; c2: number;
    b3: number; c3: number; b4: number; c4: number;
  };
  contacts: BrokerContact[];
  loads: {
    id: string;
    lane: string;
    equipment: string;
    date: string;
    rate: number;
    net: number;
    status: string;
    paymentStatus: string;
    ageDays: number | null;
    unpaid: boolean;
  }[];
  lanes: Lane[];
};

type Tab = "overview" | "contacts" | "documents" | "history";

export function BrokerDetail({ data }: { data: BrokerDetailData }) {
  const { broker, kpis, summary, receivables, aging, contacts, loads, lanes } =
    data;
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [editContact, setEditContact] = useState<BrokerContact | null>(null);
  const [lanesFor, setLanesFor] = useState<BrokerContact | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const active = broker.status?.toLowerCase() === "active";
  const saferUrl = `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=${
    broker.dot
      ? "USDOT&query_string=" + broker.dot
      : "MC_MX&query_string=" + (broker.mc ?? "")
  }`;

  return (
    <div className="px-4 py-4 sm:px-6">
      <Button
        href="/admin/dispatch/brokers"
        variant="navigate"
        size="sm"
        className="mb-3 md:hidden"
      >
        ← All brokers
      </Button>

      {/* Header */}
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[18px] font-bold " +
              BROKER_AVATAR
            }
          >
            {brokerInitial(broker.name)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[21px] font-semibold leading-none text-fg">
                {broker.name}
              </h1>
              <StatusTag tone={active ? "green" : "slate"}>
                {broker.status}
              </StatusTag>
              {broker.factoring ? (
                <StatusTag tone="steel" hideDot>
                  Factoring
                </StatusTag>
              ) : null}
            </div>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-fg-muted">
              MC {broker.mc ?? "—"} · DOT {broker.dot ?? "—"} ·{" "}
              {broker.type ?? "Brokerage"}
            </p>
          </div>
        </div>

        {/* Action row — on mobile a balanced 2×2 grid of equal-height,
            full-width buttons (no two-line wrapping); from sm+ an inline
            auto-width row. Keeps red primary vs outline secondary. */}
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              setTab("contacts");
              setAddingContact(true);
            }}
            className="h-9 w-full sm:w-auto"
            leftIcon={<span className="text-[15px] leading-none">+</span>}
          >
            Add Contact
          </Button>
          <Button
            type="button"
            variant="edit"
            onClick={() => setEditing(true)}
            className="h-9 w-full sm:w-auto"
          >
            ✎ Edit Broker
          </Button>
          <Button
            href={saferUrl}
            variant="navigate"
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 w-full sm:w-auto"
          >
            SAFER ↗
          </Button>
          <div className="relative w-full sm:w-auto">
            <Button
              type="button"
              variant="cancel"
              onClick={() => setMenuOpen((o) => !o)}
              className="h-9 w-full sm:w-auto"
            >
              More ▾
            </Button>
            {menuOpen ? (
              <>
                <button
                  type="button"
                  aria-hidden
                  tabIndex={-1}
                  onClick={() => setMenuOpen(false)}
                  className="fixed inset-0 z-10 cursor-default"
                />
                <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-md border border-line bg-card p-1 shadow-lg">
                  <form action={softDeleteBroker.bind(null, broker.id)}>
                    <Button
                      type="submit"
                      variant="destructive"
                      size="sm"
                      fullWidth
                      className="justify-start"
                    >
                      Delete broker
                    </Button>
                  </form>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {/* KPI module — the trip cards' grouped stat panel at page scale: one
          rounded inset surface split into equal cells by hairline dividers,
          tiny uppercase labels over their values. Trip-card color discipline:
          Total loads is a plain count and reads ink, Gross and Net are earnings
          and read green (Net leads on size alone, not on a filled tile), A/R
          reads red only while money is owed. Two columns on mobile, four from
          lg — the dividers follow the wrap. */}
      <div className="grid grid-cols-2 overflow-hidden rounded-md border border-line-strong bg-inset shadow-e2 lg:grid-cols-4">
        <Kpi label="Total loads" value={String(kpis.loads)} />
        <Kpi
          label="Gross"
          value={usd2(kpis.gross)}
          tone="green"
          cellClass="border-l border-line-strong"
        />
        <Kpi
          label="Net"
          value={usd2(kpis.net)}
          tone="green"
          strong
          cellClass="border-t border-line-strong lg:border-l lg:border-t-0"
        />
        <Kpi
          label="Accounts receivable"
          value={usd2(kpis.ar)}
          tone={kpis.ar > 0 ? "red" : "default"}
          cellClass="border-l border-t border-line-strong lg:border-t-0"
        />
      </div>

      {/* Contact / compliance strip */}
      <div className="mt-2 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line md:grid-cols-4 xl:grid-cols-8">
        <Cell label="Phone" value={broker.phone ? formatPhone(broker.phone) : null} />
        <Cell label="Email" value={broker.email} />
        <Cell label="Office" value={broker.office} />
        <Cell label="Timezone" value={broker.timezone} />
        <Cell label="Authority" value={broker.authority} />
        <Cell label="Insurance" value={broker.insurance} fallback="Not on file" />
        <Cell label="W9" value={broker.w9} fallback="Not on file" />
        <Cell label="1099" value={broker.ten99} fallback="Not on file" />
      </div>

      {/* Tabs */}
      <div className="mt-4 flex items-center gap-1 border-b border-line">
        <TabBtn id="overview" tab={tab} setTab={setTab} label="Overview" />
        <TabBtn id="contacts" tab={tab} setTab={setTab} label={`Contacts${contacts.length ? ` (${contacts.length})` : ""}`} />
        <TabBtn id="documents" tab={tab} setTab={setTab} label="Documents" />
        <TabBtn id="history" tab={tab} setTab={setTab} label={`Load History${loads.length ? ` (${loads.length})` : ""}`} />
      </div>

      <div className="py-4">
        {tab === "overview" ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Broker summary">
              <Row label="Total loads" value={String(summary.totalLoads)} />
              <Row label="Delivered" value={String(summary.delivered)} />
              <Row label="Active" value={String(summary.active)} />
              <Row label="Cancelled" value={String(summary.cancelled)} divider />
              <Row label="Total gross" value={usd(summary.gross)} green />
              <Row label="Avg rate / load" value={usd(summary.avgRate)} />
              <Row label="Avg miles / load" value={`${summary.avgMiles.toLocaleString()} mi`} last />
            </Panel>

            <Panel title="Receivables snapshot">
              <Row label="Total gross" value={usd(receivables.gross)} />
              <Row label="Collected (paid)" value={usd(receivables.collected)} green />
              <Row label="Outstanding (AR)" value={usd(receivables.ar)} red={receivables.ar > 0} />
              <Row label="Estimated net" value={usd(receivables.net)} green last />
            </Panel>

            <Panel title="A/R aging">
              <AgeRow label="0–7 days" count={aging.c1} amount={aging.b1} />
              <AgeRow label="8–14 days" count={aging.c2} amount={aging.b2} />
              <AgeRow label="15–30 days" count={aging.c3} amount={aging.b3} />
              <AgeRow label="31+ days" count={aging.c4} amount={aging.b4} last />
            </Panel>

            <Panel title="Compliance">
              <Row label="MC number" value={broker.mc ?? "Not on file"} muted={!broker.mc} />
              <Row label="DOT number" value={broker.dot ?? "Not on file"} muted={!broker.dot} />
              <Row label="Authority" value={broker.authority ?? "Not on file"} muted={!broker.authority} />
              <Row label="Insurance" value={broker.insurance ?? "Not on file"} muted={!broker.insurance} />
              <Row label="W9" value={broker.w9 ?? "Not on file"} muted={!broker.w9} />
              <Row label="1099" value={broker.ten99 ?? "Not on file"} muted={!broker.ten99} last />
            </Panel>

            <div className="lg:col-span-2">
              <Panel title="Notes">
                {broker.notes ? (
                  <p className="whitespace-pre-wrap px-3.5 py-3 text-[13px] text-fg">
                    {broker.notes}
                  </p>
                ) : (
                  <p className="px-3.5 py-3 text-[13px] italic text-fg-subtle">
                    No notes on file for this broker.
                  </p>
                )}
              </Panel>
            </div>
          </div>
        ) : null}

        {tab === "contacts" ? (
          contacts.length === 0 ? (
            <div className="rounded-md border border-dashed border-line bg-card px-4 py-10 text-center">
              <p className="text-[13px] text-fg-muted">No contacts yet.</p>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setAddingContact(true)}
                className="mt-3"
                leftIcon={<span className="text-[14px] leading-none">+</span>}
              >
                Add Contact
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {contacts.map((c) => (
                <ContactCard
                  key={c.id}
                  contact={c}
                  brokerId={broker.id}
                  laneCount={lanes.length}
                  onEdit={() => setEditContact(c)}
                  onOpenLanes={() => setLanesFor(c)}
                />
              ))}
            </div>
          )
        ) : null}

        {tab === "documents" ? (
          <Panel title="Documents & compliance">
            <DocRow label="Operating authority" value={broker.authority} />
            <DocRow label="Insurance certificate" value={broker.insurance} />
            <DocRow label="W9" value={broker.w9} />
            <DocRow label="1099" value={broker.ten99} last />
            <p className="border-t border-line bg-elevated px-3.5 py-2.5 text-[11px] italic text-fg-subtle">
              File uploads aren’t wired up yet — record reference numbers or
              status via Edit Broker for now.
            </p>
          </Panel>
        ) : null}

        {tab === "history" ? (
          loads.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-card px-4 py-10 text-center font-mono text-[12px] text-fg-subtle">
              No loads yet for this broker.
            </div>
          ) : (
            // One compact trip-style card per load: lane leading with its
            // status pill on the right edge, equipment/date/age as meta chips,
            // and a Rate · Net · Margin stat module. Tapping a card still opens
            // the load; Mark paid still submits without triggering that.
            <div className="space-y-2">
              {loads.map((l) => (
                <LoadHistoryCard
                  key={l.id}
                  load={l}
                  onOpen={() => router.push("/admin/dispatch/loads/" + l.id)}
                />
              ))}
            </div>
          )
        ) : null}
      </div>

      {/* Edit modal */}
      {editing ? (
        <EditModal broker={broker} onClose={() => setEditing(false)} />
      ) : null}

      {/* Add-contact modal */}
      {addingContact ? (
        <ContactModal
          brokerId={broker.id}
          brokerName={broker.name}
          onClose={() => setAddingContact(false)}
        />
      ) : null}

      {/* Edit-contact modal */}
      {editContact ? (
        <ContactModal
          brokerId={broker.id}
          brokerName={broker.name}
          contact={editContact}
          onClose={() => setEditContact(null)}
        />
      ) : null}

      {/* Lane overview (opened from a contact card) */}
      {lanesFor ? (
        <LanesModal
          brokerName={broker.name}
          contactName={lanesFor.name}
          lanes={lanes}
          onClose={() => setLanesFor(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * One load in the broker's history, on the trip-card system: white card, strong
 * hairline, e2→e3 on hover; the lane leads and the status pill holds the right
 * edge; equipment / date / age ride as meta chips; and Rate · Net · Margin sit
 * in one inset stat module. Margin is Net ÷ Rate drawn from the numbers already
 * on the row — no new money math.
 */
function LoadHistoryCard({
  load: l,
  onOpen,
}: {
  load: BrokerDetailData["loads"][number];
  onOpen: () => void;
}) {
  const marginPct = l.rate > 0 ? Math.round((l.net / l.rate) * 100) : null;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="cursor-pointer overflow-hidden rounded-lg border border-line-strong bg-card p-3 shadow-e2 transition-shadow hover:shadow-e3 active:bg-inset"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 truncate text-[14px] font-semibold leading-tight text-fg">
          {l.lane}
        </div>
        <StatusTag
          tone={HISTORY_STATUS_TONE[l.status] ?? "slate"}
          className="shrink-0"
        >
          {HISTORY_STATUS_LABEL[l.status] ?? l.status.replace("_", " ")}
        </StatusTag>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {l.equipment ? (
          <span className="rounded border border-line-strong bg-inset px-1.5 py-0.5 font-mono text-[11px] font-semibold text-fg shadow-e1">
            {l.equipment}
          </span>
        ) : null}
        {l.date ? (
          <span className="rounded border border-line-strong bg-inset px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-fg shadow-e1">
            {l.date}
          </span>
        ) : null}
        {l.ageDays != null ? (
          <span className="rounded border border-steel/40 bg-steel-bg px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums text-steel shadow-e1">
            {l.ageDays}d
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="flex w-fit items-stretch overflow-hidden rounded-md border border-line-strong bg-inset shadow-e1">
          <HistoryStat label="Rate" value={usd(l.rate)} />
          <HistoryStat label="Net" value={usd(l.net)} green strong divider />
          <HistoryStat
            label="Margin"
            value={marginPct != null ? `${marginPct}%` : "—"}
            green
            divider
          />
        </div>
        {l.unpaid ? (
          <form
            action={markLoadPaid.bind(null, l.id)}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0"
          >
            <button
              type="submit"
              onClick={(e) => e.stopPropagation()}
              className="rounded-md border border-steel/40 bg-steel-bg px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-steel transition-colors hover:bg-steel-bg/70"
            >
              Mark paid
            </button>
          </form>
        ) : l.paymentStatus === "paid" ? (
          <span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-ok">
            Paid
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** One cell of a load-history card's stat module. See TripsListView's Stat. */
function HistoryStat({
  label,
  value,
  green = false,
  strong = false,
  divider = false,
}: {
  label: string;
  value: string;
  green?: boolean;
  strong?: boolean;
  divider?: boolean;
}) {
  return (
    <div
      className={
        "px-2.5 py-1.5 " + (divider ? "border-l border-line-strong" : "")
      }
    >
      <div className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-fg-subtle">
        {label}
      </div>
      <div
        className={
          "mt-0.5 truncate font-bold leading-tight tabular-nums " +
          (strong ? "text-[15px] " : "text-[13px] ") +
          (green ? "text-ok" : "text-fg")
        }
      >
        {value}
      </div>
    </div>
  );
}

function ContactCard({
  contact,
  brokerId,
  laneCount,
  onEdit,
  onOpenLanes,
}: {
  contact: BrokerContact;
  brokerId: string;
  laneCount: number;
  onEdit: () => void;
  onOpenLanes: () => void;
}) {
  const hasMethods = contact.phones.length > 0 || contact.emails.length > 0;
  // Only backhaul/dispatch contacts are tied to the broker's lanes/loads. A
  // general contact (e.g. a caller-ID-only dispatcher) is a plain card with no
  // lane-overview affordance, so it never looks attached to an active load.
  const backhaul = contact.is_backhaul;
  const interactiveProps: React.HTMLAttributes<HTMLDivElement> = backhaul
    ? {
        role: "button",
        tabIndex: 0,
        onClick: onOpenLanes,
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenLanes();
          }
        },
        "aria-label": `View lanes for ${contact.name || "this contact"}'s broker`,
      }
    : {};
  return (
    <div
      {...interactiveProps}
      className={
        "group flex flex-col overflow-hidden rounded-lg border border-line bg-card shadow-sm " +
        (backhaul
          ? "cursor-pointer transition-colors hover:border-line-strong focus:outline-none focus-visible:border-fg focus-visible:ring-2 focus-visible:ring-fg/20"
          : "")
      }
    >
      {/* Header — avatar · name/role · edit/delete */}
      <div className="flex items-start gap-3 px-3.5 py-3">
        <span
          className={
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-bold " +
            BROKER_AVATAR
          }
        >
          {brokerInitial(contact.name ?? "?")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-[14.5px] font-semibold leading-tight text-fg">
              {contact.name || "—"}
            </p>
            {backhaul ? (
              <span className="shrink-0 rounded-sm bg-indigo-100 px-1.5 py-[1px] font-mono text-[8.5px] font-bold uppercase tracking-[0.08em] text-indigo-700">
                Backhaul
              </span>
            ) : null}
          </div>
          {contact.title ? (
            <p className="mt-0.5 truncate text-[12px] text-fg-muted">
              {contact.title}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="edit"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            aria-label="Edit contact"
            className="h-8 w-8 px-0"
          >
            ✎
          </Button>
          <form action={deleteBrokerContact.bind(null, contact.id, brokerId)}>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              aria-label="Remove contact"
              onClick={(e) => {
                e.stopPropagation();
                if (
                  window.confirm(
                    `Delete ${contact.name || "this contact"}? This can't be undone.`,
                  )
                ) {
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              className="h-8 w-8 px-0 text-[16px]"
            >
              ×
            </Button>
          </form>
        </div>
      </div>

      {/* Contact methods */}
      {hasMethods ? (
        <div className="space-y-2 border-t border-line px-3.5 py-2.5">
          {contact.phones.map((p, i) => (
            <div key={`p${i}`} className="flex items-center gap-2">
              <IconPhoneSm className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
              <a
                href={`tel:${telHref(p.number)}${p.ext ? "," + p.ext : ""}`}
                onClick={(e) => e.stopPropagation()}
                className="truncate font-mono text-[12.5px] text-blue-700 hover:underline"
              >
                {formatPhone(p.number) || p.number}
                {p.ext ? <span className="text-fg-muted"> ×{p.ext}</span> : null}
              </a>
              {p.label ? <MethodTag label={p.label} /> : null}
            </div>
          ))}
          {contact.emails.map((e, i) => (
            <div key={`e${i}`} className="flex items-center gap-2">
              <IconMailSm className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
              <a
                href={`mailto:${e.address}`}
                onClick={(ev) => ev.stopPropagation()}
                className="truncate font-mono text-[12.5px] text-blue-700 hover:underline"
              >
                {e.address}
              </a>
              {e.label ? <MethodTag label={e.label} /> : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* Lane-overview affordance — backhaul/dispatch contacts only. */}
      {backhaul ? (
        <div className="mt-auto flex items-center justify-between border-t border-line bg-elevated/40 px-3.5 py-2 text-fg-muted transition-colors group-hover:text-fg">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.12em]">
            <IconLaneSm className="h-3.5 w-3.5" />
            Lane overview
            {laneCount > 0 ? (
              <span className="text-fg-subtle">· {laneCount}</span>
            ) : null}
          </span>
          <IconChevronR className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </div>
      ) : null}
    </div>
  );
}

function IconPhoneSm({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M5 4h3l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
    </svg>
  );
}

function IconMailSm({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function IconLaneSm({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="5" cy="6" r="2" />
      <circle cx="19" cy="18" r="2" />
      <path d="M5 8v6a4 4 0 0 0 4 4h8" />
    </svg>
  );
}

function IconChevronR({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

function LanesModal({
  brokerName,
  contactName,
  lanes,
  onClose,
}: {
  brokerName: string;
  contactName: string | null;
  lanes: Lane[];
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const totalLoads = lanes.reduce((s, l) => s + l.count, 0);
  const totalGross = lanes.reduce((s, l) => s + l.gross, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border border-line bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line bg-elevated px-4 py-3">
          <div className="min-w-0">
            <p className="font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-fg">
              Lane overview
            </p>
            <p className="mt-0.5 truncate text-[12px] text-fg-muted">
              {brokerName}
              {contactName ? ` · via ${contactName}` : ""}
            </p>
          </div>
          <Button
            type="button"
            variant="cancel"
            size="sm"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 px-2 text-[18px]"
          >
            ×
          </Button>
        </div>

        {lanes.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-[13px] text-fg-muted">
              No lanes yet — this broker has no booked loads.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4 border-b border-line px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-fg-muted">
              <span>
                {lanes.length} lane{lanes.length === 1 ? "" : "s"}
              </span>
              <span>
                {totalLoads} load{totalLoads === 1 ? "" : "s"}
              </span>
              <span className="text-ok">{usd(totalGross)} gross</span>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {lanes.map((l) => (
                <div
                  key={l.lane}
                  className="border-b border-line px-4 py-3 last:border-b-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-fg">
                      {l.origin} <span className="text-fg-subtle">→</span>{" "}
                      {l.destination}
                    </p>
                    <span className="shrink-0 rounded bg-elevated px-1.5 py-[1px] font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-fg-muted">
                      {l.count} load{l.count === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11.5px] text-fg-muted">
                    <span>
                      Gross{" "}
                      <span className="font-bold text-ok">
                        {usd(l.gross)}
                      </span>
                    </span>
                    <span>
                      Avg <span className="font-bold text-fg">{usd(l.avgRate)}</span>
                    </span>
                    <span>
                      RPM{" "}
                      <span className="font-bold text-fg">
                        {l.avgRpm > 0 ? usd2(l.avgRpm) : "—"}
                      </span>
                    </span>
                    <span>
                      Last <span className="text-fg">{l.lastDate}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MethodTag({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded bg-elevated px-1.5 py-[1px] font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-fg-subtle">
      {label}
    </span>
  );
}

type PhoneRow = { number: string; ext: string; label: string };
type EmailRow = { address: string; label: string };

function ContactModal({
  brokerId,
  brokerName,
  contact,
  onClose,
}: {
  brokerId: string;
  brokerName: string;
  contact?: BrokerContact;
  onClose: () => void;
}) {
  const isEdit = !!contact;
  const [phones, setPhones] = useState<PhoneRow[]>(
    contact && contact.phones.length
      ? contact.phones.map((p) => ({
          number: p.number,
          ext: p.ext ?? "",
          label: p.label ?? "",
        }))
      : [{ number: "", ext: "", label: "" }],
  );
  const [emails, setEmails] = useState<EmailRow[]>(
    contact && contact.emails.length
      ? contact.emails.map((e) => ({
          address: e.address,
          label: e.label ?? "",
        }))
      : [{ address: "", label: "" }],
  );

  const action = isEdit
    ? updateBrokerContact.bind(null, contact!.id, brokerId)
    : addBrokerContact.bind(null, brokerId);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-lg overflow-hidden rounded-lg border border-line bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-line bg-elevated px-4 py-2.5">
          <span className="font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-fg">
            {isEdit ? "Edit contact" : "Add contact"} · {brokerName}
          </span>
          <Button
            type="button"
            variant="cancel"
            size="sm"
            onClick={onClose}
            aria-label="Close"
            className="px-2 text-[18px]"
          >
            ×
          </Button>
        </div>
        <form action={action} className="px-4 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CField name="name" label="Name" defaultValue={contact?.name ?? ""} required />
            <CField name="title" label="Title" defaultValue={contact?.title ?? ""} />
          </div>

          {/* Phones */}
          <fieldset className="mt-4">
            <legend className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-fg-subtle">
              Phones
            </legend>
            <div className="mt-1.5 space-y-2">
              {phones.map((p, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    name="phone_number"
                    value={p.number}
                    onChange={(e) =>
                      setPhones((rows) =>
                        rows.map((r, j) =>
                          j === i ? { ...r, number: e.target.value } : r,
                        ),
                      )
                    }
                    placeholder="Phone number"
                    autoComplete="off"
                    className="min-w-0 flex-1 rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
                  />
                  <input
                    name="phone_ext"
                    value={p.ext}
                    onChange={(e) =>
                      setPhones((rows) =>
                        rows.map((r, j) =>
                          j === i ? { ...r, ext: e.target.value } : r,
                        ),
                      )
                    }
                    placeholder="Ext"
                    autoComplete="off"
                    className="w-16 rounded-md border border-line-strong bg-card px-2 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
                  />
                  <input
                    name="phone_label"
                    value={p.label}
                    onChange={(e) =>
                      setPhones((rows) =>
                        rows.map((r, j) =>
                          j === i ? { ...r, label: e.target.value } : r,
                        ),
                      )
                    }
                    placeholder="Label"
                    autoComplete="off"
                    className="w-24 rounded-md border border-line-strong bg-card px-2 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
                  />
                  <RowRemove
                    onClick={() =>
                      setPhones((rows) =>
                        rows.length > 1 ? rows.filter((_, j) => j !== i) : rows,
                      )
                    }
                  />
                </div>
              ))}
            </div>
            <AddRow
              label="Add phone"
              onClick={() =>
                setPhones((rows) => [...rows, { number: "", ext: "", label: "" }])
              }
            />
          </fieldset>

          {/* Emails */}
          <fieldset className="mt-4">
            <legend className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-fg-subtle">
              Emails
            </legend>
            <div className="mt-1.5 space-y-2">
              {emails.map((e, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    name="email_address"
                    value={e.address}
                    onChange={(ev) =>
                      setEmails((rows) =>
                        rows.map((r, j) =>
                          j === i ? { ...r, address: ev.target.value } : r,
                        ),
                      )
                    }
                    placeholder="Email address"
                    autoComplete="off"
                    className="min-w-0 flex-1 rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
                  />
                  <input
                    name="email_label"
                    value={e.label}
                    onChange={(ev) =>
                      setEmails((rows) =>
                        rows.map((r, j) =>
                          j === i ? { ...r, label: ev.target.value } : r,
                        ),
                      )
                    }
                    placeholder="Label"
                    autoComplete="off"
                    className="w-24 rounded-md border border-line-strong bg-card px-2 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
                  />
                  <RowRemove
                    onClick={() =>
                      setEmails((rows) =>
                        rows.length > 1 ? rows.filter((_, j) => j !== i) : rows,
                      )
                    }
                  />
                </div>
              ))}
            </div>
            <AddRow
              label="Add email"
              onClick={() =>
                setEmails((rows) => [...rows, { address: "", label: "" }])
              }
            />
          </fieldset>

          {/* Backhaul flag — only flagged contacts feed backhaul recipients and
              show the lane-overview affordance. */}
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-md border border-line bg-elevated/40 px-3 py-2.5">
            <input
              type="checkbox"
              name="is_backhaul"
              defaultChecked={contact?.is_backhaul ?? true}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-red-600"
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-fg">
                Include in Reach
              </span>
              <span className="block text-[11.5px] text-fg-muted">
                Tie this contact to the broker&apos;s lanes and reach out to them
                with backhaul availability. Leave off for general contacts.
              </span>
            </span>
          </label>

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="cancel" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {isEdit ? "Save contact" : "Add contact"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RowRemove({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Remove row"
      className="shrink-0 px-1 text-[16px] leading-none text-fg-subtle transition-colors hover:text-bad"
    >
      ×
    </button>
  );
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-blue-700 transition-colors hover:text-blue-800"
    >
      <span className="text-[13px] leading-none">+</span> {label}
    </button>
  );
}

function CField({
  name,
  label,
  defaultValue,
  required = false,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
        {label}
        {required ? <span className="text-bad"> *</span> : null}
      </label>
      <input
        name={name}
        defaultValue={defaultValue}
        required={required}
        autoComplete="off"
        className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
      />
    </div>
  );
}


function TabBtn({
  id,
  tab,
  setTab,
  label,
}: {
  id: Tab;
  tab: Tab;
  setTab: (t: Tab) => void;
  label: string;
}) {
  const active = tab === id;
  return (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={
        "-mb-px border-b-2 px-3.5 py-2 text-[13px] font-semibold transition-colors " +
        (active
          ? "border-fg text-fg"
          : "border-transparent text-fg-muted hover:text-fg")
      }
    >
      {label}
    </button>
  );
}

/**
 * One KPI cell. `strong` is Net — it out-weighs its neighbours on size alone
 * (26px vs 22px), the same way the trip cards' Net stat leads: no filled box,
 * no accent rail. `tone` is the only color, and it's always data — green
 * earnings, red money owed, ink for a plain count.
 */
function Kpi({
  label,
  value,
  tone = "default",
  strong = false,
  cellClass = "",
}: {
  label: string;
  value: string;
  tone?: "default" | "green" | "red";
  strong?: boolean;
  /** Divider borders for this cell's position in the wrapping grid. */
  cellClass?: string;
}) {
  const color =
    tone === "green" ? "text-ok" : tone === "red" ? "text-bad" : "text-fg";
  return (
    <div className={"min-w-0 px-4 py-3 " + cellClass}>
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-fg-subtle">
        {label}
      </div>
      <div
        className={
          "mt-1 font-bold tabular-nums leading-none " +
          (strong ? "text-[26px] " : "text-[22px] ") +
          color
        }
      >
        {value}
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  fallback = "—",
}: {
  label: string;
  value: string | null;
  fallback?: string;
}) {
  const v = value?.trim();
  return (
    <div className="bg-card px-3 py-2">
      <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-fg-muted">
        {label}
      </div>
      <div className={"mt-0.5 truncate text-[12px] " + (v ? "text-fg" : "text-fg-muted")}>
        {v || fallback}
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-md border border-line bg-card shadow-sm">
      <div className="border-b border-line bg-elevated px-3.5 py-2">
        <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-fg-muted">
          {title}
        </span>
      </div>
      <div>{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  green = false,
  red = false,
  muted = false,
  last = false,
  divider = false,
}: {
  label: string;
  value: string;
  green?: boolean;
  red?: boolean;
  muted?: boolean;
  last?: boolean;
  divider?: boolean;
}) {
  const color = green
    ? "text-ok"
    : red
      ? "text-bad"
      : muted
        ? "italic text-fg-subtle"
        : "text-fg";
  return (
    <div
      className={
        "flex items-baseline justify-between gap-3 px-3.5 py-2 text-[13px] " +
        (last ? "" : "border-b ") +
        (divider ? "border-line-strong" : "border-line")
      }
    >
      <span className="text-fg">{label}</span>
      <span className={"font-semibold tabular-nums " + color}>{value}</span>
    </div>
  );
}

function AgeRow({
  label,
  count,
  amount,
  last = false,
}: {
  label: string;
  count: number;
  amount: number;
  last?: boolean;
}) {
  return (
    <div
      className={
        "flex items-baseline justify-between gap-3 px-3.5 py-2 text-[13px] " +
        (last ? "" : "border-b border-line")
      }
    >
      <span className="text-fg">{label}</span>
      <span
        className={
          "font-semibold tabular-nums " +
          (amount > 0 ? "text-amber-700" : "text-fg-subtle")
        }
      >
        {amount > 0 ? `${count} · ${usd(amount)}` : "—"}
      </span>
    </div>
  );
}

function DocRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string | null;
  last?: boolean;
}) {
  const onFile = !!value?.trim();
  return (
    <div
      className={
        "flex items-center justify-between gap-3 px-3.5 py-2.5 text-[13px] " +
        (last ? "" : "border-b border-line")
      }
    >
      <span className="text-fg">{label}</span>
      <span
        className={
          "rounded px-2 py-[2px] font-mono text-[10px] font-bold uppercase tracking-[0.06em] " +
          (onFile ? "bg-green-100 text-ok" : "bg-elevated text-fg-subtle")
        }
      >
        {onFile ? value : "Not on file"}
      </span>
    </div>
  );
}

function EditModal({
  broker,
  onClose,
}: {
  broker: BrokerDetailData["broker"];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-line bg-card shadow-xl sm:max-h-[calc(100dvh-4rem)]">
        <div className="flex shrink-0 items-center justify-between border-b border-line bg-elevated px-4 py-2.5">
          <span className="font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-fg">
            Edit broker
          </span>
          <Button
            type="button"
            variant="cancel"
            size="sm"
            onClick={onClose}
            aria-label="Close"
            className="px-2 text-[18px]"
          >
            ×
          </Button>
        </div>
        <form
          action={updateBroker.bind(null, broker.id)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="grid grid-cols-1 gap-3 overflow-y-auto px-4 py-4 sm:grid-cols-3">
          <label className="flex items-start gap-2.5 rounded-md border border-line-strong bg-elevated px-3 py-2.5 sm:col-span-3">
            <input
              type="checkbox"
              name="factoring"
              defaultChecked={broker.factoring}
              className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
            />
            <span className="min-w-0">
              <span className="block font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-fg">
                Factoring
              </span>
              <span className="block text-[11.5px] text-fg-subtle">
                This broker&apos;s loads are factored.
              </span>
            </span>
          </label>
          <EField name="name" label="Name" defaultValue={broker.name} required />
          <EField name="status" label="Status" defaultValue={broker.status} />
          <EField name="broker_type" label="Type" defaultValue={broker.type} />
          <EField name="mc_number" label="MC number" defaultValue={broker.mc} />
          <EField name="dot_number" label="DOT number" defaultValue={broker.dot} />
          <EField name="phone" label="Phone" defaultValue={broker.phone} />
          <EField name="email" label="Email" defaultValue={broker.email} />
          <EField name="office" label="Office" defaultValue={broker.office} />
          <EField name="timezone" label="Timezone" defaultValue={broker.timezone} />
          <EField name="authority" label="Authority" defaultValue={broker.authority} />
          <EField name="insurance" label="Insurance" defaultValue={broker.insurance} />
          <EField name="w9" label="W9" defaultValue={broker.w9} />
          <EField name="ten99" label="1099" defaultValue={broker.ten99} />
          <div className="sm:col-span-3">
            <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
              Notes
            </label>
            <textarea
              name="notes"
              defaultValue={broker.notes ?? ""}
              rows={3}
              className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
            />
          </div>
          </div>
          {/* Sticky footer so Save/Cancel stay reachable above the bottom nav
              even when the form is taller than the viewport. */}
          <div className="flex shrink-0 justify-end gap-2 border-t border-line bg-card px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
            <Button type="button" variant="cancel" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save broker
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EField({
  name,
  label,
  defaultValue,
  required = false,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
        {label}
        {required ? <span className="text-bad"> *</span> : null}
      </label>
      <input
        name={name}
        defaultValue={defaultValue ?? undefined}
        required={required}
        autoComplete="off"
        className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
      />
    </div>
  );
}
