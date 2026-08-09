import { notFound } from "next/navigation";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { CRM_ACTIVITY } from "@/lib/crm/activity";
import { PageShell } from "../../_shell/ui";
import { firstName, titleCaseWords, upperCaseState } from "../../_shell/format";
import { parsePhones, parseLinks, normalizeHref } from "../../_shell/contactFields";
import { formatPhone } from "@/lib/domain/phone";
import type { RepOption } from "../CompanyDialog";
import { FinalizeBanner } from "./FinalizeBanner";
import { CompanyHeader } from "./CompanyHeader";
import { StageTracker } from "./StageTracker";
import { CallAngleSection } from "./CallAngleSection";
import { CompanyContactsList, type CrmContact } from "./CompanyContactsList";
import { CompanyScaleSection } from "./CompanyScaleSection";
import { ActivityLogSection, type CrmActivityLogItem } from "./ActivityLogSection";
import { DetailsSection, type CrmDetailsTag } from "./DetailsSection";
import { type CrmCommodityPhoto } from "./CommodityPhotoTiles";
import { callOutcomeLabel } from "../../calls/outcomes";
import type { TaskContactOption } from "../../tasks/TaskDialog";
import { BolSection, type CrmBolDocument } from "./BolSection";
import { AiSuggestionsPanel } from "./AiSuggestionsPanel";
import { AiResearchSection, type CrmNote } from "./AiResearchSection";
import { CompanyProfileSection } from "./CompanyProfileSection";
import { FreightProfileSection } from "./FreightProfileSection";
import { CommercialSection } from "./CommercialSection";
import { StrayNumbersSection } from "./StrayNumbersSection";

export const dynamic = "force-dynamic";

const STORAGE_BUCKET = "crm-documents";
const SIGNED_URL_TTL_SECONDS = 300;

type ProfileRow = { id: string; full_name: string | null; email: string | null; is_active: boolean };

function profileName(p: ProfileRow | undefined): string | null {
  if (!p) return null;
  return firstName(p.full_name, p.email) || null;
}

