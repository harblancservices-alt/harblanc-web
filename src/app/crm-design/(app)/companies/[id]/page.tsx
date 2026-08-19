"use client";

import { useState } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useCompany, useStore, useTeamMemberById } from "../../../_lib/store";
import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Card,
  CardHead,
  EmptyState,
  PAGE_WIDTH,
  TEXT,
} from "../../../_design/ui";
import { Tabs } from "../../../_design/Tabs";
import { STAGE_LABEL, STAGE_ORDER, STAGE_TONE } from "../../../_lib/lifecycle";
import { daysAgoLabel, firstName, formatDate, relativeTime } from "../../../_lib/format";
import {
  IconActivity,
  IconBuilding,
  IconCheck,
  IconContacts,
  IconDocument,
  IconInbox,
  IconMail,
  IconMapPin,
  IconPhone,
  IconPlus,
  IconTasks,
} from "../../../_design/icons";
import { AddContactDrawer } from "../../../_shared/AddContactDrawer";
import { LogActivityModal } from "../../../_shared/LogActivityModal";
import { GenerateDocumentDrawer } from "../../../_shared/GenerateDocumentDrawer";

const STAGE_TONE_MAP = { neutral: "neutral", accent: "accent", success: "success", danger: "danger" } as const;

type TabKey = "overview" | "contacts" | "activity" | "documents" | "tasks" | "intelligence";

