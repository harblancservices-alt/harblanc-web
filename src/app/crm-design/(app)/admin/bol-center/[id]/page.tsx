"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useBolRecord, useCompany, useStore, useTeamMemberById } from "../../../../_lib/store";
import { Badge, Breadcrumb, Button, Card, CardHead, SegmentedControl, TEXT, TextLink } from "../../../../_design/ui";
import { Tabs } from "../../../../_design/Tabs";
import { Modal } from "../../../../_design/Modal";
import { BOL_STATUS_DESCRIPTION, BOL_STATUS_LABEL, BOL_STATUS_TONE } from "../../../../_lib/bolStatus";
import { formatDateTime } from "../../../../_lib/format";
import { BolDocumentViewer } from "../../../../_shared/BolDocumentViewer";
import { IconCheck, IconMapPin } from "../../../../_design/icons";
import type { BolCompanyRole, BolExtraction, BolReleaseSelection, BolStatus } from "../../../../_lib/types";

type TabKey = "extraction" | "customer" | "contacts" | "research" | "approve";

export default function BolDetailPage() {
  const params = useParams<{ id: string }>();
  const bol = useBolRecord(params.id);
  const { runExtraction, setBolStatus } = useStore();
  const [tab, setTab] = useState<TabKey>("extraction");
  // Hoisted ABOVE the notFound() early return. Called after it, this hook
  // ran on some renders and not others, so a record arriving or vanishing
  // between renders changed the hook order -- the crash rules-of-hooks
  // exists to prevent. The hook already accepts null/undefined and the
  // component returns before using `reviewer` when there is no record, so
  // the rendered output is unchanged.
  const reviewer = useTeamMemberById(bol?.assignedReviewerId);

  if (!bol) return notFound();

  const pending = bol.docNumber === "—";

  const nextAction = (() => {
    if (bol.status === "new") return { label: "Run AI Extraction", onClick: () => runExtraction(bol.id) };
    if (bol.status === "needs_review" || bol.status === "ai_extracted")
      return { label: "Start Research →", onClick: () => setBolStatus(bol.id, "researching") };
    if (bol.status === "researching")
      return { label: "Mark Ready for Approval →", onClick: () => setBolStatus(bol.id, "ready_for_approval") };
    return null;
  })();

  return (
    <>
      <Breadcrumb items={[{ label: "BOL Center", href: "/crm-design/admin/bol-center" }, { label: bol.docNumber }]} />

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className={`${TEXT.pageTitle} text-[var(--cd-text)]`}>{bol.docNumber}</h1>
            <Badge tone={BOL_STATUS_TONE[bol.status]}>{BOL_STATUS_LABEL[bol.status]}</Badge>
          </div>
          <p className={`${TEXT.body} mt-0.5 text-[var(--cd-text-muted)]`}>{BOL_STATUS_DESCRIPTION[bol.status]}</p>
        </div>
        {nextAction && (
          <Button variant="admin" onClick={nextAction.onClick}>
            {nextAction.label}
          </Button>
        )}
      </div>

      {/*
        Document-verification layout: the scan is the DOMINANT pane (~63%
        width on desktop, fills the available height) so Brent can check
        every extracted field against the source image without opening or
        closing anything — the fields rail scrolls independently on the
        right (~37%). Both columns are `lg:h-[...]` + internally scrollable
        rather than the page itself scrolling, which is what makes "both
        visible at once" actually work instead of the document just being a
        tall block above a tall block. Below `lg`, this collapses to a
        single stacked column (document first, full-width) — see
        BolDocumentViewer's own fullscreen mode for close reading on phones.
      */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.7fr_1fr] lg:items-stretch">
        {/* Left — persistent, dominant document viewer */}
        {/* min-w-0 matters here: a grid item's default min-width is `auto`
            (its content's intrinsic width), so without this an oversized
            zoomed image inside would force the whole 1.7fr track — and the
            page — wider than the viewport instead of scrolling within its
            own pane. Same reasoning applies inside BolDocumentViewer's own
            containers. */}
        <div className="min-w-0 lg:sticky lg:top-4 lg:h-[calc(100vh-180px)] lg:min-h-[560px]">
          <Card className="flex h-full min-w-0 flex-col p-3.5">
            <BolDocumentViewer bol={bol} />
          </Card>
        </div>

        {/* Right — compact metadata + tabbed review workspace, scrolls on
            its own so the document pane never has to shrink to fit it. */}
        <div className="min-w-0 lg:h-[calc(100vh-180px)] lg:min-h-[560px] lg:overflow-y-auto lg:pr-0.5">
          <Card className="mb-3 p-3">
            <dl className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Row label="Uploaded" value={formatDateTime(bol.uploadedAt)} />
              <Row label="Reviewer" value={reviewer ? reviewer.name : "Unassigned"} />
            </dl>
          </Card>

          <Tabs
            tone="admin"
            tabs={[
              { key: "extraction", label: "Extraction" },
              { key: "customer", label: "Customer & Location" },
              { key: "contacts", label: "Contacts & Roles", count: bol.contacts.length },
              { key: "research", label: "Research" },
              { key: "approve", label: "Approve & Release" },
            ]}
            active={tab}
            onChange={(k) => setTab(k as TabKey)}
          />

          <div className="mt-3">
            {tab === "extraction" && <ExtractionTab bolId={bol.id} pending={pending} />}
            {tab === "customer" && <CustomerLocationTab bolId={bol.id} />}
            {tab === "contacts" && <ContactsTab bolId={bol.id} />}
            {tab === "research" && <ResearchTab bolId={bol.id} />}
            {tab === "approve" && <ApproveReleaseTab bolId={bol.id} />}
          </div>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={`${TEXT.label} text-[var(--cd-text-muted)]`}>{label}</dt>
      <dd className="truncate text-[12.5px] font-medium text-[var(--cd-text)]">{value}</dd>
    </div>
  );
}

