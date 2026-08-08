import { notFound } from "next/navigation";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { CRM_ACTIVITY } from "@/lib/crm/activity";
import { PageShell, Card, CardHead, BTN_EDIT } from "../../_shell/ui";
import { BackButton } from "../../_shell/BackButton";
import { formatDate, formatMoney, firstName } from "../../_shell/format";
import { parsePhones, parseLinks, normalizeHref } from "../../_shell/contactFields";
import { ProfileTabs } from "./ProfileTabs";
import { stageLabel, stageTone } from "../lifecycle";
import type { RepOption } from "../CompanyDialog";
import { EditCompany } from "./EditCompany";
import { FinalizeBanner } from "./FinalizeBanner";
import { CompanyCard } from "./CompanyCard";
import { ContactsSection, type CrmContact } from "./ContactsSection";
import { StrayNumbersSection } from "./StrayNumbersSection";
import { ContactDialog } from "./ContactDialog";
import { AiResearchSection, type CrmNote } from "./AiResearchSection";
import { PeopleSection, type CrmPerson } from "./PeopleSection";
import { HistorySection, type CrmHistoryItem } from "./HistorySection";
import { type CrmCommodityPhoto } from "./CommodityPhotoTiles";
import { TasksSection } from "./TasksSection";
import { LogCallButton } from "./LogCallButton";
import { callOutcomeLabel } from "../../calls/outcomes";
import { type CrmTaskItem } from "../../tasks/TaskRow";
import { BolSection, type CrmBolDocument } from "./BolSection";
import { IconPlus } from "../../_shell/icons";

export const dynamic = "force-dynamic";

const STORAGE_BUCKET = "crm-documents";
const SIGNED_URL_TTL_SECONDS = 300;

type ProfileRow = { id: string; full_name: string | null; email: string | null; is_active: boolean };

function profileName(p: ProfileRow | undefined): string | null {
  if (!p) return null;
  return firstName(p.full_name, p.email) || null;
}

/**
 * Company profile — the premium, full-record view of a single crm_account.
 * Everything is RLS-scoped to the caller's org. Layout: a permanent LEFT
 * "Company" card (lifecycle/rep/address/phones/links/commodities/photos —
 * see CompanyCard.tsx) that stays mounted across every tab, and a RIGHT
 * column that's the only thing ProfileTabs switches — a name/stage/actions
 * strip above a segmented tab bar. The Overview tab stacks Tasks, People,
 * and History (a merged, date-grouped notes+calls+activity feed).
 */
