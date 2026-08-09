import { notFound } from "next/navigation";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { CRM_ACTIVITY } from "@/lib/crm/activity";
import { PageShell } from "../../_shell/ui";
import { firstName, titleCaseWords, upperCaseState } from "../../_shell/format";
import { parsePhones, parseLinks, normalizeHref } from "../../_shell/contactFields";
import { formatPhone } from "@/lib/domain/phone";
import { ProfileTabs } from "./ProfileTabs";
import type { RepOption } from "../CompanyDialog";
import { FinalizeBanner } from "./FinalizeBanner";
import { CompanyCard } from "./CompanyCard";
import { ContactsSection, type CrmContact } from "./ContactsSection";
import { StrayNumbersSection } from "./StrayNumbersSection";
import { AddPersonButton } from "./AddPersonButton";
import { AiResearchSection, type CrmNote } from "./AiResearchSection";
import { PeopleSection } from "./PeopleSection";
import type { CrmActivityItem } from "./ActivitySection";
import { StageTracker } from "./StageTracker";
import { RepControl } from "./RepControl";
import { DetailsSection, type CrmDetailsTag } from "./DetailsSection";
import { type CrmCommodityPhoto } from "./CommodityPhotoTiles";
import { TasksSection } from "./TasksSection";
import { LogCallButton } from "./LogCallButton";
import { callOutcomeLabel } from "../../calls/outcomes";
import { type CrmTaskItem } from "../../tasks/TaskRow";
import type { TaskContactOption } from "../../tasks/TaskDialog";
import { BolSection, type CrmBolDocument } from "./BolSection";
import { AiSuggestionsPanel } from "./AiSuggestionsPanel";
import { CompanyProfileSection } from "./CompanyProfileSection";
import { FreightProfileSection } from "./FreightProfileSection";
import { LocationsSection } from "./LocationsSection";
import { CommercialSection } from "./CommercialSection";
import { ContextNotesSection } from "./ContextNotesSection";

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
 * "Company" card (tabbed Company/Activity — address/phones/links/commodities
 * plus the relocated activity feed; see CompanyCard.tsx) that stays mounted
 * across every tab, and a RIGHT column that's the only thing ProfileTabs
 * switches — a name + assigned-rep strip, then the full-width chevron stage
 * tracker (StageTracker.tsx — Option A, Brent's approved mock), above a
 * segmented tab bar. The Overview tab stacks Tasks (whose header doubles as
 * the Log call / Add person / Add task button bar) and People.
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

  // Title-cased/uppercased once here so every consumer below (the
  // permanent Company card's view AND edit-mode defaults, the top strip's
  // heading, the Details tab's edit dialog, the task "company" line) reads
  // the same normalized value — including pre-existing not-quite-
  // capitalized data (new writes are already clean via accounts/actions.ts).
  const accountName = titleCaseWords(account.name as string);
  const accountAddress = titleCaseWords(account.address as string | null) || null;
  const accountCity = titleCaseWords(account.city as string | null) || null;
  const accountState = upperCaseState(account.state as string | null) || null;

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
    accountTagsRes,
    addedByRes,
    lastResearchRequestRes,
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
    supabase.from("crm_account_tags").select("tag_id").eq("account_id", id),
    // "Added by" — the account's own first activity row rather than a new
    // created_by column: accountCreated is already logged on every create
    // path, so this needs no schema.
    supabase
      .from("crm_activities")
      .select("user_id")
      .eq("account_id", id)
      .eq("kind", CRM_ACTIVITY.accountCreated)
      .order("occurred_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    // Drives the AI Research tab's "Last requested" label — see
    // ai-research-actions.ts::requestAiResearch.
    supabase
      .from("crm_activities")
      .select("occurred_at")
      .eq("account_id", id)
      .eq("kind", CRM_ACTIVITY.aiResearchRequested)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const profiles = (profilesRes.data ?? []) as ProfileRow[];
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const reps: RepOption[] = profiles
    .filter((p) => p.is_active)
    .map((p) => ({ id: p.id, label: profileName(p) ?? "Unnamed rep" }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Names are title-cased here, once, right at the read boundary — every
  // downstream consumer (contacts/people arrays, the name lookup maps,
  // task/history "who" lines) reads from this array, so nothing displays a
  // contact's name without going through this normalization, including
  // pre-existing not-quite-capitalized data (new writes are already clean
  // via accounts/actions.ts, but this covers what's already stored).
  const contactRows = ((contactsRes.data ?? []) as {
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
  }[]).map((c) => ({ ...c, name: titleCaseWords(c.name) }));
  const contacts: CrmContact[] = contactRows.map((c) => ({
    ...c,
    phones: parsePhones(c.phones),
    links: parseLinks(c.links),
  }));
  const contactNameById = new Map(contacts.map((c) => [c.id, c.name]));
  const contactPhoneById = new Map(contacts.map((c) => [c.id, c.phones[0]?.number || null]));
  const contactEmailById = new Map(contacts.map((c) => [c.id, c.email]));
  const companyPhone = parsePhones(account.phones)[0]?.number || (account.phone as string | null) || null;
  // Shared {id, name} roster fed to every "attach a contact to this
  // action" control on the profile — Log call, Add task (from the Tasks bar
  // and each person row's one-tap + Task), the Tasks section's own dialog.
  const contactOptions: TaskContactOption[] = contacts.map((c) => ({ id: c.id, name: c.name }));

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
    companyName: accountName,
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

  // Details tab's Tags fact — two-step, same reason as the signed URLs
  // above (the tag ids aren't known until crm_account_tags resolves).
  const accountTagIds = ((accountTagsRes.data ?? []) as { tag_id: string }[]).map((t) => t.tag_id);
  let detailsTags: CrmDetailsTag[] = [];
  if (accountTagIds.length) {
    const { data: tagRows } = await supabase
      .from("crm_tags")
      .select("id, label, color")
      .in("id", accountTagIds);
    detailsTags = (tagRows ?? []) as CrmDetailsTag[];
  }

  const addedByUserId = (addedByRes.data as { user_id: string | null } | null)?.user_id ?? null;
  const addedByName = addedByUserId ? profileName(profileById.get(addedByUserId)) : null;
  const lastResearchRequestedAt =
    (lastResearchRequestRes.data as { occurred_at: string } | null)?.occurred_at ?? null;

  // ── Activity — calls + the remaining (non-call, non-note) activity rows,
  // merged into one newest-first feed for the left card's Activity tab.
  // Notes are deliberately excluded (still loggable per-person via the Note
  // action, just not surfaced here) — see ActivitySection.tsx. ──
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
  const activityFromCalls: CrmActivityItem[] = callRows.map((c) => {
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

  const activityFromEvents: CrmActivityItem[] = ((activitiesRes.data ?? []) as {
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

  const activityItems: CrmActivityItem[] = [...activityFromCalls, ...activityFromEvents].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );

  const stage = account.lifecycle_status as string;
  const website = account.website as string | null;
  const websiteHref = website ? normalizeHref(website) : null;
  const phones = parsePhones(account.phones);
  const links = parseLinks(account.links);
  const fullAddress =
    [accountAddress, [accountCity, accountState].filter(Boolean).join(", "), account.zip]
      .filter(Boolean)
      .join(", ") || null;
  const companyPhoneFormatted = companyPhone ? formatPhone(companyPhone) : null;

  const editDefaults = {
    id: account.id as string,
    name: accountName,
    industry: account.industry as string | null,
    phones,
    links,
    address: accountAddress,
    city: accountCity,
    state: accountState,
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
    <PageShell>
      {account.needs_finalize && <FinalizeBanner defaults={editDefaults} reps={reps} />}

      {/* Two columns: the permanent Company card (never moves when a tab
          changes — it lives here, outside ProfileTabs) and the tab area. */}
      <div className="grid gap-4 lg:grid-cols-[380px_1fr] lg:items-start">
        <CompanyCard
          accountId={account.id as string}
          fallbackHref="/crm/accounts"
          name={accountName}
          address={accountAddress}
          city={accountCity}
          state={accountState}
          zip={account.zip as string | null}
          phones={phones}
          links={links}
          commodities={account.commodities as string | null}
          activityItems={activityItems}
        />

        <div className="flex min-w-0 flex-col gap-4">
          {/* Top strip — identity + assigned rep only now; the lifecycle
              stage moved into its own full-width chevron tracker below (see
              StageTracker.tsx). Log call/Add person live in the Tasks
              section's button bar further down. */}
          <div className="flex flex-wrap items-center justify-between gap-3 border border-line-strong bg-card px-4 py-3 shadow-e2">
            <h1 className="truncate text-[18px] font-bold tracking-tight text-fg">
              {accountName}
            </h1>
            <div className="shrink-0">
              <RepControl
                accountId={account.id as string}
                current={account.assigned_user_id as string | null}
                reps={reps}
              />
            </div>
          </div>

          {/* Stage tracker — full width, prominent, at the top of the
              profile's main area (right above the tabs). */}
          <div className="w-full border border-line-strong bg-card p-4 shadow-e2">
            <StageTracker accountId={account.id as string} current={stage} />
          </div>

          <ProfileTabs
            overview={
              <div className="flex flex-col gap-4">
                <TasksSection
                  accountId={account.id as string}
                  tasks={tasks}
                  reps={reps}
                  contacts={contactOptions}
                  canAssignOthers={isOwner}
                  currentUser={{ id: user.id, label: firstName(user.fullName, user.email) || "You" }}
                  logCall={
                    <LogCallButton accountId={account.id as string} contacts={contactOptions} />
                  }
                  addPerson={<AddPersonButton accountId={account.id as string} />}
                />
                <PeopleSection
                  accountId={account.id as string}
                  people={contacts}
                  reps={reps}
                  contactOptions={contactOptions}
                  canAssignOthers={isOwner}
                  currentUser={{ id: user.id, label: firstName(user.fullName, user.email) || "You" }}
                />
              </div>
            }
            contacts={
              <div className="flex flex-col gap-4">
                <StrayNumbersSection
                  accountId={account.id as string}
                  phones={phones}
                  contacts={contactOptions}
                />
                <ContactsSection
                  accountId={account.id as string}
                  contacts={contacts}
                  primaryContactId={account.primary_contact_id as string | null}
                  canDelete={isOwner}
                  reps={reps}
                  contactOptions={contactOptions}
                  canAssignOthers={isOwner}
                  currentUser={{ id: user.id, label: firstName(user.fullName, user.email) || "You" }}
                />
              </div>
            }
            contactsCount={contacts.length}
            details={
              <div className="flex flex-col gap-4">
                <DetailsSection
                  legalName={accountName}
                  industry={account.industry as string | null}
                  companySize={account.company_size as string | null}
                  annualFreightSpend={account.annual_freight_spend as number | null}
                  source={account.source as string | null}
                  stage={stage}
                  website={website}
                  websiteHref={websiteHref}
                  tags={detailsTags}
                  fullAddress={fullAddress}
                  addedByName={addedByName}
                  addedAt={account.created_at as string}
                  editDefaults={editDefaults}
                  reps={reps}
                  canDelete={isOwner}
                  accountId={account.id as string}
                  orgId={user.orgId}
                  photos={commodityPhotos}
                />
                <AiSuggestionsPanel accountId={account.id as string} />
                <CompanyProfileSection accountId={account.id as string} />
                <FreightProfileSection accountId={account.id as string} />
                <LocationsSection accountId={account.id as string} />
                <CommercialSection accountId={account.id as string} />
                <ContextNotesSection accountId={account.id as string} />
              </div>
            }
            bol={
              <BolSection
                accountId={account.id as string}
                orgId={user.orgId}
                documents={documents}
                shipperName={accountName}
                shipperAddress={fullAddress}
                shipperPhone={companyPhoneFormatted}
              />
            }
            bolCount={documents.length}
            aiResearch={
              <AiResearchSection
                accountId={account.id as string}
                notes={aiNotes}
                lastRequestedAt={lastResearchRequestedAt}
              />
            }
            aiResearchCount={aiNotes.length}
          />
        </div>
      </div>
    </PageShell>
  );
}