/**
 * Company profile — surface 1 of the CRM Company/Contact rebuild (see
 * Brent's 2026-08-08 build spec). A single stacked column: a STICKY header
 * (name, stage pill, industry/company-type tags, one-tap Call/Email/Map),
 * the existing chevron StageTracker (kept — Brent approved it the same day,
 * and it's the one place that actually MOVES the stage; the header pill is
 * read-only, both driven by the same lifecycle.ts LIFECYCLE_TONE), then five
 * sections in the spec's order: Call angle, Contacts, Company scale,
 * Activity log, Details. AI Suggestions / AI Research / BOL / Stray numbers
 * ride along right after Details, each its own isolated card — untouched
 * functionality, just relocated out of the old tabbed layout (ProfileTabs,
 * CompanyCard, and the Overview/Contacts split it replaced are deleted).
 * Tasks are NOT rendered on this surface in this pass — see the completion
 * report for what that drops from view here (still reachable via the
 * dashboard queue and the global Tasks page).
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
      "id, name, industry, website, phone, phones, links, address, city, state, zip, company_size, commodities, annual_freight_spend, revenue_potential, source, lifecycle_status, assigned_user_id, primary_contact_id, needs_finalize, created_at, updated_at, dot_number, mc_number, company_type, email, context_notes",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!account) notFound();

  // Title-cased/uppercased once here so every consumer below (the header,
  // the Details tab's edit dialog defaults, etc.) reads the same normalized
  // value — including pre-existing not-quite-capitalized data.
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
        "id, contact_id, outcome, duration_seconds, summary, notes, occurred_at, user_id, followup_required, reminder_at",
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
    supabase
      .from("crm_activities")
      .select("user_id")
      .eq("account_id", id)
      .eq("kind", CRM_ACTIVITY.accountCreated)
      .order("occurred_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
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
  const contactOptions: TaskContactOption[] = contacts.map((c) => ({ id: c.id, name: c.name }));

  const primaryContactEmail = account.primary_contact_id
    ? contacts.find((c) => c.id === account.primary_contact_id)?.email ?? null
    : null;

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
      contactName: n.contact_id ? firstName(contactNameById.get(n.contact_id) ?? null) || null : null,
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

  const accountTagIds = ((accountTagsRes.data ?? []) as { tag_id: string }[]).map((t) => t.tag_id);
  let detailsTags: CrmDetailsTag[] = [];
  if (accountTagIds.length) {
    const { data: tagRows } = await supabase.from("crm_tags").select("id, label, color").in("id", accountTagIds);
    detailsTags = (tagRows ?? []) as CrmDetailsTag[];
  }

  const addedByUserId = (addedByRes.data as { user_id: string | null } | null)?.user_id ?? null;
  const addedByName = addedByUserId ? profileName(profileById.get(addedByUserId)) : null;
  const lastResearchRequestedAt = (lastResearchRequestRes.data as { occurred_at: string } | null)?.occurred_at ?? null;

  // ── Activity log — calls + human notes + the remaining activity events,
  // merged into one newest-first feed (see ActivityLogSection.tsx). AI
  // research notes are excluded here (they have their own AI Research card)
  // to avoid showing the same content twice. ──
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
      contactName: c.contact_id ? contactNameById.get(c.contact_id) ?? null : null,
      title: `Call · ${callOutcomeLabel(c.outcome)}${durLabel}`,
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
  }[]).map((a) => ({
    id: a.id,
    type: "activity" as const,
    occurredAt: a.occurred_at,
    author: a.user_id ? profileName(profileById.get(a.user_id)) : null,
    contactName: null,
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
    [accountAddress, [accountCity, accountState].filter(Boolean).join(", "), account.zip].filter(Boolean).join(", ") ||
    null;
  const companyPhone = phones[0]?.number || (account.phone as string | null) || null;
  const companyEmail = (account.email as string | null) || primaryContactEmail;

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

  return (
    <PageShell>
      {account.needs_finalize && <FinalizeBanner defaults={editDefaults} reps={reps} />}

      <div className="flex flex-col gap-4">
        <CompanyHeader
          name={accountName}
          stage={stage}
          industry={account.industry as string | null}
          companyType={account.company_type as string | null}
          phone={companyPhone}
          email={companyEmail}
          mapsAddress={fullAddress}
        />

        <div className="w-full border border-line-strong bg-card p-4 shadow-e2">
          <StageTracker accountId={account.id as string} current={stage} />
        </div>

        <CallAngleSection
          accountId={account.id as string}
          commodities={account.commodities as string | null}
          contextNotes={account.context_notes as string | null}
        />

        <CompanyContactsList
          accountId={account.id as string}
          contacts={contacts}
          contactOptions={contactOptions}
        />

        <CompanyScaleSection accountId={account.id as string} companySize={account.company_size as string | null} />

        <ActivityLogSection accountId={account.id as string} items={activityItems} />

        <DetailsSection
          industry={account.industry as string | null}
          companyType={account.company_type as string | null}
          email={account.email as string | null}
          annualFreightSpend={account.annual_freight_spend as number | null}
          source={account.source as string | null}
          website={website}
          websiteHref={websiteHref}
          tags={detailsTags}
          fullAddress={fullAddress}
          dotNumber={account.dot_number as string | null}
          mcNumber={account.mc_number as string | null}
          addedByName={addedByName}
          addedAt={account.created_at as string}
          updatedAt={account.updated_at as string | null}
          editDefaults={editDefaults}
          reps={reps}
          currentRepId={account.assigned_user_id as string | null}
          canDelete={isOwner}
          accountId={account.id as string}
          orgId={user.orgId}
          photos={commodityPhotos}
        />

        {phones.length > 0 && (
          <StrayNumbersSection accountId={account.id as string} phones={phones} contacts={contactOptions} />
        )}

        <AiSuggestionsPanel accountId={account.id as string} />
        <CompanyProfileSection accountId={account.id as string} />
        <FreightProfileSection accountId={account.id as string} />
        <CommercialSection accountId={account.id as string} />
        <AiResearchSection
          accountId={account.id as string}
          notes={aiNotes}
          lastRequestedAt={lastResearchRequestedAt}
        />
        <BolSection
          accountId={account.id as string}
          orgId={user.orgId}
          documents={documents}
          shipperName={accountName}
          shipperAddress={fullAddress}
          shipperPhone={companyPhone ? formatPhone(companyPhone) : null}
        />
      </div>
    </PageShell>
  );
}
