"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useBolRecord, useCompany, useStore, useTeamMemberById } from "../../../../_lib/store";
import { Badge, Breadcrumb, Button, Card, CardHead, PAGE_WIDTH, TEXT } from "../../../../_design/ui";
import { Tabs } from "../../../../_design/Tabs";
import { BOL_STATUS_DESCRIPTION, BOL_STATUS_LABEL, BOL_STATUS_TONE } from "../../../../_lib/bolStatus";
import { firstName, formatDateTime } from "../../../../_lib/format";
import { BolDocumentViewer } from "../../../../_shared/BolDocumentViewer";
import { IconCheck, IconMapPin } from "../../../../_design/icons";
import type { BolExtraction, BolReleaseSelection, BolStatus } from "../../../../_lib/types";

type TabKey = "extraction" | "customer" | "contacts" | "research" | "approve";

export default function BolDetailPage() {
  const params = useParams<{ id: string }>();
  const bol = useBolRecord(params.id);
  const { runExtraction, setBolStatus } = useStore();
  const [tab, setTab] = useState<TabKey>("extraction");

  if (!bol) return notFound();

  const pending = bol.docNumber === "—";
  const reviewer = useTeamMemberById(bol.assignedReviewerId);

  const nextAction = (() => {
    if (bol.status === "new") return { label: "Run AI Extraction", onClick: () => runExtraction(bol.id) };
    if (bol.status === "needs_review" || bol.status === "ai_extracted")
      return { label: "Start Research →", onClick: () => setBolStatus(bol.id, "researching") };
    if (bol.status === "researching")
      return { label: "Mark Ready for Approval →", onClick: () => setBolStatus(bol.id, "ready_for_approval") };
    return null;
  })();

  return (
    <div className={PAGE_WIDTH}>
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr] lg:items-start">
        {/* Left — persistent document viewer */}
        <div className="lg:sticky lg:top-4">
          <Card className="p-3.5">
            <BolDocumentViewer bol={bol} />
          </Card>
          <Card className="mt-3 p-3.5">
            <dl className="space-y-2">
              <Row label="Uploaded" value={formatDateTime(bol.uploadedAt)} />
              <Row label="Reviewer" value={reviewer ? reviewer.name : "Unassigned"} />
            </dl>
          </Card>
        </div>

        {/* Right — tabbed review workspace */}
        <div>
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
    </div>
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
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
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
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--cd-radius-md)] border border-[var(--cd-success)]/30 bg-[var(--cd-success-soft)] px-4 py-3.5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--cd-success)]">Match found</p>
                <p className="text-[15px] font-bold text-[var(--cd-text)]">{matchedCompany.name}</p>
                <p className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>Already in the CRM — this BOL adds evidence, it doesn&rsquo;t create anything new.</p>
              </div>
              <Link href={`/crm-design/companies/${matchedCompany.id}`}>
                <Button variant="secondary" size="sm">View Company</Button>
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="rounded-[var(--cd-radius-md)] border border-[var(--cd-accent)]/30 bg-[var(--cd-accent-soft)] px-4 py-3.5">
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
                  <select
                    className="mt-2 h-9 w-full rounded-[var(--cd-radius-sm)] border border-[var(--cd-border-strong)] bg-[var(--cd-surface-2)] px-2.5 text-[13px] text-[var(--cd-text)]"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) confirmCustomerMatch(bolId, "matched", e.target.value);
                    }}
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
                </details>
              )}
            </div>
          )}

          {duplicate && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-[var(--cd-radius-md)] border border-[var(--cd-warning)]/30 bg-[var(--cd-warning-soft)] px-4 py-2.5">
              <p className={`${TEXT.micro} text-[var(--cd-text)]`}>
                Possible duplicate — <span className="font-semibold">{duplicate.docNumber}</span> looks like the same
                company (&ldquo;{duplicate.customerMatch.candidateName}&rdquo;). Consolidate before releasing either one.
              </p>
              <Link href={`/crm-design/admin/bol-center/${duplicate.id}`}>
                <Button variant="secondary" size="sm">Compare</Button>
              </Link>
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
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
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
                          <select
                            className="h-8 rounded-[var(--cd-radius-sm)] border border-[var(--cd-border-strong)] bg-[var(--cd-surface-2)] px-2 text-[11.5px] text-[var(--cd-text)]"
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) confirmLocation(bolId, i, "existing", e.target.value);
                            }}
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
              <button
                type="button"
                onClick={() =>
                  setVerified((prev) => {
                    const next = new Set(prev);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    return next;
                  })
                }
                className={`flex shrink-0 items-center gap-1.5 rounded-[var(--cd-radius-sm)] border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors ${
                  verified.has(i)
                    ? "border-[var(--cd-success)]/30 bg-[var(--cd-success-soft)] text-[var(--cd-success)]"
                    : "border-[var(--cd-border-strong)] bg-[var(--cd-surface)] text-[var(--cd-text-muted)] hover:bg-[var(--cd-surface-hover)]"
                }`}
              >
                <IconCheck width={12} height={12} /> {verified.has(i) ? "Verified" : "Mark verified"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── Research ───────────────────────────────────────────────────────────

const RELEVANCE_TONE = { high: "success", medium: "warning", low: "neutral" } as const;

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
            <div className="flex gap-2">
              {(["high", "medium", "low"] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setSalesRelevance(bolId, level)}
                  className={`rounded-[var(--cd-radius-sm)] border px-3 py-1.5 text-[12px] font-bold capitalize transition-colors ${
                    bol.research.salesRelevance === level
                      ? level === "high"
                        ? "border-[var(--cd-success)]/40 bg-[var(--cd-success-soft)] text-[var(--cd-success)]"
                        : level === "medium"
                          ? "border-[var(--cd-warning)]/40 bg-[var(--cd-warning-soft)] text-[var(--cd-warning)]"
                          : "border-[var(--cd-border-strong)] bg-[var(--cd-surface-2)] text-[var(--cd-text-muted)]"
                      : "border-[var(--cd-border-strong)] bg-[var(--cd-surface)] text-[var(--cd-text-muted)] hover:bg-[var(--cd-surface-hover)]"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
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
  { key: "company", label: "Company", defaultOn: true },
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

function ApproveReleaseTab({ bolId }: { bolId: string }) {
  const bol = useBolRecord(bolId)!;
  const { setBolStatus, releaseBolToSales } = useStore();
  const [selection, setSelection] = useState<BolReleaseSelection>(() =>
    RELEASE_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: f.defaultOn }), {} as BolReleaseSelection),
  );

  const canDecide = DECIDABLE.includes(bol.status);

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
              <Button variant="danger" onClick={() => setBolStatus(bolId, "rejected")}>
                Reject
              </Button>
            </>
          ) : bol.status === "approved" ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--cd-success)]">
              <IconCheck width={14} height={14} /> Approved — see release checklist below.
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
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className={`${TEXT.body} text-[var(--cd-text-muted)]`}>
              Released {formatDateTime(bol.release.releasedAt)}. Sales can now see the checked fields on the customer's
              profile.
            </p>
            {bol.customerMatch.companyId && (
              <Link href={`/crm-design/companies/${bol.customerMatch.companyId}`}>
                <Button variant="secondary" size="sm">View Company →</Button>
              </Link>
            )}
          </div>
        ) : bol.status !== "approved" ? (
          <p className={`p-4 ${TEXT.micro} text-[var(--cd-text-muted)]`}>Approve this BOL first — release is only available for approved intelligence.</p>
        ) : (
          <div className="flex flex-col gap-3 p-4">
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
            <div>
              <Button variant="admin" onClick={() => releaseBolToSales(bolId, selection)}>
                Release to Sales
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
