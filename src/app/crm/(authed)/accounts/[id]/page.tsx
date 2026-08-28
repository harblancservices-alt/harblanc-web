import { notFound } from "next/navigation";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { CRM_ACTIVITY } from "@/lib/crm/activity";
import { firstName, titleCaseWords, upperCaseState } from "../../_shell/format";
import { parsePhones, parseLinks, normalizeHref } from "../../_shell/contactFields";
import type { RepOption } from "../CompanyDialog";
import type { CrmContact } from "./ContactsMasterDetail";
import { FinalizeBanner } from "./FinalizeBanner";
import type { CrmTagOption } from "./TagsCard";
import { ActivityLogSection, type CrmActivityLogItem } from "./ActivityLogSection";
import { TasksTab } from "./TasksTab";
import { NotesTab, type CrmNoteItem } from "./NotesTab";
import { FilesTab } from "./FilesTab";
import { callOutcomeLabel, callOutcomeTone } from "../../calls/outcomes";
import type { TaskContactOption } from "../../tasks/TaskDialog";
import { type CrmBolDocument } from "./BolSection";
import { CompanyProfileSection } from "./CompanyProfileSection";
import { ShipmentsTab } from "./ShipmentsTab";
import type { CrmTaskItem } from "../../tasks/TaskRow";
import { CompanyFile } from "./desktop/file/CompanyFile";
import { bolFacts, type BolRow } from "./desktop/file/bolFacts";
import type { BolDoc } from "./desktop/file/BolViewer";
import { fileGaps } from "./desktop/file/fileGaps";
import type { CallPerson } from "./desktop/file/WhoDoICall";
import type { FileTask } from "./desktop/file/TasksPanel";
import { ReassignLink } from "./desktop/file/ReassignLink";
import { DETAILS_FIELDS } from "./details-fields";
import { serverNow } from "@/lib/crm/serverNow";
import { lastContactStatus } from "../../_shell/format";
import type { IdentityLink } from "./desktop/IdentityCard";
import { timestampMs } from "../../_shell/format";
import { MobileProfile } from "./mobile/MobileProfile";
import type { MobilePerson } from "./mobile/MobilePeople";
import { listQuickTasks } from "../../admin/quick-task-actions";

export const dynamic = "force-dynamic";


type ProfileRow = { id: string; full_name: string | null; email: string | null; is_active: boolean; role: string };

function profileName(p: ProfileRow | undefined): string | null {
  if (!p) return null;
  return firstName(p.full_name, p.email) || null;
}

