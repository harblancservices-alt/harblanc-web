import { notFound } from "next/navigation";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { CRM_ACTIVITY } from "@/lib/crm/activity";
import { PageShell, Card, CardHead } from "../../_shell/ui";
import { firstName, titleCaseWords, upperCaseState } from "../../_shell/format";
import { parsePhones, parseLinks, normalizeHref } from "../../_shell/contactFields";
import type { LaneEntry } from "../../_shell/LanesEditor";
import type { RepOption } from "../CompanyDialog";
import { normalizeStage } from "../lifecycle";
import { FinalizeBanner } from "./FinalizeBanner";
import { CompanyHeader } from "./CompanyHeader";
import { StageTrackerSection } from "./StageTrackerSection";
import type { CrmTagOption } from "./TagsCard";
import { ProfileCenterTabs } from "./ProfileCenterTabs";
import { ActivityLogSection, type CrmActivityLogItem } from "./ActivityLogSection";
import { ContactsMasterDetail, type CrmContact } from "./ContactsMasterDetail";
import { TasksTab } from "./TasksTab";
import { NotesTab, type CrmNoteItem } from "./NotesTab";
import { FilesTab } from "./FilesTab";
import { CompanyDetailsCard, type CompanyFreightData } from "./CompanyDetailsCard";
import { CustomFieldsCard } from "./CustomFieldsCard";
import { type CrmCommodityPhoto } from "./CommodityPhotoTiles";
import { callOutcomeLabel, callOutcomeTone } from "../../calls/outcomes";
import type { TaskContactOption } from "../../tasks/TaskDialog";
import { type CrmBolDocument } from "./BolSection";
import { CompanyProfileSection } from "./CompanyProfileSection";
import { StrayNumbersSection } from "./StrayNumbersSection";
import { LocationsSection } from "./LocationsSection";
import { ShipmentsTab } from "./ShipmentsTab";
import type { CrmTaskItem } from "../../tasks/TaskRow";
import { fetchAccountLocations } from "./locations-data";
import { DesktopProfile } from "./desktop/DesktopProfile";
import type { IdentityLink } from "./desktop/IdentityCard";
import type { WheelContact } from "./desktop/ContactsWheel";
import { timestampMs } from "../../_shell/format";

export const dynamic = "force-dynamic";

const STORAGE_BUCKET = "crm-documents";
const SIGNED_URL_TTL_SECONDS = 300;

type ProfileRow = { id: string; full_name: string | null; email: string | null; is_active: boolean; role: string };

function profileName(p: ProfileRow | undefined): string | null {
  if (!p) return null;
  return firstName(p.full_name, p.email) || null;
}

