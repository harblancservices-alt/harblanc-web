import { notFound } from "next/navigation";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, CardHead } from "../../_shell/ui";
import { BackButton } from "../../_shell/BackButton";
import { formatDate, formatMoney, firstName } from "../../_shell/format";
import { parsePhones, parseLinks, normalizeHref } from "../../_shell/contactFields";
import { ProfileTabs } from "./ProfileTabs";
import { stageLabel, stageTone } from "../lifecycle";
import type { RepOption } from "../CompanyDialog";
import { EditCompany } from "./EditCompany";
import { FinalizeBanner } from "./FinalizeBanner";
import { CompanyInfoPanel } from "./CompanyInfoPanel";
import { ContactsSection, type CrmContact } from "./ContactsSection";
import { StrayNumbersSection } from "./StrayNumbersSection";
import { NotesSection, type CrmNote } from "./NotesSection";
import { AiResearchSection } from "./AiResearchSection";
import { CallsSection, type CrmCallLogItem } from "./CallsSection";
import { ActivityTimeline, type CrmActivity } from "./ActivityTimeline";
import { TasksSection } from "./TasksSection";
import { LogCallButton } from "./LogCallButton";
import { type CrmTaskItem } from "../../tasks/TaskRow";
import { BolSection, type CrmBolDocument } from "./BolSection";

export const dynamic = "force-dynamic";

type ProfileRow = { id: string; full_name: string | null; email: string | null; is_active: boolean };

function profileName(p: ProfileRow | undefined): string | null {
  if (!p) return null;
  return firstName(p.full_name, p.email) || null;
}