export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();
  const isOwner = user.role === "owner";

  const { data: account } = await supabase
    .from("crm_accounts")
    .select(
      "id, name, industry, website, phone, phones, links, address, city, state, zip, company_size, commodities, annual_freight_spend, revenue_potential, source, lifecycle_status, assigned_user_id, primary_contact_id, needs_finalize, created_at",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!account) notFound();

  // Fan out the related reads (each RLS-scoped to the caller's org).
  const [
    profilesRes,
    contactsRes,
    notesRes,
    callsRes,
    activitiesRes,
    tasksRes,
    documentsRes,
    commodityPhotosRes,
  ] = await Promise.all([
    supabase.from("crm_profiles").select("id, full_name, email, is_active"),
    supabase
      .from("crm_contacts")
      .select(
        "id, name, title, email, phones, links, best_time_to_call, is_decision_maker, notes, next_followup_at, last_contacted_at, role_category",
      )
      .eq("account_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("crm_notes")
      .select("id, body, is_ai, created_at, user_id, contact_id")
      .eq("account_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("crm_calls")
      .select(
        "id, contact_id, outcome, duration_seconds, summary, notes, occurred_at, user_id",
      )
      .eq("account_id", id)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(200),
    // Calls and "note added" rows are excluded — both already have a richer
    // record included directly (crm_calls / crm_notes below), so including
    // their generic activity-log line too would just repeat the same event.
    supabase
      .from("crm_activities")
      .select("id, kind, summary, body, occurred_at, user_id")
      .eq("account_id", id)
      .not("kind", "in", `(${CRM_ACTIVITY.call},${CRM_ACTIVITY.noteAdded})`)
      .order("occurred_at", { ascending: false })
      .limit(150),
    supabase
      .from("crm_tasks")
      .select(
        "id, title, notes, task_type, due_at, priority, status, completed_at, reminder_at, account_id, contact_id, assigned_user_id",
      )
      .eq("account_id", id)
      .is("deleted_at", null)
      .order("status", { ascending: true })
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("crm_documents")
      .select("id, file_name, storage_path, mime_type, size_bytes, created_at, user_id")
      .eq("account_id", id)
      .eq("kind", "bol")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("crm_documents")
      .select("id, file_name, storage_path, created_at")
      .eq("account_id", id)
      .eq("kind", "commodity_photo")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(60),
  ]);

  const profiles = (profilesRes.data ?? []) as ProfileRow[];
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const reps: RepOption[] = profiles
    .filter((p) => p.is_active)
    .map((p) => ({ id: p.id, label: profileName(p) ?? "Unnamed rep" }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const contactRows = (contactsRes.data ?? []) as {
    id: string;
    name: string;
    title: string | null;
    email: string | null;
    phones: unknown;
    links: unknown;
    best_time_to_call: string | null;
    is_decision_maker: boolean;
    notes: string | null;
    next_followup_at: string | null;
    last_contacted_at: string | null;
    role_category: string | null;
  }[];
  const contacts: CrmContact[] = contactRows.map((c) => ({
    ...c,
    phones: parsePhones(c.phones),
    links: parseLinks(c.links),
  }));
  const contactNameById = new Map(contacts.map((c) => [c.id, c.name]));
  const contactPhoneById = new Map(contacts.map((c) => [c.id, c.phones[0]?.number || null]));
  const contactEmailById = new Map(contacts.map((c) => [c.id, c.email]));
  const companyPhone = parsePhones(account.phones)[0]?.number || (account.phone as string | null) || null;

  const people: CrmPerson[] = contactRows.map((c) => ({
    id: c.id,
    name: c.name,
    title: c.title,
    email: c.email,
    phones: parsePhones(c.phones),
    is_decision_maker: c.is_decision_maker,
    last_contacted_at: c.last_contacted_at,
    role_category: c.role_category,
  }));

  const notesRows = (notesRes.data ?? []) as {
    id: string;
    body: string;
    is_ai: boolean | null;
    created_at: string;
    user_id: string | null;
    contact_id: string | null;
  }[];
  const aiNotes: CrmNote[] = notesRows
    .filter((n) => n.is_ai)
    .map((n) => ({
      id: n.id,
      body: n.body,
      is_pinned: false,
      is_ai: true,
      created_at: n.created_at,
      author: n.user_id ? profileName(profileById.get(n.user_id)) : null,
      contactName: n.contact_id
        ? firstName(contactNameById.get(n.contact_id) ?? null) || null
        : null,
    }));

  const tasks: CrmTaskItem[] = ((tasksRes.data ?? []) as {
    id: string;
    title: string;
    notes: string | null;
    task_type: string | null;
    due_at: string | null;
    priority: string | null;
    status: string;
    completed_at: string | null;
    reminder_at: string | null;
    account_id: string | null;
    contact_id: string | null;
    assigned_user_id: string | null;
  }[]).map((t) => ({
    ...t,
    companyName: account.name as string,
    contactName: t.contact_id ? contactNameById.get(t.contact_id) ?? null : null,
    assigneeName: t.assigned_user_id
      ? profileName(profileById.get(t.assigned_user_id))
      : null,
    contactPhone: t.contact_id ? contactPhoneById.get(t.contact_id) ?? null : null,
    contactEmail: t.contact_id ? contactEmailById.get(t.contact_id) ?? null : null,
    companyPhone,
  }));

  const documents: CrmBolDocument[] = ((documentsRes.data ?? []) as {
    id: string;
    file_name: string;
    storage_path: string;
    mime_type: string | null;
    size_bytes: number | null;
    created_at: string;
    user_id: string | null;
  }[]).map((d) => ({
    id: d.id,
    fileName: d.file_name,
    storagePath: d.storage_path,
    mimeType: d.mime_type,
    sizeBytes: d.size_bytes,
    createdAt: d.created_at,
    uploaderName: d.user_id ? profileName(profileById.get(d.user_id)) : null,
  }));

  // Commodity photos — signed URLs are resolved server-side (the bucket is
  // private) in one batch call rather than per-tile client fetches.
  const commodityPhotoRows = (commodityPhotosRes.data ?? []) as {
    id: string;
    file_name: string;
    storage_path: string;
    created_at: string;
  }[];
  const photoPaths = commodityPhotoRows.map((p) => p.storage_path);
  const signedUrlByPath = new Map<string, string>();
  if (photoPaths.length) {
    const { data: signedRows } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrls(photoPaths, SIGNED_URL_TTL_SECONDS);
    for (const row of signedRows ?? []) {
      if (row.signedUrl && row.path) signedUrlByPath.set(row.path, row.signedUrl);
    }
  }
  const commodityPhotos: CrmCommodityPhoto[] = commodityPhotoRows.map((p) => ({
    id: p.id,
    fileName: p.file_name,
    storagePath: p.storage_path,
    signedUrl: signedUrlByPath.get(p.storage_path) ?? null,
  }));

  // ── History — notes + calls + the remaining (non-call, non-note) activity
  // rows, merged into one newest-first feed. See HistorySection.tsx. ──
  const historyFromNotes: CrmHistoryItem[] = notesRows
    .filter((n) => !n.is_ai)
    .map((n) => {
      const contactName = n.contact_id
        ? firstName(contactNameById.get(n.contact_id) ?? null) || null
        : null;
      return {
        id: n.id,
        type: "note" as const,
        occurredAt: n.created_at,
        author: n.user_id ? profileName(profileById.get(n.user_id)) : null,
        title: contactName ? `Note re ${contactName}: ${n.body}` : n.body,
        body: null,
      };
    });

  const callRows = (callsRes.data ?? []) as {
    id: string;
    contact_id: string | null;
    outcome: string | null;
    duration_seconds: number | null;
    summary: string | null;
    notes: string | null;
    occurred_at: string;
    user_id: string | null;
  }[];
  const historyFromCalls: CrmHistoryItem[] = callRows.map((c) => {
    const contactName = c.contact_id ? contactNameById.get(c.contact_id) ?? null : null;
    const durLabel = c.duration_seconds ? ` · ${Math.round(c.duration_seconds / 60)}m` : "";
    const title = `Call · ${callOutcomeLabel(c.outcome)}${durLabel}${contactName ? ` · ${contactName}` : ""}`;
    const body = [c.summary, c.notes].filter(Boolean).join("\n") || null;
    return {
      id: c.id,
      type: "call" as const,
      occurredAt: c.occurred_at,
      author: c.user_id ? profileName(profileById.get(c.user_id)) : null,
      title,
      body,
    };
  });

  const historyFromActivities: CrmHistoryItem[] = ((activitiesRes.data ?? []) as {
    id: string;
    kind: string;
    summary: string | null;
    body: string | null;
    occurred_at: string;
    user_id: string | null;
  }[]).map((a) => ({
    id: a.id,
    type: "activity" as const,
    occurredAt: a.occurred_at,
    author: a.user_id ? profileName(profileById.get(a.user_id)) : null,
    title: a.summary || "Activity",
    body: a.body,
  }));

  const historyItems: CrmHistoryItem[] = [
    ...historyFromNotes,
    ...historyFromCalls,
    ...historyFromActivities,
  ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  const stage = account.lifecycle_status as string;
  const website = account.website ? normalizeHref(account.website as string) : null;
  const phones = parsePhones(account.phones);
  const links = parseLinks(account.links);

  const editDefaults = {
    id: account.id as string,
    name: account.name as string,
    industry: account.industry as string | null,
    phones,
    links,
    address: account.address as string | null,
    city: account.city as string | null,
    state: account.state as string | null,
    zip: account.zip as string | null,
    company_size: account.company_size as string | null,
    commodities: account.commodities as string | null,
    annual_freight_spend: account.annual_freight_spend as number | null,
    revenue_potential: account.revenue_potential as number | null,
    source: account.source as string | null,
    lifecycle_status: stage,
    assigned_user_id: account.assigned_user_id as string | null,
  };

  return (
    <PageShell back={<BackButton fallbackHref="/crm/accounts" />}>
      {account.needs_finalize && <FinalizeBanner defaults={editDefaults} reps={reps} />}

      {/* Two columns: the permanent Company card (never moves when a tab
          changes — it lives here, outside ProfileTabs) and the tab area. */}
      <div className="grid gap-4 lg:grid-cols-[380px_1fr] lg:items-start">
        <CompanyCard
          accountId={account.id as string}
          orgId={user.orgId}
          name={account.name as string}
          stage={stage}
          assignedUserId={account.assigned_user_id as string | null}
          reps={reps}
          address={account.address as string | null}
          city={account.city as string | null}
          state={account.state as string | null}
          zip={account.zip as string | null}
          phones={phones}
          links={links}
          commodities={account.commodities as string | null}
          photos={commodityPhotos}
        />

        <div className="flex min-w-0 flex-col gap-4">
          {/* Top strip — identity + primary actions, above the tabs. */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line-strong bg-card px-4 py-3 shadow-e2">
            <div className="flex min-w-0 items-center gap-2.5">
              <h1 className="truncate text-[18px] font-bold tracking-tight text-fg">
                {account.name as string}
              </h1>
              <span
                className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${stageTone(stage)}`}
              >
                {stageLabel(stage)}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <LogCallButton
                accountId={account.id as string}
                contacts={contacts.map((c) => ({ id: c.id, name: c.name }))}
              />
              <ContactDialog
                accountId={account.id as string}
                mode="create"
                trigger={(open) => (
                  <button
                    type="button"
                    onClick={open}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${BTN_EDIT}`}
                  >
                    <IconPlus width={14} height={14} />
                    Add person
                  </button>
                )}
              />
            </div>
          </div>

          <ProfileTabs
            overview={
              <div className="flex flex-col gap-4">
                <TasksSection
                  accountId={account.id as string}
                  tasks={tasks}
                  reps={reps}
                  contacts={contacts.map((c) => ({ id: c.id, name: c.name }))}
                  canAssignOthers={isOwner}
                  currentUser={{ id: user.id, label: firstName(user.fullName, user.email) || "You" }}
                />
                <PeopleSection accountId={account.id as string} people={people} />
                <HistorySection accountId={account.id as string} items={historyItems} />
              </div>
            }
            contacts={
              <div className="flex flex-col gap-4">
                <StrayNumbersSection
                  accountId={account.id as string}
                  phones={phones}
                  contacts={contacts.map((c) => ({ id: c.id, name: c.name }))}
                />
                <ContactsSection
                  accountId={account.id as string}
                  contacts={contacts}
                  primaryContactId={account.primary_contact_id as string | null}
                  canDelete={isOwner}
                />
              </div>
            }
            contactsCount={contacts.length}
            details={
              <Card>
                <CardHead
                  title="Details"
                  right={<EditCompany defaults={editDefaults} reps={reps} canDelete={isOwner} />}
                />
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-5 md:grid-cols-3">
                  <Fact label="Industry" value={account.industry as string | null} />
                  <Fact
                    label="Website"
                    value={
                      website ? (
                        <a
                          href={website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:underline"
                        >
                          {account.website as string}
                        </a>
                      ) : null
                    }
                  />
                  <Fact label="Company size" value={account.company_size as string | null} />
                  <Fact
                    label="Annual freight spend"
                    value={formatMoney(account.annual_freight_spend as number | null)}
                    mono
                  />
                  <Fact
                    label="Revenue potential"
                    value={formatMoney(account.revenue_potential as number | null)}
                    mono
                  />
                  <Fact label="Source" value={account.source as string | null} />
                  <Fact label="Created" value={formatDate(account.created_at as string)} />
                </div>
              </Card>
            }
            bol={
              <BolSection
                accountId={account.id as string}
                orgId={user.orgId}
                documents={documents}
              />
            }
            bolCount={documents.length}
            aiResearch={<AiResearchSection notes={aiNotes} />}
            aiResearchCount={aiNotes.length}
          />
        </div>
      </div>
    </PageShell>
  );
}

function Fact({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  const empty = value === null || value === undefined || value === "—" || value === "";
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
        {label}
      </p>
      <p
        className={`mt-1 break-words text-[14px] ${empty ? "text-fg-subtle" : "text-fg"} ${mono && !empty ? "font-mono" : ""}`}
      >
        {empty ? "—" : value}
      </p>
    </div>
  );
}