// ── Extraction ─────────────────────────────────────────────────────────

const FIELD_GROUPS: { title: string; fields: { key: keyof BolExtraction; label: string }[] }[] = [
  {
    title: "Parties",
    fields: [
      { key: "customerName", label: "Customer" },
      { key: "shipperName", label: "Shipper" },
      { key: "consigneeName", label: "Consignee" },
      { key: "brokerName", label: "Broker" },
      { key: "carrierName", label: "Carrier" },
    ],
  },
  {
    title: "Route",
    fields: [
      { key: "pickupAddress", label: "Pickup Address" },
      { key: "pickupCity", label: "Pickup City" },
      { key: "pickupState", label: "Pickup State" },
      { key: "deliveryAddress", label: "Delivery Address" },
      { key: "deliveryCity", label: "Delivery City" },
      { key: "deliveryState", label: "Delivery State" },
    ],
  },
  {
    title: "Shipment",
    fields: [
      { key: "commodity", label: "Commodity" },
      { key: "weight", label: "Weight" },
      { key: "pickupDate", label: "Pickup Date" },
      { key: "deliveryDate", label: "Delivery Date" },
      { key: "referenceNumber", label: "Reference #" },
    ],
  },
  // Optional — only some real-world BOLs carry a bill-to distinct from
  // shipper/consignee. This group (and the Proof of Delivery one below)
  // simply doesn't render when a record has neither field, so every other
  // seed BOL is unaffected.
  {
    title: "Bill-To (if different from Shipper/Consignee)",
    fields: [
      { key: "billToName", label: "Bill-To Company" },
      { key: "billToAddress", label: "Bill-To Address" },
    ],
  },
  {
    title: "Proof of Delivery",
    fields: [{ key: "receivedBySignature", label: "Received & Signed By" }],
  },
];