/**
 * Company profile — ONE data load, TWO layouts, gated against each other at
 * `lg` so neither can regress the other:
 *
 *   `lg:hidden`    → mobile/MobileProfile.tsx  (2026-08-23 phone redesign)
 *   `hidden lg:block` → desktop/DesktopProfile.tsx (2026-08-22 handoff build)
 *
 * Every query lives here and both trees are shaped from the same results —
 * no screen re-fetches, and no write differs between them. Where a panel is
 * an async Server Component (ShipmentsTab, CompanyProfileSection) it is
 * built here and handed down as a ReactNode.
 *
 * The AI research and suggestions COMPONENTS were deleted on 2026-08-26.
 * Their data (crm_ai_suggestions, ai_confirmed_fields) is untouched but has
 * no writer any more, and nothing on this page reads it. No Deals tab
 * either: crm_deals has no real usage anywhere in this codebase.
 *
 * ContactsMasterDetail.tsx is no longer rendered by this page — per-contact
 * detail moved to /crm/contacts/[contactId]. It is left on disk because
 * other surfaces
 * still reference their types and behavior; nothing imports them from here.
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
      "id, name, industry, website, phone, phones, links, address, city, state, zip, company_size, commodities, annual_freight_spend, revenue_potential, source, lifecycle_status, assigned_user_id, primary_contact_id, needs_finalize, created_at, updated_at, dot_number, mc_number, company_type, email, context_notes, custom, equipment_needed, lanes, volume_frequency, weight_range, special_requirements, ai_confirmed_fields, linkedin_url, dba, year_founded, ownership_type, current_carrier",
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
    accountTagsRes,
    orgTagsRes,
    bolRes,
    shipmentCountRes,
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
        "id, title, notes, task_type, due_at, priority, status, completed_at, reminder_at, account_id, contact_id, assigned_user_id, definition_of_done",
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
    supabase.from("crm_account_tags").select("tag_id").eq("account_id", id),
    supabase.from("crm_tags").select("id, label, color").order("label", { ascending: true }),
    // fetchAccountLocations lived here until 2026-08-26. It existed purely
    // for the desktop LocationsCard, which the company file replaced — the
    // address it needed is in the header now. Mobile still renders the
    // self-fetching LocationsSection, so nothing lost a location; this page
    // simply stopped paying for a query nothing on it read.
    // The BOLs this company SHIPPED — panel 04's left half. Matched as the
    // shipper specifically: a company that appears on a BOL as the
    // consignee received that freight, it did not tender it, and listing
    // somebody else's shipment as this company's lane would be wrong.
    supabase
      .from("crm_bol_entries")
      .select(
        "id, document_id, bol_number, carrier, shipper_name, shipper_address, consignee_name, consignee_address, bill_to, commodity, weight, pickup_date, delivery_date, reference, notes",
      )
      .eq("matched_shipper_account_id", id)
      .is("deleted_at", null)
      .limit(200),
 
    // How many loads this company has — the Shipments tab's count. An
    // id-only head query (count exact, no rows), and IN the Promise.all,
    // unlike the sequential probe this replaces.
    supabase
      .from("crm_shipments")
      .select("id", { count: "exact", head: true })
      .eq("account_id", id)
      .is("deleted_at", null),
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

  // The crm_shipments probe that used to sit here went on 2026-08-26 with
  // the desktop Loads panel it gated. It was a SEQUENTIAL await — outside
  // the Promise.all above — so every company page paid a full round-trip for
  // it, and 98 of 99 companies got `false` back. Mobile's Loads tab still
  // fetches its own.

  // COMMODITY PHOTOS came out of the UI on 2026-08-26 (zero rows across all
  // 99 companies). The query, the storage signing round-trip and the mapping
  // went with it — they were doing real work per page load for a card that
  // rendered nothing. The rows, the bucket, the `commodity_photo` kind and
  // CommodityPhotoTiles are all untouched on disk.

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
  /**
   * The composed address — now the header's subtitle rather than a line in
   * a bar, so its punctuation is visible enough to matter.
   *
   * The ZIP joins the state with a SPACE, not a comma: US addresses are
   * written "Houston, TX 77040", and the old comma-join rendered
   * "Houston, TX, 77040", which read as a list rather than an address.
   * Only the city/state/zip tail changes; the street still joins with a
   * comma, and a company missing any part still composes cleanly because
   * each piece is filtered before it is joined.
   */
  const cityStateZip =
    [[accountCity, accountState].filter(Boolean).join(", "), (account.zip as string | null) || null]
      .filter(Boolean)
      .join(" ");
  const fullAddress = [accountAddress, cityStateZip].filter(Boolean).join(", ") || null;
  const companyEmail = (account.email as string | null) || primaryContactEmail;

  const aiConfirmedFields = (account.ai_confirmed_fields as Record<string, unknown> | null) ?? {};

  // (The `freight: CompanyFreightData` object that used to sit here fed
  // CompanyDetailsCard, which the 2026-08-23 mobile redesign replaced. That
  // card's own "Freight profile" block had already narrowed to Commodities
  // alone — equipment/lanes/volume/weight/special-requirements stopped
  // rendering when the inline Commodities picker landed — so the only live
  // values it carried, `commodities` and `confirmed.commodities`, are passed
  // straight to CommoditiesCard by both trees now. Nothing stopped
  // displaying; one dead intermediate object went away.)

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

  /* THE COMPOSER'S "for ..." LINE. Three cases, decided here because this
   * is where both the owner and the viewer are known:
   *   · somebody else owns it  -> their name, the case the line exists for
   *   · the viewer owns it     -> null, and nothing renders; naming
   *                               yourself on your own company is noise
   *   · nobody owns it         -> say so, because createTask falls back to
   *                               the creator and "it will come to you" is
   *                               the surprising half of that */
  const taskOwnerLabel =
    currentRepId === null
      ? "you — nobody owns this company yet"
      : currentRepId === user.id
        ? null
        : currentRepLabel;

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

  // The desktop contact WHEEL derivation stood here. The company file's
  // panel 01 builds `filePeople` from the same contacts further down, so
  // this was the same list shaped for a component nothing renders.

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

  // ── COMPANY FILE derivations (2026-08-26 "inch for inch" rebuild) ────
  // Same discipline as the two blocks around it: reshaped from what this
  // page already loads, plus the one new BOL query above. ONE instant is
  // read for the whole page and threaded down — see lib/crm/serverNow.ts.
  const nowMs = serverNow();
  const now = new Date(nowMs);

  // `is_decision_maker` is on the raw rows but not on CrmContact, so it is
  // read off contactRows. Hoisted above filePeople (2026-08-26) because the
  // company file's Contacts tab needs it too — it used to be declared in the
  // mobile block below, which is the only place that wanted it.
  const decisionMakerIds = new Set(contactRows.filter((c) => c.is_decision_maker).map((c) => c.id));

  const createdMs = timestampMs(account.created_at as string);
  const onFileDays = createdMs === null ? 0 : Math.max(0, Math.floor((nowMs - createdMs) / 86_400_000));
  const createdLabel = createdMs
    ? new Date(createdMs).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "America/Chicago",
      })
    : null;

  // `headerPlace` (city, state) stood here until 2026-08-26. The header's
  // subtitle now renders the composed `fullAddress`, which already ends in
  // the town — showing both printed the place twice. See FileHeader.tsx.

  const filePeople: CallPerson[] = contacts
    .map((c) => {
      const lastMs = timestampMs(
        contactRows.find((r) => r.id === c.id)?.last_contacted_at ?? null,
      );
      const status = lastContactStatus(lastMs, now);
      return {
        id: c.id,
        name: c.name,
        title: c.title ?? null,
        email: c.email ?? null,
        phones: c.phones,
        isPrimary: c.id === (account.primary_contact_id as string | null),
        lastContactLabel:
          status.freshness === "never" ? "never called" : `reached ${status.text.toLowerCase()}`,
        // Roster fields — rendered by the Contacts tab, not by the shortlist.
        role: c.role_category ?? null,
        isDecisionMaker: decisionMakerIds.has(c.id),
        bestTimeToCall: c.best_time_to_call ?? null,
        defaults: {
          id: c.id,
          name: c.name,
          title: c.title ?? null,
          email: c.email ?? null,
          phones: c.phones,
          links: c.links,
          best_time_to_call: c.best_time_to_call ?? null,
          notes: c.notes ?? null,
          next_followup_at: c.next_followup_at ?? null,
          role_category: c.role_category ?? null,
          current_mood: c.current_mood ?? null,
        },
      };
    })
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));

  /** The composer's "who am I logging this against" list — the same people,
   * flattened to what a <select> needs. */
  const composerContacts = filePeople.map((p) => ({
    id: p.id,
    name: p.name,
    phoneLabel: p.phones[0]?.label || null,
  }));

  /** The admin's curated quick tasks, for the composer's Task tab.
   *
   * Read HERE, on the server, rather than by the client panel itself. This
   * page is already a server component with a session, so it costs one more
   * query on a request that is making many — and it means the Task tab
   * never calls the server just to render. A server action would run
   * requireCrmUser(), which redirects on a lapsed session, and a redirect
   * from an action navigates the page: a rep who had typed a task would
   * lose it. See WhatHappened's own note. */
  const quickTasks = await listQuickTasks();

  /** The company's own numbers. `phones` is the modern jsonb column; the
   * legacy `phone` text column is folded in so a company that predates the
   * migration still shows a line rather than an empty footer. */
  const fileCompanyPhones =
    phones.length > 0
      ? phones
      : companyPhone
        ? [{ label: "Main", number: companyPhone }]
        : [];

  const fileGapList = fileGaps({
    id: account.id as string,
    name: accountName,
    city: accountCity,
    state: accountState,
    address: accountAddress,
    industry: account.industry as string | null,
    contactCount: contacts.length,
    currentCarrier: account.current_carrier as string | null,
    annualFreightSpend: account.annual_freight_spend as number | null,
  });

  const fileTasks: FileTask[] = openTasks.map((t) => ({
    id: t.id,
    title: t.title,
    notes: t.notes ?? null,
    definitionOfDone: (t as { definition_of_done?: string | null }).definition_of_done ?? null,
    dueAt: t.due_at ?? null,
    assigneeName: t.assigneeName ?? null,
  }));

  const bolRows = (bolRes.data ?? []) as {
    id: string;
    document_id: string | null;
    bol_number: string | null;
    carrier: string | null;
    shipper_name: string | null;
    shipper_address: string | null;
    consignee_name: string | null;
    consignee_address: string | null;
    bill_to: string | null;
    commodity: string | null;
    weight: string | null;
    pickup_date: string | null;
    delivery_date: string | null;
    reference: string | null;
    notes: string | null;
  }[];

  /**
   * THE BOL PDFs THEMSELVES — company -> crm_bol_entries -> crm_documents.
   *
   * NOT company -> crm_documents, which is how every other document surface
   * in this CRM finds files. `crm_documents.account_id` is NULL on 13 of the
   * 14 BOL PDFs: they were uploaded through the BOL Center, land under a
   * `bol-center/` storage path, and carry no company. Filtering documents by
   * account_id finds ONE of the fourteen. The parsed entry is the only thing
   * holding both ends — matched_shipper_account_id and document_id — so the
   * join goes through it.
   *
   * A SECOND QUERY, and deliberately a conditional one. It cannot join in
   * the Promise.all above because it needs ids that query returns, and
   * making it unconditional would put a sequential round-trip on all 99
   * company pages to serve the 6 that have a shipper-matched BOL. It is
   * skipped entirely when there are no entries, which is the normal case.
   */
  const bolDocIds = bolRows.map((b) => b.document_id).filter((v): v is string => !!v);
  const bolDocRows = bolDocIds.length
    ? ((
        await supabase
          .from("crm_documents")
          .select("id, file_name, storage_path, mime_type, size_bytes")
          .in("id", bolDocIds)
          .is("deleted_at", null)
      ).data ?? [])
    : [];
  const docById = new Map(
    (bolDocRows as {
      id: string;
      file_name: string;
      storage_path: string;
      mime_type: string | null;
      size_bytes: number | null;
    }[]).map((d) => [d.id, d]),
  );

  /** Newest first, so the switcher opens on the most recent load. Same
   * tolerance for a TEXT pickup_date as bolFacts: unparseable sorts last
   * rather than throwing. */
  const bolDocs: BolDoc[] = bolRows
    .map((b) => {
      const doc = b.document_id ? docById.get(b.document_id) : undefined;
      if (!doc) return null;
      const t = (v: string | null) => (v ?? "").trim() || null;
      return {
        entryId: b.id,
        bolNumber: t(b.bol_number),
        pickupDate: t(b.pickup_date),
        fileName: doc.file_name,
        storagePath: doc.storage_path,
        mimeType: doc.mime_type,
        sizeBytes: doc.size_bytes,
        // Every remaining parsed field, trimmed to null when blank so the
        // right column can simply skip what the parse did not find.
        carrier: t(b.carrier),
        shipperName: t(b.shipper_name),
        shipperAddress: t(b.shipper_address),
        consigneeName: t(b.consignee_name),
        consigneeAddress: t(b.consignee_address),
        billTo: t(b.bill_to),
        commodity: t(b.commodity),
        weight: t(b.weight),
        deliveryDate: t(b.delivery_date),
        reference: t(b.reference),
        notes: t(b.notes),
      };
    })
    .filter((d): d is BolDoc => d !== null)
    .sort((a, b) => {
      const at = Date.parse(a.pickupDate ?? "");
      const bt = Date.parse(b.pickupDate ?? "");
      return (Number.isNaN(bt) ? -Infinity : bt) - (Number.isNaN(at) ? -Infinity : at);
    });

  const facts = bolFacts(
    (bolRows as {
      bol_number: string | null;
      shipper_address: string | null;
      consignee_name: string | null;
      consignee_address: string | null;
      commodity: string | null;
      weight: string | null;
      carrier: string | null;
      pickup_date: string | null;
    }[]).map<BolRow>((b) => ({
      bolNumber: b.bol_number,
      shipperAddress: b.shipper_address,
      consigneeName: b.consignee_name,
      consigneeAddress: b.consignee_address,
      commodity: b.commodity,
      weight: b.weight,
      carrier: b.carrier,
      pickupDate: b.pickup_date,
    })),
  );

  // ── MOBILE derivations (2026-08-23 redesign) ─────────────────────────
  // Same discipline as the desktop block above: everything here is reshaped
  // from data this page ALREADY loads. No extra query, no different write.
  // `is_decision_maker` is selected and lives on contactRows, but CrmContact
  // (= ContactDefaults + id/name/phones/links) doesn't carry it, so read it
  // off the raw rows rather than widening a shared type for one badge.

  const mobilePeople: MobilePerson[] = contacts
    .map((c) => ({
      id: c.id,
      name: c.name,
      title: c.title ?? null,
      phone: c.phones[0]?.number ?? null,
      email: c.email ?? null,
      isPrimary: c.id === (account.primary_contact_id as string | null),
      isDecisionMaker: decisionMakerIds.has(c.id),
      defaults: {
        id: c.id,
        name: c.name,
        title: c.title,
        email: c.email,
        phones: c.phones,
        links: c.links,
        best_time_to_call: c.best_time_to_call,
        notes: c.notes,
        next_followup_at: c.next_followup_at,
        role_category: c.role_category,
        current_mood: c.current_mood,
      },
    }))
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));

  const mobileTree = (
    <MobileProfile
      accountId={account.id as string}
      accountName={accountName}
      industry={account.industry as string | null}
      city={accountCity}
      state={accountState}
      stage={stage}
      repLabel={currentRepLabel}
      currentUserId={user.id}
      isAdmin={isOwner}
      editDefaults={editDefaults}
      reps={reps}
      canDelete={isOwner}
      finalizeBanner={
        account.needs_finalize ? <FinalizeBanner defaults={editDefaults} reps={reps} canAssign={isOwner} /> : null
      }
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
      phones={phones}
      legacyPhone={companyPhone}
      email={companyEmail}
      fullAddress={fullAddress}
      links={desktopLinks}
      commodities={commodityChips}
      commoditiesFromAi={!!aiConfirmedFields.commodities}
      glance={{
        annualFreightSpend: account.annual_freight_spend as number | null,
        companySize: account.company_size as string | null,
        yearFounded: account.year_founded as number | null,
        companyType: account.company_type as string | null,
        ownershipType: account.ownership_type as string | null,
        source: account.source as string | null,
      }}
      people={mobilePeople}
      strayContacts={contactOptions}
      attachedTags={attachedTags}
      orgTags={orgTags}
      activityItems={activityItems}
      notesCount={humanNotes.length}
      openTaskCount={openTasks.length}
      documentCount={documents.length}
      custom={account.custom as Record<string, unknown> | null}
      tasksPanel={
        <TasksTab
          companyOwnerId={currentRepId}
          accountId={account.id as string}
          tasks={tasks}
          reps={reps}
          contacts={contactOptions}
          canAssignOthers={isOwner}
          currentUser={currentUser}
        />
      }
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
      documentsPanel={
        <FilesTab
          accountId={account.id as string}
          orgId={user.orgId}
          documents={documents}
        />
      }
      companyProfilePanel={<CompanyProfileSection accountId={account.id as string} />}
    />
  );

  return (
    <>
      {/* MOBILE / TABLET — Brent's approved 2026-08-23 phone redesign (see
          mobile/MobileProfile.tsx for what it replaced and why). The two
          trees stay gated against each other at `lg` rather than one layout
          trying to be both, so a change here can never reach desktop. */}
      <div className="lg:hidden">{mobileTree}</div>

      {/* DESKTOP — THE COMPANY FILE (2026-08-26). Brent handed over a
          mockup with "make the company page look like this inch for inch",
          and this is it: dark header, ten-cell stage strip, the composer at
          the top, then 01 who do I call / 02 what happened / 03 tasks, then
          04 what we know.

          It replaces desktop/DesktopProfile.tsx and the tree beneath it,
          built the same morning. Those files stay on disk — the mobile tree
          still imports several of them — but nothing on desktop renders
          them any more. See file/CompanyFile.tsx for what survived.

          NO PAGE GUTTER: the header and stage strip run edge to edge, so
          this tree supplies its own padding rather than sitting inside the
          shell's usual px-6. */}
      <div className="hidden lg:block">
        <CompanyFile
          accountId={account.id as string}
          accountName={accountName}
          industry={account.industry as string | null}
          fullAddress={fullAddress}
          stage={stage}
          ownerLabel={currentRepLabel}
          reassign={
            <ReassignLink
              accountId={account.id as string}
              ownerId={currentRepId}
              currentUserId={user.id}
              isAdmin={isOwner}
              reps={reps}
            />
          }
          onFileDays={onFileDays}
          createdLabel={createdLabel}
          gaps={fileGapList}
          people={filePeople}
          companyPhones={fileCompanyPhones}
          composerContacts={composerContacts}
          quickTasks={quickTasks}
          taskOwnerLabel={taskOwnerLabel}
          activityItems={activityItems}
          tasks={fileTasks}
          facts={facts}
          bolDocs={bolDocs}
          allFieldsCount={DETAILS_FIELDS.length}
          companyDefaults={editDefaults}
          reps={reps}
          canReassign={isOwner}
          nowMs={nowMs}
          shipmentCount={shipmentCountRes.count ?? 0}
          shipmentsPanel={
            <ShipmentsTab accountId={account.id as string} accountName={accountName} />
          }
          finalizeBanner={
            account.needs_finalize ? (
              <FinalizeBanner defaults={editDefaults} reps={reps} canAssign={isOwner} />
            ) : null
          }
        />
      </div>
    </>
  );
}