export default function CompanyDetailPage() {
  const params = useParams<{ id: string }>();
  const company = useCompany(params.id);
  const { contacts, activities, documents, tasks, bolRecords, companyLocations, currentUser, moveStage, toggleTask } = useStore();
  const [tab, setTab] = useState<TabKey>("overview");
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [logActivityOpen, setLogActivityOpen] = useState(false);
  const [generateDocOpen, setGenerateDocOpen] = useState(false);

  const rep = useTeamMemberById(company?.assignedUserId);

  if (!company) return notFound();

  const companyContacts = contacts.filter((c) => c.companyId === company.id);
  const companyActivities = activities.filter((a) => a.companyId === company.id);
  const companyDocuments = documents.filter((d) => d.companyId === company.id);
  const companyTasks = tasks.filter((t) => t.companyId === company.id);
  const isLost = company.stage === "lost";

  // Customer Intelligence — released BOL Center data only. A BOL never
  // reaches this list until an admin explicitly released it (BOL Center §10);
  // this tab is what "landing on the Customer profile" (audit item #12)
  // actually looks like. Each released BOL's own selection gates which of
  // its fields are even eligible to show here — checking "Company" but not
  // "Observed freight" on one BOL, for instance, means that BOL contributes
  // nothing to the freight list below.
  const releasedBols = bolRecords.filter((b) => b.customerMatch.companyId === company.id && b.release);
  const companyLocs = companyLocations.filter((l) => l.companyId === company.id);
  const observedFreight = Array.from(
    new Set(releasedBols.filter((b) => b.release!.selection.observedFreight).flatMap((b) => b.research.observedFreight)),
  );
  const observedLanes = Array.from(
    new Set(releasedBols.filter((b) => b.release!.selection.observedLanes).flatMap((b) => b.research.observedLanes)),
  );
  const salesNotes = releasedBols.filter((b) => b.release!.selection.salesNotes && b.research.notes);
  const lastObserved = releasedBols.reduce<string | null>(
    (latest, b) => (!latest || b.uploadedAt > latest ? b.uploadedAt : latest),
    null,
  );
  const isElevated = currentUser.role === "owner" || currentUser.role === "admin";

  return (
    <div className={PAGE_WIDTH}>
      <Breadcrumb items={[{ label: "Companies", href: "/crm-design/companies" }, { label: company.name }]} />

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--cd-radius-md)] bg-[var(--cd-accent-soft)] text-[var(--cd-accent)]">
            <IconBuilding width={20} height={20} />
          </span>
          <div>
            <h1 className={`${TEXT.pageTitle} text-[var(--cd-text)]`}>{company.name}</h1>
            <p className={`${TEXT.body} text-[var(--cd-text-muted)]`}>
              {company.industry} · {company.city}, {company.state}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setLogActivityOpen(true)}>
            <IconActivity width={15} height={15} /> Log activity
          </Button>
          <Button variant="primary" onClick={() => setGenerateDocOpen(true)}>
            <IconDocument width={15} height={15} /> Generate document
          </Button>
        </div>
      </div>

      {/* Stage tracker */}
      {!isLost && (
        <Card className="mb-4 overflow-x-auto p-3">
          <div className="flex min-w-max items-center gap-1">
            {STAGE_ORDER.map((s, i) => {
              const currentIdx = STAGE_ORDER.indexOf(company.stage as typeof STAGE_ORDER[number]);
              const reached = i <= currentIdx;
              const isCurrent = s === company.stage;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => moveStage(company.id, s)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors ${
                    isCurrent
                      ? "bg-[var(--cd-accent)] text-white"
                      : reached
                        ? "bg-[var(--cd-accent-soft)] text-[var(--cd-accent)]"
                        : "bg-[var(--cd-surface-2)] text-[var(--cd-text-subtle)] hover:bg-[var(--cd-border)]"
                  }`}
                >
                  {reached && !isCurrent && <IconCheck width={11} height={11} />}
                  {STAGE_LABEL[s]}
                  {i < STAGE_ORDER.length - 1 && <span className="ml-1 text-[var(--cd-text-subtle)]">›</span>}
                </button>
              );
            })}
          </div>
        </Card>
      )}
      {isLost && (
        <Card className="mb-4 flex items-center justify-between p-3.5">
          <Badge tone="danger">Lost</Badge>
          <Button variant="secondary" size="sm" onClick={() => moveStage(company.id, "contacted")}>
            Reopen as Contacted
          </Button>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        {/* Left — details card */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHead title="Company details" />
            <dl className="divide-y divide-[var(--cd-border)]">
              <Detail icon={<IconMapPin width={14} height={14} />} label="Location" value={`${company.city}, ${company.state}`} />
              <Detail icon={<IconPhone width={14} height={14} />} label="Phone" value={company.phone} />
              <Detail label="Website" value={company.website} />
              <Detail label="Fit rating" value={"★".repeat(company.fitRating) + "☆".repeat(5 - company.fitRating)} />
              <Detail label="Annual freight spend" value={company.annualFreightSpend} />
              <Detail label="Assigned to" value={rep?.name ?? "Unassigned"} />
            </dl>
            {company.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-t border-[var(--cd-border)] p-3.5">
                {company.tags.map((t) => (
                  <Badge key={t} tone="neutral">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
          </Card>
          {company.notes && (
            <Card>
              <CardHead title="Notes" />
              <p className={`p-3.5 ${TEXT.body} leading-relaxed text-[var(--cd-text-muted)]`}>{company.notes}</p>
            </Card>
          )}
        </div>

        {/* Right — tabs */}
        <div>
          <Tabs
            tabs={[
              { key: "overview", label: "Overview" },
              { key: "contacts", label: "Contacts", count: companyContacts.length },
              { key: "activity", label: "Activity", count: companyActivities.length },
              { key: "documents", label: "Documents", count: companyDocuments.length },
              { key: "tasks", label: "Tasks", count: companyTasks.filter((t) => t.status === "open").length },
              { key: "intelligence", label: "Intelligence", count: releasedBols.length },
            ]}
            active={tab}
            onChange={setTab}
          />

          <div className="mt-3">
            {tab === "overview" && (
              <Card>
                <CardHead title="Recent activity" />
                {companyActivities.length === 0 ? (
                  <EmptyState icon={<IconActivity />} title="No activity yet" body="Calls, notes, and stage changes for this company will show up here." />
                ) : (
                  <ul className="divide-y divide-[var(--cd-border)]">
                    {companyActivities.slice(0, 5).map((a) => (
                      <li key={a.id} className="px-4 py-3">
                        <p className="text-[13.5px] font-medium text-[var(--cd-text)]">{a.title}</p>
                        {a.body && <p className={`mt-0.5 ${TEXT.micro} text-[var(--cd-text-muted)]`}>{a.body}</p>}
                        <p className={`mt-0.5 ${TEXT.micro} text-[var(--cd-text-muted)]`}>{relativeTime(a.occurredAt)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {tab === "contacts" && (
              <Card>
                <CardHead title="Contacts" right={
                  <Button size="sm" variant="secondary" onClick={() => setAddContactOpen(true)}>
                    <IconPlus width={13} height={13} /> Add contact
                  </Button>
                } />
                {companyContacts.length === 0 ? (
                  <EmptyState icon={<IconContacts />} title="No contacts yet" body="Add the people you work with at this company." action={
                    <Button size="sm" variant="primary" onClick={() => setAddContactOpen(true)}>Add contact</Button>
                  } />
                ) : (
                  <ul className="divide-y divide-[var(--cd-border)]">
                    {companyContacts.map((c) => (
                      <li key={c.id}>
                        <Link href={`/crm-design/contacts/${c.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--cd-surface-2)]">
                          <Avatar name={c.name} size={34} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13.5px] font-semibold text-[var(--cd-text)]">
                              {c.name} {c.isDecisionMaker && <Badge tone="accent">DM</Badge>}
                            </p>
                            <p className={`truncate ${TEXT.micro} text-[var(--cd-text-muted)]`}>{c.title}</p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {tab === "activity" && (
              <Card>
                <CardHead title="Activity log" right={
                  <Button size="sm" variant="secondary" onClick={() => setLogActivityOpen(true)}>
                    <IconPlus width={13} height={13} /> Log activity
                  </Button>
                } />
                {companyActivities.length === 0 ? (
                  <EmptyState icon={<IconActivity />} title="No activity yet" body="Nothing has been logged for this company." />
                ) : (
                  <ul className="divide-y divide-[var(--cd-border)]">
                    {companyActivities.map((a) => (
                      <ActivityRow key={a.id} authorId={a.authorId} title={a.title} body={a.body} occurredAt={a.occurredAt} kind={a.kind} />
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {tab === "documents" && (
              <Card>
                <CardHead title="Documents" right={
                  <Button size="sm" variant="secondary" onClick={() => setGenerateDocOpen(true)}>
                    <IconPlus width={13} height={13} /> Generate document
                  </Button>
                } />
                {companyDocuments.length === 0 ? (
                  <EmptyState icon={<IconDocument />} title="No documents yet" body="Generate a Rate Confirmation or Bill of Lading for this shipment." action={
                    <Button size="sm" variant="primary" onClick={() => setGenerateDocOpen(true)}>Generate document</Button>
                  } />
                ) : (
                  <ul className="divide-y divide-[var(--cd-border)]">
                    {companyDocuments.map((d) => (
                      <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--cd-radius-sm)] bg-[var(--cd-accent-soft)] text-[var(--cd-accent)]">
                          <IconDocument width={16} height={16} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-semibold text-[var(--cd-text)]">{d.label}</p>
                          <p className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>{formatDate(d.createdAt)}</p>
                        </div>
                        <Badge tone={d.status === "signed" ? "success" : d.status === "sent" ? "accent" : "neutral"}>{d.status}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {tab === "tasks" && (
              <Card>
                <CardHead title="Tasks" />
                {companyTasks.length === 0 ? (
                  <EmptyState icon={<IconTasks />} title="No tasks yet" body="Tasks for this company will show up here." />
                ) : (
                  <ul className="divide-y divide-[var(--cd-border)]">
                    {companyTasks.map((t) => (
                      <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleTask(t.id)}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                            t.status === "done"
                              ? "border-[var(--cd-success)] bg-[var(--cd-success)] text-white"
                              : "border-[var(--cd-border-strong)] text-transparent hover:border-[var(--cd-accent)]"
                          }`}
                        >
                          <IconCheck width={12} height={12} />
                        </button>
                        <p className={`flex-1 text-[13.5px] font-medium ${t.status === "done" ? "text-[var(--cd-text-subtle)] line-through" : "text-[var(--cd-text)]"}`}>
                          {t.title}
                        </p>
                        {t.dueAt && <span className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>{relativeTime(t.dueAt)}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {tab === "intelligence" && (
              <div className="flex flex-col gap-4">
                {releasedBols.length === 0 ? (
                  <Card>
                    <EmptyState
                      icon={<IconInbox />}
                      title="No BOL intelligence released yet"
                      body="When an admin releases BOL Center research for this company, verified locations, observed freight, and observed lanes will show up here."
                    />
                  </Card>
                ) : (
                  <>
                    <Card className="flex flex-wrap items-center gap-4 p-4">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cd-text-muted)]">Sales status</span>
                      <Badge tone="accent">AI-sourced · Released</Badge>
                      <span className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>
                        {releasedBols.length} verified {releasedBols.length === 1 ? "BOL" : "BOLs"} · Last observed{" "}
                        {lastObserved ? relativeTime(lastObserved) : "—"}
                      </span>
                    </Card>

                    {companyLocs.length > 0 && (
                      <Card>
                        <CardHead title="Locations" hint="From the customer's BOL history, not manually entered." />
                        <ul className="divide-y divide-[var(--cd-border)]">
                          {companyLocs.map((l) => (
                            <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                              <div className="min-w-0">
                                <p className="text-[13.5px] font-semibold text-[var(--cd-text)]">{l.label}</p>
                                <p className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>{l.address}, {l.city}, {l.state}</p>
                              </div>
                              <span className={`shrink-0 ${TEXT.micro} text-[var(--cd-text-muted)]`}>
                                {l.bolCount} {l.bolCount === 1 ? "BOL" : "BOLs"} · {l.source === "bol" ? "BOL-sourced" : "Manual"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </Card>
                    )}

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Card>
                        <CardHead title="Observed freight" />
                        <div className="flex flex-wrap gap-1.5 p-4">
                          {observedFreight.length === 0 ? (
                            <p className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>Not released.</p>
                          ) : (
                            observedFreight.map((f) => <Badge key={f} tone="neutral">{f}</Badge>)
                          )}
                        </div>
                      </Card>
                      <Card>
                        <CardHead title="Observed lanes" />
                        <div className="flex flex-wrap gap-1.5 p-4">
                          {observedLanes.length === 0 ? (
                            <p className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>Not released.</p>
                          ) : (
                            observedLanes.map((l) => <Badge key={l} tone="neutral">{l}</Badge>)
                          )}
                        </div>
                      </Card>
                    </div>

                    {salesNotes.length > 0 && (
                      <Card>
                        <CardHead title="Sales notes" hint="Research notes an admin chose to release." />
                        <ul className="divide-y divide-[var(--cd-border)]">
                          {salesNotes.map((b) => (
                            <li key={b.id} className={`px-4 py-3 ${TEXT.body} text-[var(--cd-text-muted)]`}>
                              {b.research.notes}
                            </li>
                          ))}
                        </ul>
                      </Card>
                    )}

                    <Card>
                      <CardHead title="BOL sources" hint={`${releasedBols.length} verified`} />
                      <div className="flex flex-wrap gap-1.5 p-4">
                        {releasedBols.map((b) =>
                          isElevated ? (
                            <Link key={b.id} href={`/crm-design/admin/bol-center/${b.id}`}>
                              <Badge tone="admin">{b.docNumber}</Badge>
                            </Link>
                          ) : (
                            <Badge key={b.id} tone="neutral">{b.docNumber}</Badge>
                          ),
                        )}
                      </div>
                    </Card>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <AddContactDrawer open={addContactOpen} onClose={() => setAddContactOpen(false)} companyId={company.id} />
      <LogActivityModal open={logActivityOpen} onClose={() => setLogActivityOpen(false)} companyId={company.id} />
      <GenerateDocumentDrawer open={generateDocOpen} onClose={() => setGenerateDocOpen(false)} companyId={company.id} />
    </div>
  );
}

function Detail({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
      <span className={`flex items-center gap-1.5 ${TEXT.micro} font-semibold text-[var(--cd-text-muted)]`}>
        {icon}
        {label}
      </span>
      <span className="truncate text-[12.5px] font-medium text-[var(--cd-text)]">{value}</span>
    </div>
  );
}

function ActivityRow({ authorId, title, body, occurredAt, kind }: { authorId: string; title: string; body: string | null; occurredAt: string; kind: string }) {
  const author = useTeamMemberById(authorId);
  const ICON: Record<string, React.ReactNode> = {
    call: <IconPhone width={14} height={14} />,
    email: <IconMail width={14} height={14} />,
    note: <IconActivity width={14} height={14} />,
    stage_change: <IconCheck width={14} height={14} />,
    document: <IconDocument width={14} height={14} />,
    task: <IconTasks width={14} height={14} />,
  };
  return (
    <li className="flex gap-3 px-4 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--cd-surface-2)] text-[var(--cd-text-muted)]">
        {ICON[kind] ?? <IconActivity width={14} height={14} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-[var(--cd-text)]">{title}</p>
        {body && <p className={`mt-0.5 ${TEXT.micro} text-[var(--cd-text-muted)]`}>{body}</p>}
        <p className={`mt-0.5 ${TEXT.micro} text-[var(--cd-text-muted)]`}>
          {firstName(author?.name ?? "Someone")} · {relativeTime(occurredAt)}
        </p>
      </div>
    </li>
  );
}