function ExtractionTab({ bolId, pending }: { bolId: string; pending: boolean }) {
  const bol = useBolRecord(bolId)!;
  const { runExtraction, updateExtractionField } = useStore();

  if (pending) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <p className={`${TEXT.body} font-semibold text-[var(--cd-text)]`}>Extraction hasn&rsquo;t run yet</p>
        <p className={`max-w-sm ${TEXT.micro} text-[var(--cd-text-muted)]`}>
          Run AI extraction to detect the customer, shipper/consignee, route, and shipment details from the photo on
          the left. Nothing is authoritative until you review it.
        </p>
        <Button variant="admin" onClick={() => runExtraction(bolId)}>
          Run AI Extraction
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {FIELD_GROUPS.filter((group) => group.fields.some((f) => bol.extraction[f.key])).map((group) => (
        <Card key={group.title}>
          <CardHead title={group.title} />
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
            {group.fields.map((f) => {
              const field = bol.extraction[f.key];
              if (!field) return null;
              return (
                <label key={f.key} className="flex flex-col gap-1">
                  <span className="flex items-center justify-between">
                    <span className={`${TEXT.label} text-[var(--cd-text-muted)]`}>{f.label}</span>
                    {field.corrected ? (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide text-[var(--cd-accent)]">
                        <IconCheck width={10} height={10} /> Corrected
                      </span>
                    ) : field.confidence === "high" ? (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide text-[var(--cd-success)]">
                        <IconCheck width={10} height={10} /> High
                      </span>
                    ) : (
                      <span className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--cd-warning)]">? Review</span>
                    )}
                  </span>
                  <input
                    value={field.value}
                    onChange={(e) => updateExtractionField(bolId, f.key, e.target.value)}
                    className={`h-9 w-full rounded-[var(--cd-radius-sm)] border px-2.5 text-[13px] text-[var(--cd-text)] outline-none transition-colors focus:border-[var(--cd-accent)] focus:bg-[var(--cd-surface)] focus:ring-2 focus:ring-[var(--cd-accent-soft)] ${
                      field.confidence === "review" && !field.corrected
                        ? "border-[var(--cd-warning)]/50 bg-[var(--cd-warning-soft)]"
                        : "border-[var(--cd-border-strong)] bg-[var(--cd-surface-2)]"
                    }`}
                  />
                </label>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Customer & Location ───────────────────────────────────────────────

function CustomerLocationTab({ bolId }: { bolId: string }) {
  const bol = useBolRecord(bolId)!;
  const { bolRecords, companies, companyLocations, confirmCustomerMatch, confirmLocation } = useStore();
  const matchedCompany = useCompany(bol.customerMatch.companyId ?? undefined);
  // Selecting a company/location is a draft until explicitly confirmed — a
  // <select> that fires its own mutation on change means a misclick
  // silently reassigns the customer match with no undo affordance visible
  // in the UI. See CRM_INTERACTION_HIERARCHY.md item 3.
  const [matchCompanyDraft, setMatchCompanyDraft] = useState("");
  const [locationMatchDraft, setLocationMatchDraft] = useState<Record<number, string>>({});

  // Duplicate hint — another unresolved BOL sharing this candidate's name or
  // pickup address. Client-side heuristic only (no real entity resolution);
  // enough to demonstrate "duplicates consolidated" without a matching engine.
  const duplicate = useMemo(() => {
    if (bol.customerMatch.status === "matched") return null;
    const nameKey = normalize(bol.customerMatch.candidateName);
    const addrKey = normalize(bol.extraction.pickupAddress.value);
    if (!nameKey && !addrKey) return null;
    return bolRecords.find(
      (other) =>
        other.id !== bol.id &&
        other.customerMatch.status !== "matched" &&
        (normalize(other.customerMatch.candidateName) === nameKey || normalize(other.extraction.pickupAddress.value) === addrKey) &&
        (nameKey || addrKey),
    );
  }, [bol, bolRecords]);

  const companyLocationOptions = matchedCompany ? companyLocations.filter((l) => l.companyId === matchedCompany.id) : [];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHead title="Customer match" />
        <div className="p-4">
          {bol.customerMatch.status === "matched" && matchedCompany ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--cd-radius-md)] border border-[var(--cd-success)]/45 bg-[var(--cd-success-soft)] px-4 py-3.5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--cd-success)]">Match found</p>
                <p className="text-[15px] font-bold text-[var(--cd-text)]">{matchedCompany.name}</p>
                <p className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>Already in the CRM — this BOL adds evidence, it doesn&rsquo;t create anything new.</p>
              </div>
              <TextLink href={`/crm-design/companies/${matchedCompany.id}`}>View Company →</TextLink>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="rounded-[var(--cd-radius-md)] border border-[var(--cd-accent)]/45 bg-[var(--cd-accent-soft)] px-4 py-3.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--cd-accent)]">Potential new customer</p>
                <p className="text-[15px] font-bold text-[var(--cd-text)]">{bol.customerMatch.candidateName || "Unknown — run extraction first"}</p>
                <p className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>
                  Not in the CRM yet. Nothing is created until you release this BOL to Sales.
                </p>
              </div>
              {bol.customerMatch.candidateName && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => confirmCustomerMatch(bolId, "confirmed_new", null)}
                  >
                    Confirm as New Customer
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => document.getElementById("research-tab-anchor")?.scrollIntoView()}
                  >
                    Research First
                  </Button>
                  {bol.customerMatch.status === "confirmed_new" && (
                    <span className="inline-flex items-center gap-1 self-center text-[11.5px] font-semibold text-[var(--cd-success)]">
                      <IconCheck width={12} height={12} /> Confirmed
                    </span>
                  )}
                </div>
              )}
              {/* Manual match-to-existing escape hatch — the AI's "unmatched"
                  guess isn't final either. */}
              {companies.length > 0 && (
                <details className="text-[12.5px]">
                  <summary className="cursor-pointer font-semibold text-[var(--cd-text-muted)] hover:text-[var(--cd-text)]">
                    Actually matches an existing company?
                  </summary>
                  <div className="mt-2 flex gap-2">
                    <select
                      className="h-9 flex-1 rounded-[var(--cd-radius-sm)] border border-[var(--cd-border-strong)] bg-[var(--cd-surface-2)] px-2.5 text-[13px] text-[var(--cd-text)]"
                      value={matchCompanyDraft}
                      onChange={(e) => setMatchCompanyDraft(e.target.value)}
                    >
                      <option value="" disabled>
                        Choose a company…
                      </option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!matchCompanyDraft}
                      onClick={() => {
                        confirmCustomerMatch(bolId, "matched", matchCompanyDraft);
                        setMatchCompanyDraft("");
                      }}
                    >
                      Confirm match
                    </Button>
                  </div>
                </details>
              )}
            </div>
          )}

          {duplicate && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-[var(--cd-radius-md)] border border-[var(--cd-warning)]/45 bg-[var(--cd-warning-soft)] px-4 py-2.5">
              <p className={`${TEXT.micro} text-[var(--cd-text)]`}>
                Possible duplicate — <span className="font-semibold">{duplicate.docNumber}</span> looks like the same
                company (&ldquo;{duplicate.customerMatch.candidateName}&rdquo;). Consolidate before releasing either one.
              </p>
              <TextLink href={`/crm-design/admin/bol-center/${duplicate.id}`}>Compare →</TextLink>
            </div>
          )}
        </div>
      </Card>

      {bol.extraction.billToName && (
        <Card>
          <CardHead
            title="Also on this document"
            hint="A BOL can name more than one company worth evaluating — shown separately, never merged into the primary match above."
          />
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
            <div className="rounded-[var(--cd-radius-md)] border border-[var(--cd-border)] bg-[var(--cd-surface-2)] px-3.5 py-3">
              <p className={`${TEXT.label} text-[var(--cd-text-muted)]`}>Consignee</p>
              <p className="text-[13.5px] font-bold text-[var(--cd-text)]">{bol.extraction.consigneeName.value}</p>
              <p className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>Where the freight physically lands.</p>
            </div>
            <div className="rounded-[var(--cd-radius-md)] border border-[var(--cd-border)] bg-[var(--cd-surface-2)] px-3.5 py-3">
              <p className={`${TEXT.label} text-[var(--cd-text-muted)]`}>Bill-To</p>
              <p className="text-[13.5px] font-bold text-[var(--cd-text)]">{bol.extraction.billToName.value}</p>
              <p className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>
                {bol.extraction.billToAddress?.value || "—"} — the paying customer, not necessarily the same
                company as the consignee above.
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <CardHead title="Location review" hint="Connects to the customer's Locations history." />
        {bol.locations.length === 0 ? (
          <p className={`p-4 ${TEXT.micro} text-[var(--cd-text-muted)]`}>No locations detected yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--cd-border)]">
            {bol.locations.map((loc, i) => {
              const matched = loc.matchedLocationId ? companyLocations.find((l) => l.id === loc.matchedLocationId) : null;
              return (
                <li key={i} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--cd-surface-2)] text-[var(--cd-text-muted)]">
                      <IconMapPin width={14} height={14} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-[var(--cd-text)]">
                        {loc.role === "pickup" ? "Pickup" : "Delivery"} — {loc.address}
                      </p>
                      <p className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>{loc.city}, {loc.state}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {loc.matchStatus === "existing" && matched ? (
                      <Badge tone="success">Existing — {matched.label}</Badge>
                    ) : (
                      <>
                        <Badge tone="accent">New Location Detected</Badge>
                        {companyLocationOptions.length > 0 && (
                          <>
                            <select
                              className="h-8 rounded-[var(--cd-radius-sm)] border border-[var(--cd-border-strong)] bg-[var(--cd-surface-2)] px-2 text-[11.5px] text-[var(--cd-text)]"
                              value={locationMatchDraft[i] ?? ""}
                              onChange={(e) => setLocationMatchDraft((prev) => ({ ...prev, [i]: e.target.value }))}
                            >
                              <option value="" disabled>
                                Match to existing…
                              </option>
                              {companyLocationOptions.map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.label}
                                </option>
                              ))}
                            </select>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={!locationMatchDraft[i]}
                              onClick={() => {
                                confirmLocation(bolId, i, "existing", locationMatchDraft[i]);
                                setLocationMatchDraft((prev) => ({ ...prev, [i]: "" }));
                              }}
                            >
                              Confirm
                            </Button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ── Contacts & Roles ───────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  shipper_contact: "Shipper Contact",
  consignee_contact: "Consignee Contact",
  bill_to_contact: "Bill-To Contact",
  broker: "Broker",
  carrier: "Carrier",
};
const ROLE_TONE: Record<string, "accent" | "neutral" | "warning" | "success"> = {
  shipper_contact: "accent",
  consignee_contact: "accent",
  bill_to_contact: "success",
  broker: "warning",
  carrier: "neutral",
};

function ContactsTab({ bolId }: { bolId: string }) {
  const bol = useBolRecord(bolId)!;
  const [verified, setVerified] = useState<Set<number>>(new Set());

  return (
    <Card>
      <CardHead
        title="Detected contacts & roles"
        hint="Separate from the CRM contact book — these don't become real contacts until reviewed."
      />
      {bol.contacts.length === 0 ? (
        <p className={`p-6 text-center ${TEXT.micro} text-[var(--cd-text-muted)]`}>No contacts detected on this BOL.</p>
      ) : (
        <ul className="divide-y divide-[var(--cd-border)]">
          {bol.contacts.map((c, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={ROLE_TONE[c.role]}>{ROLE_LABEL[c.role]}</Badge>
                  <span className="text-[13.5px] font-semibold text-[var(--cd-text)]">{c.name}</span>
                </div>
                <p className={`mt-0.5 ${TEXT.micro} text-[var(--cd-text-muted)]`}>
                  {c.company} · {c.phone} · {c.email}
                </p>
              </div>
              <label className="flex shrink-0 items-center gap-2 text-[12.5px] font-semibold text-[var(--cd-text-muted)]">
                <input
                  type="checkbox"
                  checked={verified.has(i)}
                  onChange={() =>
                    setVerified((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                  className="h-4 w-4 accent-[var(--cd-success)]"
                />
                <span className={verified.has(i) ? "text-[var(--cd-success)]" : undefined}>{verified.has(i) ? "Verified" : "Mark verified"}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── Research ───────────────────────────────────────────────────────────

function ResearchTab({ bolId }: { bolId: string }) {
  const bol = useBolRecord(bolId)!;
  const { bolRecords, saveResearchNotes, setSalesRelevance } = useStore();
  const [notes, setNotes] = useState(bol.research.notes);

  const sameCompanyBols = bol.customerMatch.companyId
    ? bolRecords.filter((b) => b.customerMatch.companyId === bol.customerMatch.companyId && b.id !== bol.id)
    : bolRecords.filter(
        (b) => b.id !== bol.id && bol.customerMatch.candidateName && normalize(b.customerMatch.candidateName) === normalize(bol.customerMatch.candidateName),
      );

  return (
    <div id="research-tab-anchor" className="flex flex-col gap-4">
      <Card>
        <CardHead title="Research notes" hint="Internal — visible to admins only until explicitly released." />
        <div className="flex flex-col gap-3 p-4">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => saveResearchNotes(bolId, notes)}
            placeholder="What did you find out about this company? Volume, fit, red flags, who to talk to…"
            className="h-32 w-full resize-none rounded-[var(--cd-radius-sm)] border border-[var(--cd-border-strong)] bg-[var(--cd-surface-2)] p-3 text-[13.5px] text-[var(--cd-text)] outline-none focus:border-[var(--cd-accent)] focus:bg-[var(--cd-surface)] focus:ring-2 focus:ring-[var(--cd-accent-soft)]"
          />
          <div>
            <p className={`mb-1.5 ${TEXT.label} text-[var(--cd-text-muted)]`}>Sales relevance</p>
            <SegmentedControl
              mode="field"
              options={[
                { key: "high", label: "High", tone: "success" },
                { key: "medium", label: "Medium", tone: "warning" },
                { key: "low", label: "Low", tone: "neutral" },
              ]}
              active={bol.research.salesRelevance ?? ""}
              onChange={(level) => setSalesRelevance(bolId, level as "high" | "medium" | "low")}
            />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHead title="Observed freight" />
          <div className="flex flex-wrap gap-1.5 p-4">
            {bol.research.observedFreight.length === 0 ? (
              <p className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>None logged yet.</p>
            ) : (
              bol.research.observedFreight.map((f) => <Badge key={f} tone="neutral">{f}</Badge>)
            )}
          </div>
        </Card>
        <Card>
          <CardHead title="Observed lanes" />
          <div className="flex flex-wrap gap-1.5 p-4">
            {bol.research.observedLanes.length === 0 ? (
              <p className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>None logged yet.</p>
            ) : (
              bol.research.observedLanes.map((l) => <Badge key={l} tone="neutral">{l}</Badge>)
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHead title="BOL history" hint={`${sameCompanyBols.length + 1} total for this company in the queue`} />
        {sameCompanyBols.length === 0 ? (
          <p className={`p-4 ${TEXT.micro} text-[var(--cd-text-muted)]`}>No other BOLs from this company yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--cd-border)]">
            {sameCompanyBols.map((b) => (
              <li key={b.id}>
                <Link href={`/crm-design/admin/bol-center/${b.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--cd-surface-hover)]">
                  <span className="text-[13px] font-semibold text-[var(--cd-text)]">{b.docNumber}</span>
                  <Badge tone={BOL_STATUS_TONE[b.status]}>{BOL_STATUS_LABEL[b.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ── Approve & Release ─────────────────────────────────────────────────

const RELEASE_FIELDS: { key: keyof BolReleaseSelection; label: string; defaultOn: boolean }[] = [
  { key: "locations", label: "Locations", defaultOn: true },
  { key: "generalContact", label: "General contact", defaultOn: true },
  { key: "observedFreight", label: "Observed freight", defaultOn: true },
  { key: "observedLanes", label: "Observed lanes", defaultOn: true },
  { key: "salesNotes", label: "Sales notes", defaultOn: true },
  { key: "originalBol", label: "Original BOL", defaultOn: false },
  { key: "internalResearch", label: "Internal research", defaultOn: false },
  { key: "sensitiveInfo", label: "Sensitive info", defaultOn: false },
  { key: "rawExtractedData", label: "Raw extracted data", defaultOn: false },
];

const DECIDABLE: BolStatus[] = ["needs_review", "ai_extracted", "researching", "ready_for_approval"];

/** A BOL always names a shipper and consignee, and sometimes a distinct
 * bill-to (see BolExtraction.billToName) — release lets Admin pick which of
 * those become their own Prospect. Shipper defaults on: the freight owner
 * is the real prospect for a hotshot/brokerage. */
const COMPANY_ROLE_META: { role: BolCompanyRole; label: string; field: keyof BolExtraction; tone: "accent" | "success" }[] = [
  { role: "shipper", label: "Shipper", field: "shipperName", tone: "accent" },
  { role: "consignee", label: "Consignee", field: "consigneeName", tone: "accent" },
  { role: "bill_to", label: "Bill-To", field: "billToName", tone: "success" },
];

function ApproveReleaseTab({ bolId }: { bolId: string }) {
  const bol = useBolRecord(bolId)!;
  const { setBolStatus, releaseBolToSales } = useStore();
  const [selection, setSelection] = useState<BolReleaseSelection>(() =>
    RELEASE_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: f.defaultOn }), {} as BolReleaseSelection),
  );
  const availableRoles = COMPANY_ROLE_META.filter((r) => bol.extraction[r.field]?.value?.trim());
  const [companyRoles, setCompanyRoles] = useState<Set<BolCompanyRole>>(
    () => new Set(bol.extraction.shipperName?.value?.trim() ? (["shipper"] as BolCompanyRole[]) : []),
  );
  const [confirmingReject, setConfirmingReject] = useState(false);

  const canDecide = DECIDABLE.includes(bol.status);

  function toggleRole(role: BolCompanyRole) {
    setCompanyRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHead title="Approval decision" hint="Approve = this is real, useful CRM intelligence — separate from releasing it to Sales." />
        <div className="flex flex-wrap items-center gap-2 p-4">
          {canDecide ? (
            <>
              <Button variant="admin" onClick={() => setBolStatus(bolId, "approved")}>
                Approve
              </Button>
              {bol.status === "ready_for_approval" && (
                <Button variant="secondary" onClick={() => setBolStatus(bolId, "researching")}>
                  Keep Researching
                </Button>
              )}
              <Button variant="danger" onClick={() => setConfirmingReject(true)}>
                Reject
              </Button>
            </>
          ) : bol.status === "approved" ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--cd-success)]">
              <IconCheck width={14} height={14} /> Approved — see release checklist below.
            </span>
          ) : bol.status === "released" ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--cd-admin)]">
              <IconCheck width={14} height={14} /> Released to Sales — see below.
            </span>
          ) : bol.status === "rejected" ? (
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[var(--cd-danger)]">Rejected.</span>
              <Button variant="secondary" size="sm" onClick={() => setBolStatus(bolId, "researching")}>
                Reopen
              </Button>
            </div>
          ) : bol.status === "archived" ? (
            <span className={`${TEXT.body} text-[var(--cd-text-muted)]`}>Archived — no further action.</span>
          ) : (
            <span className={`${TEXT.body} text-[var(--cd-text-muted)]`}>Run extraction first.</span>
          )}
        </div>
      </Card>

      <Card>
        <CardHead title="Release to Sales" hint="Admin picks exactly what Sales gets — never the whole record by default." />
        {bol.release ? (
          <div className="flex flex-col gap-3 p-4">
            <p className={`${TEXT.body} text-[var(--cd-text-muted)]`}>
              Released {formatDateTime(bol.release.releasedAt)} — this document stays here in BOL Center either way.
            </p>
            <ul className="flex flex-col gap-1.5">
              {bol.release.companies.map((rc) => (
                <li key={rc.companyId} className="flex items-center justify-between gap-3 rounded-[var(--cd-radius-sm)] border border-[var(--cd-border)] bg-[var(--cd-surface-2)] px-3 py-2">
                  <span className="min-w-0">
                    <Badge tone={COMPANY_ROLE_META.find((r) => r.role === rc.role)?.tone ?? "accent"}>
                      {COMPANY_ROLE_META.find((r) => r.role === rc.role)?.label ?? rc.role}
                    </Badge>
                    <span className="ml-2 truncate text-[13px] font-semibold text-[var(--cd-text)]">{rc.companyName}</span>
                  </span>
                  <TextLink href={`/crm-design/companies/${rc.companyId}`} className="shrink-0">
                    View Company →
                  </TextLink>
                </li>
              ))}
            </ul>
            <div>
              <TextLink href="/crm-design/prospects">View Prospects →</TextLink>
            </div>
          </div>
        ) : bol.status !== "approved" ? (
          <p className={`p-4 ${TEXT.micro} text-[var(--cd-text-muted)]`}>Approve this BOL first — release is only available for approved intelligence.</p>
        ) : (
          <div className="flex flex-col gap-4 p-4">
            <div>
              <p className={`mb-1.5 ${TEXT.label} text-[var(--cd-text-muted)]`}>Who becomes a prospect?</p>
              <p className={`mb-2 ${TEXT.micro} text-[var(--cd-text-muted)]`}>Each checked company gets its own Prospect card — shipper is the freight owner and defaults on.</p>
              <div className="flex flex-col gap-1.5">
                {availableRoles.map((r) => (
                  <label
                    key={r.role}
                    className="flex items-center gap-2.5 rounded-[var(--cd-radius-sm)] border border-[var(--cd-border-strong)] bg-[var(--cd-surface-2)] px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={companyRoles.has(r.role)}
                      onChange={() => toggleRole(r.role)}
                      className="h-4 w-4 accent-[var(--cd-admin)]"
                    />
                    <Badge tone={r.tone}>{r.label}</Badge>
                    <span className="truncate text-[13px] text-[var(--cd-text)]">{bol.extraction[r.field]?.value}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className={`mb-1.5 ${TEXT.label} text-[var(--cd-text-muted)]`}>What Sales sees</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {RELEASE_FIELDS.map((f) => (
                  <label key={f.key} className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={selection[f.key]}
                      onChange={(e) => setSelection((prev) => ({ ...prev, [f.key]: e.target.checked }))}
                      className="h-4 w-4 accent-[var(--cd-admin)]"
                    />
                    <span className="text-[13px] text-[var(--cd-text)]">{f.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Button variant="admin" disabled={companyRoles.size === 0} onClick={() => releaseBolToSales(bolId, selection, Array.from(companyRoles))}>
                Release to Sales
              </Button>
              {companyRoles.size === 0 && (
                <p className={`mt-1.5 ${TEXT.micro} text-[var(--cd-text-muted)]`}>Pick at least one company above.</p>
              )}
            </div>
          </div>
        )}
      </Card>

      <Modal
        open={confirmingReject}
        onClose={() => setConfirmingReject(false)}
        title="Reject this BOL?"
        subtitle="Filed, not deleted — it can be reopened from here later."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmingReject(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setBolStatus(bolId, "rejected");
                setConfirmingReject(false);
              }}
            >
              Reject
            </Button>
          </>
        }
      >
        <p className={`${TEXT.body} text-[var(--cd-text-muted)]`}>
          {bol.docNumber} won&rsquo;t be reviewed further and won&rsquo;t be released to Sales. Same confirmation
          pattern as Admin → Suspend &amp; Reassign.
        </p>
      </Modal>
    </div>
  );
}