/**
 * Company profile — the premium, full-record view of a single crm_account.
 * Everything is RLS-scoped to the caller's org: the account, its contacts,
 * notes, activity feed, and the org's rep roster are all read through the
 * authenticated CRM session. All writes route through the shared server
 * actions, which stamp org_id/user_id from the session.
 *
 * The default landing tab ("Overview") is an operational two-column layout:
 * the company (stage, rep, address, phones, links, commodities) on the
 * left, and the work (contacts, tasks, notes, calls, activity) on the
 * right. The exhaustive field set lives in a secondary "Details" tab.
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
  ] = await Promise.all([
    supabase.from("crm_profiles").select("id, full_name, email, is_active"),
    supabase
      .from("crm_contacts")
      .select(
        "id, name, title, email, phones, links, best_time_to_call, is_decision_maker, notes, next_followup_at",
      )
      .eq("account_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("crm_notes")
      .select("id, body, is_pinned, is_ai, created_at, user_id")
      .eq("account_id", id)
      .is("deleted_at", null)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("crm_calls")
      .select(
        "id, contact_id, outcome, duration_seconds, summary, notes, followup_required, reminder_at, occurred_at, user_id",
      )
      .eq("account_id", id)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(200),
    supabase
      .from("crm_activities")
      .select("id, kind, summary, body, occurred_at, user_id")
      .eq("account_id", id)
      .order("occurred_at", { ascending: false })
      .limit(100),
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
  ]);

  const profiles = (profilesRes.data ?? []) as ProfileRow[];
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const reps: RepOption[] = profiles
    .filter((p) => p.is_active)
    .map((p) => ({ id: p.id, label: profileName(p) ?? "Unnamed rep" }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const contacts: CrmContact[] = ((contactsRes.data ?? []) as {
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
  }[]).map((c) => ({
    ...c,
    phones: parsePhones(c.phones),
    links: parseLinks(c.links),
  }));
  const contactNameById = new Map(contacts.map((c) => [c.id, c.name]));
  const contactPhoneById = new Map(contacts.map((c) => [c.id, c.phones[0]?.number || null]));
  const contactEmailById = new Map(contacts.map((c) => [c.id, c.email]));
  const companyPhone = parsePhones(account.phones)[0]?.number || (account.phone as string | null) || null;

  const notes: CrmNote[] = ((notesRes.data ?? []) as {
    id: string;
    body: string;
    is_pinned: boolean;
    is_ai: boolean | null;
    created_at: string;
    user_id: string | null;
  }[]).map((n) => ({
    id: n.id,
    body: n.body,
    is_pinned: n.is_pinned,
    is_ai: n.is_ai ?? false,
    created_at: n.created_at,
    author: n.user_id ? profileName(profileById.get(n.user_id)) : null,
  }));
  const teamNotes = notes.filter((n) => !n.is_ai);
  const aiNotes = notes.filter((n) => n.is_ai);

  const activities: CrmActivity[] = ((activitiesRes.data ?? []) as {
    id: string;
    kind: string;
    summary: string | null;
    body: string | null;
    occurred_at: string;
    user_id: string | null;
  }[]).map((a) => ({
    id: a.id,
    kind: a.kind,
    summary: a.summary,
    body: a.body,
    occurred_at: a.occurred_at,
    author: a.user_id ? profileName(profileById.get(a.user_id)) : null,
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

  const calls: CrmCallLogItem[] = ((callsRes.data ?? []) as {
    id: string;
    contact_id: string | null;
    outcome: string | null;
    duration_seconds: number | null;
    summary: string | null;
    notes: string | null;
    followup_required: boolean;
    reminder_at: string | null;
    occurred_at: string;
    user_id: string | null;
  }[]).map((c) => ({
    id: c.id,
    outcome: c.outcome,
    contactName: c.contact_id ? contactNameById.get(c.contact_id) ?? null : null,
    durationSeconds: c.duration_seconds,
    summary: c.summary,
    notes: c.notes,
    followupRequired: c.followup_required,
    reminderAt: c.reminder_at,
    occurredAt: c.occurred_at,
    author: c.user_id ? profileName(profileById.get(c.user_id)) : null,
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

  const stage = account.lifecycle_status as string;
  const location = [account.city, account.state].filter(Boolean).join(", ");
  const repName = account.assigned_user_id
    ? profileName(profileById.get(account.assigned_user_id as string))
    : null;
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
    <PageShell
      back={<BackButton fallbackHref="/crm/accounts" />}
      actions={
        <>
          <LogCallButton
            accountId={account.id as string}
            contacts={contacts.map((c) => ({ id: c.id, name: c.name }))}
          />
          <EditCompany defaults={editDefaults} reps={reps} canDelete={isOwner} />
        </>
      }
    >
      {account.needs_finalize && <FinalizeBanner defaults={editDefaults} reps={reps} />}

      {/* Which company this is — kept as plain page content (not a masthead)
          since it's the record's identity, not a redundant page-name label. */}
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-fg">
            {account.name as string}
          </h1>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${stageTone(stage)}`}
          >
            {stageLabel(stage)}
          </span>
        </div>
        <p className="mt-1 text-[13px] text-fg-muted">
          {[account.industry, location].filter(Boolean).join(" · ") ||
            "No industry or location set"}
        </p>
        <p className="mt-1 text-[12px] text-fg-subtle">
          Rep: <span className="text-fg-muted">{repName || "Unassigned"}</span>
        </p>
      </div>

      <ProfileTabs
        overview={
          <div className="grid gap-4 lg:grid-cols-[380px_1fr] lg:items-start">
            <div className="flex flex-col gap-4">
              <CompanyInfoPanel
                accountId={account.id as string}
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
              />
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              <TasksSection
                accountId={account.id as string}
                tasks={tasks}
                reps={reps}
                contacts={contacts.map((c) => ({ id: c.id, name: c.name }))}
                canAssignOthers={isOwner}
                currentUser={{ id: user.id, label: firstName(user.fullName, user.email) || "You" }}
              />
              <NotesSection accountId={account.id as string} notes={teamNotes} />
              <CallsSection accountId={account.id as string} calls={calls} />
              <ActivityTimeline activities={activities} />
            </div>
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
            <CardHead title="Details" />
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