/**
 * Company profile — rebuilt to Brent's reference layout (2026-08-08), then
 * relaid out again (2026-08-09) into two columns: top bar (breadcrumb + name
 * + More/Edit) → StageTracker (now a 7-stage funnel; the one control that
 * actually moves the stage) → CompanyDetailsCard (left, fixed width — a
 * single merged card absorbing what used to be four separate cards: About,
 * Tags, Company owner/Sales rep, and the old right-column Company details +
 * Freight profile) | a widened tabbed Timeline/Contacts/Tasks/Files panel
 * (default Contacts) with its own standalone Notes card underneath (Notes
 * used to be a tab in that same panel). No Deals tab — crm_deals has no real
 * usage anywhere in this codebase. Company profile/Commercial/Locations/
 * Stray numbers/Custom fields ride below the two columns as isolated cards —
 * real data/functionality the reference design doesn't name but that must
 * still display somewhere. The AI Suggestions/AI Research components (and
 * their underlying crm_ai_suggestions data / ai_status columns) still exist
 * on disk — see AiSuggestionsPanel.tsx/AiResearchSection.tsx — just not
 * rendered here anymore.
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
      "id, name, industry, website, phone, phones, links, address, city, state, zip, company_size, commodities, annual_freight_spend, revenue_potential, source, lifecycle_status, assigned_user_id, primary_contact_id, needs_finalize, created_at, updated_at, dot_number, mc_number, company_type, email, context_notes, custom, equipment_needed, lanes, volume_frequency, weight_range, special_requirements, ai_confirmed_fields, linkedin_url, dba, year_founded, ownership_type",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!account) notFound();

  const accountName = titleCaseWords(account.name as string);
  const accountAddress = titleCaseWords(account.address as string | null) || null;
  const accountCity = titleCaseWords(account.city as string | null) || null;
  const accountState = upperCaseState(account.state as string | null) || null;

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
    orgTagsRes,
    locations,
  ] = await Promise.all([
    supabase.from("crm_profiles").select("id, full_name, email, is_active, role"),
    supabase
      .from("crm_contacts")
      .select(
        "id, name, title, email, phones, links, best_time_to_call, is_decision_maker, notes, next_followup_at, last_contacted_at, role_category, current_mood",
      )
      .eq("account_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("crm_notes")
      .select("id, body, is_ai, is_pinned, created_at, user_id, contact_id")
      .eq("account_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("crm_calls")
      .select(
        "id, contact_id, outcome, duration_seconds, summary, notes, occurred_at, user_id, followup_required, reminder_at",
      )
      .eq("account_id", id)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(200),
    supabase
      .from("crm_activities")
      .select("id, kind, summary, body, occurred_at, user_id, contact_id")
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
    supabase.from("crm_tags").select("id, label, color").order("label", { ascending: true }),
    // Desktop layout only — the mobile tree still renders the self-fetching
    // LocationsSection. Folded into this Promise.all so it costs no extra
    // round-trip latency, and shares the SAME helper LocationsSection uses.
    fetchAccountLocations(supabase, id),
  ]);

  const profiles = (profilesRes.data ?? []) as ProfileRow[];
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const reps: RepOption[] = profiles
    .filter((p) => p.is_active)
    .map((p) => ({ id: p.id, label: profileName(p) ?? "Unnamed rep" }))
    .sort((a, b) => a.label.localeCompare(b.label));

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
    current_mood: string | null;
  }[]).map((c) => ({ ...c, name: titleCaseWords(c.name) }));
  const contacts: CrmContact[] = contactRows.map((c) => ({
    ...c,
    phones: parsePhones(c.phones),
    links: parseLinks(c.links),
  }));
  const contactNameById = new Map(contacts.map((c) => [c.id, c.name]));
  const contactPhoneById = new Map(contacts.map((c) => [c.id, c.phones[0]?.number || null]));
  const contactEmailById = new Map(contacts.map((c) => [c.id, c.email]));
  const contactTitleById = new Map(contacts.map((c) => [c.id, c.title]));
  const contactOptions: TaskContactOption[] = contacts.map((c) => ({ id: c.id, name: c.name }));

  const primaryContactEmail = account.primary_contact_id
    ? contacts.find((c) => c.id === account.primary_contact_id)?.email ?? null
    : null;
  const companyPhone = parsePhones(account.phones)[0]?.number || (account.phone as string | null) || null;

  const notesRows = (notesRes.data ?? []) as {
    id: string;
    body: string;
    is_ai: boolean | null;
    is_pinned: boolean | null;
    created_at: string;
    user_id: string | null;
    contact_id: string | null;
  }[];
  const humanNotes: CrmNoteItem[] = notesRows
    .filter((n) => !n.is_ai)
    .map((n) => ({
      id: n.id,
      body: n.body,
      createdAt: n.created_at,
      author: n.user_id ? profileName(profileById.get(n.user_id)) : null,
      contactId: n.contact_id,
      contactName: n.contact_id ? contactNameById.get(n.contact_id) ?? null : null,
      isPinned: n.is_pinned ?? false,
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
    contactTitle: t.contact_id ? contactTitleById.get(t.contact_id) ?? null : null,
    assigneeName: t.assigned_user_id ? profileName(profileById.get(t.assigned_user_id)) : null,
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

  const commodityPhotoRows = (commodityPhotosRes.data ?? []) as {
    id: string;
    file_name: string;
    storage_path: string;
    created_at: string;
  }[];
  const photoPaths = commodityPhotoRows.map((p) => p.storage_path);
  const signedUrlByPath = new Map<string, string>();
  if (photoPaths.length) {
    const { data: signedRows } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrls(photoPaths, SIGNED_URL_TTL_SECONDS);
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

  const accountTagIds = new Set(((accountTagsRes.data ?? []) as { tag_id: string }[]).map((t) => t.tag_id));
  const orgTags = ((orgTagsRes.data ?? []) as CrmTagOption[]);
  const attachedTags = orgTags.filter((t) => accountTagIds.has(t.id));

  // ── Activity log — calls + human notes + the remaining activity events,
  // merged newest-first (drives both the Timeline tab and each contact's
  // filtered Activity sub-tab in ContactsMasterDetail). ──
  const callRows = (callsRes.data ?? []) as {
    id: string;
    contact_id: string | null;
    outcome: string | null;
    duration_seconds: number | null;
    summary: string | null;
    notes: string | null;
    occurred_at: string;
    user_id: string | null;
    followup_required: boolean | null;
    reminder_at: string | null;
  }[];
  const activityFromCalls: CrmActivityLogItem[] = callRows.map((c) => {
    const durLabel = c.duration_seconds ? ` · ${Math.round(c.duration_seconds / 60)}m` : "";
    return {
      id: c.id,
      type: "call" as const,
      occurredAt: c.occurred_at,
      author: c.user_id ? profileName(profileById.get(c.user_id)) : null,
      contactId: c.contact_id,
      contactName: c.contact_id ? contactNameById.get(c.contact_id) ?? null : null,
      title: `Call · ${callOutcomeLabel(c.outcome)}${durLabel}`,
      // Desktop timeline splits the same string into an event name + a
      // status pill (see desktop/ActivityFeed.tsx). Mobile still reads
      // `title` and is unaffected.
      kind: `Call${durLabel}`,
      tag: callOutcomeLabel(c.outcome),
      tagTone: callOutcomeTone(c.outcome),
      body: [c.summary, c.notes].filter(Boolean).join("\n") || null,
      followupAt: c.followup_required ? c.reminder_at : null,
    };
  });

  const activityFromNotes: CrmActivityLogItem[] = notesRows
    .filter((n) => !n.is_ai)
    .map((n) => ({
      id: n.id,
      type: "note" as const,
      occurredAt: n.created_at,
      author: n.user_id ? profileName(profileById.get(n.user_id)) : null,
      contactId: n.contact_id,
      contactName: n.contact_id ? contactNameById.get(n.contact_id) ?? null : null,
      title: "Note",
      body: n.body,
      followupAt: null,
    }));

  const activityFromEvents: CrmActivityLogItem[] = ((activitiesRes.data ?? []) as {
    id: string;
    kind: string;
    summary: string | null;
    body: string | null;
    occurred_at: string;
    user_id: string | null;
    contact_id: string | null;
  }[]).map((a) => ({
    id: a.id,
    type: "activity" as const,
    occurredAt: a.occurred_at,
    author: a.user_id ? profileName(profileById.get(a.user_id)) : null,
    contactId: a.contact_id,
    contactName: a.contact_id ? contactNameById.get(a.contact_id) ?? null : null,
    title: a.summary || "Activity",
    body: a.body,
    followupAt: null,
  }));

  const activityItems: CrmActivityLogItem[] = [...activityFromCalls, ...activityFromNotes, ...activityFromEvents].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );

  const stage = account.lifecycle_status as string;
  const website = account.website as string | null;
  const websiteHref = website ? normalizeHref(website) : null;
  const phones = parsePhones(account.phones);
  const links = parseLinks(account.links);
  const fullAddress =
    [accountAddress, [accountCity, accountState].filter(Boolean).join(", "), account.zip].filter(Boolean).join(", ") || null;
  const companyEmail = (account.email as string | null) || primaryContactEmail;

  const aiConfirmedFields = (account.ai_confirmed_fields as Record<string, unknown> | null) ?? {};
  const freight: CompanyFreightData = {
    commodities: (account.commodities as string | null) ?? null,
    equipmentNeeded: ((account.equipment_needed as string[] | null) ?? []).filter(Boolean),
    lanes: ((account.lanes as LaneEntry[] | null) ?? []).filter((l) => l.origin || l.destination),
    volumeFrequency: (account.volume_frequency as string | null) ?? null,
    weightRange: (account.weight_range as string | null) ?? null,
    specialRequirements: ((account.special_requirements as string[] | null) ?? []).filter(Boolean),
    confirmed: aiConfirmedFields,
  };

  const editDefaults = {
    id: account.id as string,
    name: accountName,
    industry: account.industry as string | null,
    company_type: account.company_type as string | null,
    email: account.email as string | null,
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

  const openTasks = tasks.filter((t) => t.status !== "completed");

  const currentUser = { id: user.id, label: firstName(user.fullName, user.email) || "You" };
  const currentRepId = account.assigned_user_id as string | null;
  const currentRepLabel = reps.find((r) => r.id === currentRepId)?.label ?? null;

  // ── Desktop-only derivations (2026-08-22 design-handoff rebuild) ───────
  // Every value below is shaped from data this page ALREADY loads — nothing
  // new is queried and nothing is written differently. The mobile tree below
  // ignores all of it.
  const desktopLinks: IdentityLink[] = [
    ...(websiteHref ? [{ label: "Website", href: websiteHref }] : []),
    ...(account.linkedin_url ? [{ label: "LinkedIn", href: normalizeHref(account.linkedin_url as string) }] : []),
    ...links
      .filter((l) => l.url && l.label?.toLowerCase() !== "website")
      .map((l) => ({ label: l.label || "Link", href: normalizeHref(l.url) })),
  ];

  // The rail's contact wheel: primary contact first (tinted + PRIMARY pill),
  // everyone else in their existing created_at order.
  const wheelContacts: WheelContact[] = contacts
    .map((c) => ({
      id: c.id,
      name: c.name,
      title: c.title ?? null,
      email: c.email ?? null,
      phone: c.phones[0]?.number ?? null,
      isPrimary: c.id === (account.primary_contact_id as string | null),
    }))
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));

  // The next-follow-up banner is the soonest OPEN, DATED task on this
  // company — the same crm_tasks rows the Tasks tab lists, so "Mark done"
  // there and Done on the task card are the same completeTask write.
  const nextFollowUpTask =
    openTasks
      .filter((t) => t.due_at)
      .sort((a, b) => (timestampMs(a.due_at) ?? 0) - (timestampMs(b.due_at) ?? 0))[0] ?? null;

  const commodityChips = ((account.commodities as string | null) ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  const mobileTree = (
    <PageShell>
      {account.needs_finalize && <FinalizeBanner defaults={editDefaults} reps={reps} />}

      <div className="flex flex-col gap-4">
        <CompanyHeader
          name={accountName}
          accountId={account.id as string}
          contacts={contactOptions}
          editDefaults={editDefaults}
          reps={reps}
          repLabel={currentRepLabel}
          isActiveCustomer={normalizeStage(stage) === "active_customer"}
          canDelete={isOwner}
        />

        {/* Active Customer is the funnel's final stage — the company is
            through it, so the process tracker has nothing left to track.
            The indicator for that lives inline in CompanyHeader's title row
            (a solid green pill next to the name) instead of a standalone
            box here — Brent's 2026-08-10 call, replacing an earlier version
            that put it in its own outlined bar. Every other stage still
            gets the full tracker. Existing "customer" rows normalize to
            "active_customer" (see lifecycle.ts), so this covers them too. */}
        <StageTrackerSection
          accountId={account.id as string}
          accountName={accountName}
          stage={stage}
        />

        {/* 2026-08-09 relayout: Company Details (left, unchanged width) absorbs
            what used to be four separate cards (About/Tags/Company owner/the
            old right-column Company Details+Freight profile); the freed-up
            right column's space goes to widening the Contacts/Timeline/Tasks
            card, with Notes now its own card underneath. On mobile this grid
            collapses to one column and already stacks in the right order —
            Company Details, then Contacts, then Notes. */}
        <div className="grid gap-4 lg:grid-cols-[300px_1fr] lg:items-start">
          <CompanyDetailsCard
            accountId={account.id as string}
            name={accountName}
            industry={account.industry as string | null}
            email={companyEmail}
            website={website}
            websiteHref={websiteHref}
            fullAddress={fullAddress}
            phones={phones}
            legacyPhone={companyPhone}
            linkedinUrl={account.linkedin_url as string | null}
            links={links}
            freight={freight}
            attachedTags={attachedTags}
            orgTags={orgTags}
            editDefaults={editDefaults}
            reps={reps}
            isActiveCustomer={normalizeStage(stage) === "active_customer"}
          />

          <div className="flex flex-col gap-4">
            <ProfileCenterTabs
              timeline={<ActivityLogSection accountId={account.id as string} items={activityItems} />}
              timelineCount={activityItems.length}
              contacts={
                <ContactsMasterDetail
                  accountId={account.id as string}
                  contacts={contacts}
                  contactOptions={contactOptions}
                  activityItems={activityItems}
                  tasks={tasks}
                  notes={humanNotes}
                  reps={reps}
                  canAssignOthers={isOwner}
                  canDelete={isOwner}
                  currentUser={currentUser}
                />
              }
              contactsCount={contacts.length}
              shipments={<ShipmentsTab accountId={account.id as string} accountName={accountName} />}
              tasks={
                <TasksTab
                  accountId={account.id as string}
                  tasks={tasks}
                  reps={reps}
                  contacts={contactOptions}
                  canAssignOthers={isOwner}
                  currentUser={currentUser}
                />
              }
              tasksCount={openTasks.length}
              files={
                <FilesTab
                  accountId={account.id as string}
                  orgId={user.orgId}
                  documents={documents}
                  photos={commodityPhotos}
                />
              }
            />

            <Card id="notes">
              <CardHead title="Notes" hint={humanNotes.length ? `${humanNotes.length} on file` : undefined} />
              <NotesTab
                accountId={account.id as string}
                accountName={accountName}
                notes={humanNotes}
                contactOptions={contactOptions}
                currentUser={currentUser}
              />
            </Card>
          </div>
        </div>

        {phones.length > 0 && <StrayNumbersSection accountId={account.id as string} phones={phones} contacts={contactOptions} />}
        <LocationsSection accountId={account.id as string} />
        <CompanyProfileSection accountId={account.id as string} />
        <CustomFieldsCard custom={account.custom as Record<string, unknown> | null} />
      </div>
    </PageShell>
  );

  return (
    <>
      {/* MOBILE / TABLET — the pre-existing profile, byte-for-byte. Brent's
          mobile design system is locked; the redesign below is desktop-only,
          so the two trees are gated against each other at `lg` rather than
          one layout trying to be both. */}
      <div className="lg:hidden">{mobileTree}</div>

      {/* DESKTOP — the 2026-08-22 design-handoff rebuild, hybrid skin
          (handoff layout + structure, CRM `.crm-light` tokens). */}
      <div className="hidden lg:block">
        {account.needs_finalize && (
          <div className="px-6 pt-4">
            <FinalizeBanner defaults={editDefaults} reps={reps} />
          </div>
        )}

        <DesktopProfile
          accountId={account.id as string}
          accountName={accountName}
          industry={account.industry as string | null}
          city={accountCity}
          stage={stage}
          ownerLabel={currentRepLabel}
          editDefaults={editDefaults}
          reps={reps}
          canDelete={isOwner}
          email={companyEmail}
          phones={phones}
          fullAddress={fullAddress}
          links={desktopLinks}
          contacts={wheelContacts}
          glance={{
            annualFreightSpend: account.annual_freight_spend as number | null,
            companySize: account.company_size as string | null,
            yearFounded: account.year_founded as number | null,
            companyType: account.company_type as string | null,
            ownershipType: account.ownership_type as string | null,
            source: account.source as string | null,
          }}
          commodities={commodityChips}
          commoditiesFromAi={!!aiConfirmedFields.commodities}
          attachedTags={attachedTags}
          orgTags={orgTags}
          followUp={
            nextFollowUpTask
              ? {
                  taskId: nextFollowUpTask.id,
                  title: nextFollowUpTask.title,
                  notes: nextFollowUpTask.notes,
                  dueAt: nextFollowUpTask.due_at as string,
                }
              : null
          }
          activityItems={activityItems}
          notesCount={humanNotes.length}
          strayContacts={contactOptions}
          locations={locations}
          profileFacts={{
            dba: account.dba as string | null,
            linkedinUrl: account.linkedin_url as string | null,
            yearFounded: account.year_founded as number | null,
            ownershipType: account.ownership_type as string | null,
            companyType: account.company_type as string | null,
            companySize: account.company_size as string | null,
            annualFreightSpend: account.annual_freight_spend as number | null,
            source: account.source as string | null,
            dotNumber: account.dot_number as string | null,
            mcNumber: account.mc_number as string | null,
            contextNotes: account.context_notes as string | null,
            confirmed: aiConfirmedFields,
          }}
          custom={account.custom as Record<string, unknown> | null}
          activityPanel={<ActivityLogSection accountId={account.id as string} items={activityItems} />}
          notesPanel={
            <NotesTab
              accountId={account.id as string}
              accountName={accountName}
              notes={humanNotes}
              contactOptions={contactOptions}
              currentUser={currentUser}
            />
          }
          shipmentsPanel={<ShipmentsTab accountId={account.id as string} accountName={accountName} />}
          tasksPanel={
            <TasksTab
              accountId={account.id as string}
              tasks={tasks}
              reps={reps}
              contacts={contactOptions}
              canAssignOthers={isOwner}
              currentUser={currentUser}
            />
          }
          tasksCount={openTasks.length}
          documentsPanel={
            <FilesTab
              accountId={account.id as string}
              orgId={user.orgId}
              documents={documents}
              photos={commodityPhotos}
            />
          }
        />
      </div>
    </>
  );
}
