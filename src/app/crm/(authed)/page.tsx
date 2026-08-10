import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card } from "./_shell/ui";
import {
  formatDate,
  timestampMs,
  dueCountdown,
  firstName as profileFirstName,
  centralDayRange,
  titleCaseWords,
} from "./_shell/format";
import { parsePhones, digitsForTel } from "./_shell/contactFields";
import type { CrmTaskItem } from "./tasks/TaskRow";
import type { RepOption } from "./accounts/CompanyDialog";
import { HeaderAddCompanyButton } from "./QuickActions";
import { QuickActionsStrip } from "./QuickActionsStrip";
import { CounterTiles, type CounterTileData } from "./CounterTiles";
import { DashboardSearch, type SearchContactOption } from "./DashboardSearch";
import { NextBestActionSection, type NbaItem } from "./NextBestActionSection";
import { NeedsResearchList, type ResearchGapCompany } from "./NeedsResearchList";
import { NoContactsYetList, type NoContactCompany } from "./NoContactsYetList";
import { FollowupsDueList, type FollowupDueItem } from "./FollowupsDueList";
import { GoingStaleList } from "./GoingStaleList";
import type { StaleReconnectCompany } from "./StaleReconnectRow";
import { normalizeStage } from "./accounts/lifecycle";
import { CRM_CONTACT_ACTIVITY_KINDS } from "@/lib/crm/activity";

export const dynamic = "force-dynamic";

const CENTRAL_TZ = "America/Chicago";
const DAY_MS = 86_400_000;

type TaskRowData = {
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
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  is_active: boolean;
};

type FollowupContactRow = {
  id: string;
  name: string;
  account_id: string | null;
  next_followup_at: string | null;
  notes: string | null;
  phone: string | null;
  phones: unknown;
};

/** crm_accounts columns the completeness score reads — Company/Commercial/
 * Context field groups only (see buildProfileCompleteness below); the
 * Freight-profile group is intentionally excluded, matching the prior
 * research audit's hard exclusion of trucking-ops data from this dashboard. */
type AccountRow = {
  id: string;
  name: string;
  phone: string | null;
  phones: unknown;
  lifecycle_status: string | null;
  created_at: string;
  attention_dismissed_at: string | null;
  primary_contact_id: string | null;
  dba: string | null;
  linkedin_url: string | null;
  year_founded: number | null;
  ownership_type: string | null;
  industry: string | null;
  company_size: string | null;
  website: string | null;
  fit_rating: number | null;
  payment_terms: string | null;
  current_carrier: string | null;
  context_notes: string | null;
};

const COMPLETENESS_COLUMNS = [
  "dba",
  "linkedin_url",
  "year_founded",
  "ownership_type",
  "industry",
  "company_size",
  "website",
  "fit_rating",
  "payment_terms",
  "current_carrier",
  "context_notes",
] as const satisfies readonly (keyof AccountRow)[];

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return Boolean(value);
}

/**
 * Profile-completeness % (0-100) — the fraction of Company/Commercial/
 * Context detail fields (see accounts/[id]/details-fields.ts's DETAILS_
 * FIELDS registry) that have a stored value. Deliberately excludes the
 * Freight-profile group (equipment, lanes, volume, weight, special
 * requirements) — those are firmographic FACTS the AI research pipeline
 * captures, but scoring them would blend "researched" with "freight-ops
 * completeness," which the CRM's prospecting scope treats as out of bounds.
 * Drives the red<40% / amber<65% / green≥65% bar in NeedsResearchList.
 */
function buildProfileCompleteness(a: AccountRow): number {
  const filled = COMPLETENESS_COLUMNS.filter((k) => isFilled(a[k])).length;
  return Math.round((filled / COMPLETENESS_COLUMNS.length) * 100);
}

/** Central-time hour (0-23) for a moment — drives the header's time-of-day
 * greeting. Some engines format midnight as "24" with hour12:false. */
function centralHour(date: Date): number {
  const h = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: CENTRAL_TZ,
      hour: "2-digit",
      hour12: false,
    }).format(date),
  );
  return h === 24 ? 0 : h;
}

/** Mirrors TaskRow's contextAction — the Call/Email pill a task row offers
 * based on its task_type, kept as a standalone function here since this page
 * renders its own Next-Best-Action row shape rather than a full TaskRow. */
function taskContextAction(task: CrmTaskItem): NbaItem["action"] {
  const type = (task.task_type ?? "").toLowerCase();
  if (type.includes("email")) {
    return task.contactEmail ? { label: "EMAIL", href: `mailto:${task.contactEmail}` } : null;
  }
  if (type.includes("call") || type.includes("voicemail")) {
    const phone = task.contactPhone || task.companyPhone;
    return phone ? { label: "CALL", href: `tel:${digitsForTel(phone)}` } : null;
  }
  return null;
}

/**
 * The CRM dashboard — Brent's approved "Command Center" mockup: 6 counter
 * tiles, a quick-actions strip, then a 3-column body (Next Best Action /
 * Needs Research + No Contacts Yet / Follow-ups Due + Going Stale). Replaces
 * the previous button-cockpit + Pipeline + Needs-attention + What's-next +
 * Recent-activity layout entirely — every widget below is either a straight
 * reuse of an existing calculation (staleness, due-date buckets) or a small
 * new org-wide gap-finder built from columns that already exist (research
 * notes, contact counts, detail-field fill state) — see each section's
 * comment for exactly which. RLS-scoped to the caller's org; force-dynamic
 * keeps it live.
 */
export default async function CrmDashboardPage() {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const now = new Date();
  // Day boundaries are Central calendar-day boundaries — "today" turns over
  // at Central midnight regardless of the server's own zone (Vercel runs
  // UTC), matching every other overdue/due-today split in the CRM.
  const { startMs: todayStart, endMs: todayEnd } = centralDayRange(now);
  const endOfTodayISO = new Date(todayEnd).toISOString();

  const [
    followupContactsRes,
    openTasksRes,
    profilesRes,
    companyOptionsRes,
    orgContactsRes,
    allAccountsRes,
    researchNotesRes,
  ] = await Promise.all([
    // Follow-ups due today or overdue — contacts whose next_followup_at has
    // arrived. Everything this query returns is either overdue or due today
    // (nothing further out), so `overdue` below is the only split needed.
    supabase
      .from("crm_contacts")
      .select("id, name, account_id, next_followup_at, notes, phone, phones")
      .is("deleted_at", null)
      .not("next_followup_at", "is", null)
      .lte("next_followup_at", endOfTodayISO)
      .order("next_followup_at", { ascending: true })
      .limit(100),
    // Every open task, org-wide — not just the viewer's own assignments.
    supabase
      .from("crm_tasks")
      .select(
        "id, title, notes, task_type, due_at, priority, status, completed_at, reminder_at, account_id, contact_id, assigned_user_id",
      )
      .eq("status", "open")
      .is("deleted_at", null)
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(500),
    supabase.from("crm_profiles").select("id, full_name, email, is_active"),
    supabase
      .from("crm_accounts")
      .select("id, name")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .limit(1000),
    // Org-wide contact roster — quick-action dialogs' pickers, the "No
    // Contacts Yet" gap-finder (grouped by account_id below), and the
    // Decision Makers counter (is_decision_maker).
    supabase
      .from("crm_contacts")
      .select("id, name, account_id, phone, phones, email, title, is_decision_maker")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .limit(2000),
    // Every non-deleted, released company, carrying the completeness-score
    // columns and primary_contact_id — the shared source for the Stale/
    // Research/New-this-week counters AND the Needs-Research / Going-Stale
    // widget lists, so that data is fetched exactly once.
    supabase
      .from("crm_accounts")
      .select(
        "id, name, phone, phones, lifecycle_status, created_at, attention_dismissed_at, primary_contact_id, dba, linkedin_url, year_founded, ownership_type, industry, company_size, website, fit_rating, payment_terms, current_carrier, context_notes",
      )
      .is("deleted_at", null)
      .or("ai_status.is.null,ai_status.neq.pending_review")
      .limit(500),
    // Which accounts already have an AI-research note on file — the org-wide
    // "Needs Research" gap-finder over data AiResearchSection already logs
    // per-company (crm_notes.is_ai=true).
    supabase.from("crm_notes").select("account_id").eq("is_ai", true).is("deleted_at", null).limit(5000),
  ]);

  const followupRows = (followupContactsRes.data ?? []) as FollowupContactRow[];
  const openTaskRows = (openTasksRes.data ?? []) as TaskRowData[];
  const profiles = (profilesRes.data ?? []) as ProfileRow[];
  const profileNameById = new Map(
    profiles.map((p) => [p.id, profileFirstName(p.full_name, p.email) || "Unnamed rep"]),
  );
  const allAccounts = (allAccountsRes.data ?? []) as AccountRow[];

  // ── Quick-action / search rosters ──
  const companyOptions = ((companyOptionsRes.data ?? []) as { id: string; name: string }[]).map(
    (a) => ({ id: a.id, name: titleCaseWords(a.name) }),
  );
  const orgContacts = (orgContactsRes.data ?? []) as {
    id: string;
    name: string;
    account_id: string | null;
    phone: string | null;
    phones: unknown;
    email: string | null;
    title: string | null;
    is_decision_maker: boolean;
  }[];
  const quickTaskContacts = orgContacts.map((c) => ({
    id: c.id,
    name: titleCaseWords(c.name),
    accountId: c.account_id,
  }));
  const contactNameById = new Map(orgContacts.map((c) => [c.id, titleCaseWords(c.name)]));
  const contactTitleById = new Map(orgContacts.map((c) => [c.id, c.title]));
  const contactEmailById = new Map(orgContacts.map((c) => [c.id, c.email]));
  const contactPhoneById = new Map(
    orgContacts.map((c) => [c.id, parsePhones(c.phones)[0]?.number || c.phone || null]),
  );
  const canAssignOthers = user.role === "owner";
  const currentUser = {
    id: user.id,
    label: profileFirstName(user.fullName, user.email) || "You",
  };
  const reps: RepOption[] = profiles
    .filter((p) => p.is_active)
    .map((p) => ({ id: p.id, label: profileNameById.get(p.id) ?? "Unnamed rep" }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Resolve company names/phones — the "all accounts" roster covers almost
  // everything; a small fallback fills anything it doesn't (e.g. a
  // pending-review AI lead with a task attached).
  const nameById = new Map(allAccounts.map((a) => [a.id, titleCaseWords(a.name)]));
  const companyPhoneById = new Map(
    allAccounts.map((a) => [a.id, parsePhones(a.phones)[0]?.number || a.phone || null]),
  );
  const missingNameIds = [
    ...new Set(
      [...openTaskRows.map((t) => t.account_id), ...followupRows.map((c) => c.account_id)].filter(
        (id): id is string => Boolean(id) && !nameById.has(id as string),
      ),
    ),
  ];
  if (missingNameIds.length) {
    const { data: extraRows } = await supabase
      .from("crm_accounts")
      .select("id, name, phone, phones")
      .in("id", missingNameIds);
    for (const a of (extraRows ?? []) as { id: string; name: string; phone: string | null; phones: unknown }[]) {
      nameById.set(a.id, titleCaseWords(a.name));
      companyPhoneById.set(a.id, parsePhones(a.phones)[0]?.number || a.phone || null);
    }
  }

  const searchContacts: SearchContactOption[] = quickTaskContacts.map((c) => ({
    id: c.id,
    name: c.name,
    companyName: c.accountId ? (nameById.get(c.accountId) ?? null) : null,
  }));

  // ── Tasks + follow-ups, bucketed by due date (shared by the counters, the
  // Follow-ups Due list, and Next Best Action's overdue tier). ──
  const callList = followupRows.map((c) => {
    const ms = timestampMs(c.next_followup_at);
    return {
      id: c.id,
      name: titleCaseWords(c.name),
      account_id: c.account_id,
      companyName: c.account_id ? (nameById.get(c.account_id) ?? null) : null,
      next_followup_at: c.next_followup_at,
      notes: c.notes,
      phone: parsePhones(c.phones)[0]?.number || c.phone || null,
      overdue: ms !== null && ms < todayStart,
    };
  });

  const allOpenTasks: CrmTaskItem[] = openTaskRows.map((t) => ({
    ...t,
    companyName: t.account_id ? (nameById.get(t.account_id) ?? null) : null,
    contactName: t.contact_id ? (contactNameById.get(t.contact_id) ?? null) : null,
    contactTitle: t.contact_id ? (contactTitleById.get(t.contact_id) ?? null) : null,
    contactEmail: t.contact_id ? (contactEmailById.get(t.contact_id) ?? null) : null,
    contactPhone: t.contact_id ? (contactPhoneById.get(t.contact_id) ?? null) : null,
    assigneeName: t.assigned_user_id ? (profileNameById.get(t.assigned_user_id) ?? null) : null,
    companyPhone: t.account_id ? (companyPhoneById.get(t.account_id) ?? null) : null,
  }));
  const taskDueBucket = (t: CrmTaskItem) => {
    const ms = timestampMs(t.due_at);
    if (ms !== null && ms < todayStart) return 0; // overdue
    if (ms !== null && ms <= todayEnd) return 1; // due today
    return 2; // no due date, or a future one
  };
  const overdueTasks = allOpenTasks.filter((t) => taskDueBucket(t) === 0);
  const dueTodayTasks = allOpenTasks.filter((t) => taskDueBucket(t) === 1);
  const overdueFollowups = callList.filter((c) => c.overdue);
  const dueTodayFollowups = callList.filter((c) => !c.overdue);

  const overdueCount = overdueTasks.length + overdueFollowups.length;
  const dueTodayCount = dueTodayTasks.length + dueTodayFollowups.length;

  // ── Going stale / Stale counter — companies gone quiet: the longest since
  // a logged call or a genuine contact-kind activity (matching the Companies
  // list's own "last contact" computation), excluding terminal stages and
  // brand-new leads that simply haven't been worked yet. Identical rule to
  // the dashboard's previous Needs-attention section — only the layout
  // changed. ──
  const accountIds = allAccounts.map((a) => a.id);
  const [lastCallsRes, lastActivitiesRes] = accountIds.length
    ? await Promise.all([
        supabase
          .from("crm_calls")
          .select("account_id, occurred_at")
          .in("account_id", accountIds)
          .is("deleted_at", null)
          .order("occurred_at", { ascending: false })
          .limit(3000),
        supabase
          .from("crm_activities")
          .select("account_id, occurred_at")
          .in("account_id", accountIds)
          .in("kind", CRM_CONTACT_ACTIVITY_KINDS)
          .order("occurred_at", { ascending: false })
          .limit(3000),
      ])
    : [{ data: [] as { account_id: string; occurred_at: string }[] }, { data: [] as { account_id: string; occurred_at: string }[] }];

  const lastContactMsByAccount = new Map<string, number>();
  for (const row of [
    ...((lastCallsRes.data ?? []) as { account_id: string; occurred_at: string }[]),
    ...((lastActivitiesRes.data ?? []) as { account_id: string; occurred_at: string }[]),
  ]) {
    const ms = timestampMs(row.occurred_at);
    if (ms === null) continue;
    const current = lastContactMsByAccount.get(row.account_id);
    if (current === undefined || ms > current) lastContactMsByAccount.set(row.account_id, ms);
  }

  const STALE_THRESHOLD_DAYS = 7;
  const NEW_LEAD_GRACE_DAYS = 3;
  const DISMISS_WINDOW_DAYS = 5;
  const nonTerminalAccounts = allAccounts.filter((a) => {
    const stage = normalizeStage(a.lifecycle_status);
    return stage !== "lost" && stage !== "inactive";
  });
  const staleAccountsFull = nonTerminalAccounts
    .filter((a) => {
      const dismissedMs = timestampMs(a.attention_dismissed_at);
      if (dismissedMs !== null && now.getTime() - dismissedMs < DISMISS_WINDOW_DAYS * DAY_MS) return false;
      const ms = lastContactMsByAccount.get(a.id);
      if (ms === undefined) {
        const createdMs = timestampMs(a.created_at);
        return createdMs === null || now.getTime() - createdMs >= NEW_LEAD_GRACE_DAYS * DAY_MS;
      }
      return now.getTime() - ms >= STALE_THRESHOLD_DAYS * DAY_MS;
    })
    .sort((a, b) => (lastContactMsByAccount.get(a.id) ?? -Infinity) - (lastContactMsByAccount.get(b.id) ?? -Infinity));

  const staleAccounts: StaleReconnectCompany[] = staleAccountsFull.slice(0, 12).map((a) => {
    const ms = lastContactMsByAccount.get(a.id);
    return {
      id: a.id,
      name: titleCaseWords(a.name),
      daysSinceContact: ms === undefined ? null : Math.floor((now.getTime() - ms) / DAY_MS),
      primaryContactName: a.primary_contact_id ? (contactNameById.get(a.primary_contact_id) ?? null) : null,
    };
  });

  // ── Needs Research — companies with no AI-research note on file yet,
  // thinnest profile first. Excludes terminal stages, same as Stale. ──
  const researchedAccountIds = new Set(
    ((researchNotesRes.data ?? []) as { account_id: string | null }[])
      .map((r) => r.account_id)
      .filter((id): id is string => Boolean(id)),
  );
  const researchGapFull: ResearchGapCompany[] = nonTerminalAccounts
    .filter((a) => !researchedAccountIds.has(a.id))
    .map((a) => ({ id: a.id, name: titleCaseWords(a.name), completenessPct: buildProfileCompleteness(a) }))
    .sort((a, b) => a.completenessPct - b.completenessPct);
  const researchGapTop = researchGapFull.slice(0, 10);

  // ── No Contacts Yet — companies with zero non-deleted crm_contacts rows,
  // newest first (a fresh gap is more urgent to close than an old one). ──
  const contactCountByAccount = new Map<string, number>();
  for (const c of orgContacts) {
    if (!c.account_id) continue;
    contactCountByAccount.set(c.account_id, (contactCountByAccount.get(c.account_id) ?? 0) + 1);
  }
  const noContactAccounts: NoContactCompany[] = nonTerminalAccounts
    .filter((a) => (contactCountByAccount.get(a.id) ?? 0) === 0)
    .sort((a, b) => (timestampMs(b.created_at) ?? 0) - (timestampMs(a.created_at) ?? 0))
    .slice(0, 10)
    .map((a) => ({ id: a.id, name: titleCaseWords(a.name) }));

  // ── Decision Makers / New This Week counters ──
  const decisionMakerCount = orgContacts.filter((c) => c.is_decision_maker).length;
  const newThisWeekCount = allAccounts.filter((a) => {
    const ms = timestampMs(a.created_at);
    return ms !== null && now.getTime() - ms <= 7 * DAY_MS;
  }).length;

  // ── Follow-ups Due (right column) — every follow-up due today or overdue,
  // overdue first. ──
  const followupsDue: FollowupDueItem[] = [...overdueFollowups, ...dueTodayFollowups].map((c) => ({
    id: c.id,
    contactName: c.name,
    companyName: c.companyName,
    accountId: c.account_id,
    nextFollowupAt: c.next_followup_at,
    overdue: c.overdue,
  }));

  // ── Next Best Action — merge overdue tasks, overdue follow-ups, going-
  // stale accounts, and research gaps into one ranked queue. Tiered rather
  // than blended into a single score (the earlier research audit flagged a
  // fuzzy composite score as a real trust risk): overdue work always outranks
  // staleness, staleness always outranks a research gap — each tier is then
  // sorted by its own natural urgency (most overdue first / longest quiet
  // first / thinnest profile first). ──
  const overdueTaskItems: { item: NbaItem; sortMs: number }[] = overdueTasks.map((t) => {
    const overdueText = dueCountdown(t.due_at).text;
    return {
      sortMs: timestampMs(t.due_at) ?? 0,
      item: {
        id: `task-${t.id}`,
        href: t.account_id ? `/crm/accounts/${t.account_id}` : t.contact_id ? `/crm/contacts/${t.contact_id}` : "/crm/tasks",
        avatarLabel: t.companyName || t.contactName || t.title,
        companyName: t.companyName,
        reason: t.contactName ? `${overdueText} · ${t.contactName}` : `${overdueText} · ${t.title}`,
        tag: "OVERDUE",
        action: taskContextAction(t),
      },
    };
  });
  const overdueFollowupItems: { item: NbaItem; sortMs: number }[] = overdueFollowups.map((c) => ({
    sortMs: timestampMs(c.next_followup_at) ?? 0,
    item: {
      id: `followup-${c.id}`,
      href: c.account_id ? `/crm/accounts/${c.account_id}` : `/crm/contacts/${c.id}`,
      avatarLabel: c.companyName || c.name,
      companyName: c.companyName,
      reason: `${dueCountdown(c.next_followup_at).text} · ${c.name}`,
      tag: "OVERDUE",
      action: c.phone ? { label: "CALL", href: `tel:${digitsForTel(c.phone)}` } : null,
    },
  }));
  const staleItems: NbaItem[] = staleAccountsFull.map((a) => {
    const ms = lastContactMsByAccount.get(a.id);
    const days = ms === undefined ? null : Math.floor((now.getTime() - ms) / DAY_MS);
    return {
      id: `stale-${a.id}`,
      href: `/crm/accounts/${a.id}`,
      avatarLabel: titleCaseWords(a.name),
      companyName: titleCaseWords(a.name),
      reason: days === null ? "Never contacted" : `Stale ${days}d`,
      tag: "STALE",
      action: { label: "FOLLOW UP", href: `/crm/accounts/${a.id}` },
    };
  });
  const researchItems: NbaItem[] = researchGapFull.map((c) => ({
    id: `research-${c.id}`,
    href: `/crm/accounts/${c.id}`,
    avatarLabel: c.name,
    companyName: c.name,
    reason: `${c.completenessPct}% profile complete`,
    tag: null,
    action: { label: "RESEARCH", href: `/crm/accounts/${c.id}` },
  }));

  const overdueItems = [...overdueTaskItems, ...overdueFollowupItems]
    .sort((a, b) => a.sortMs - b.sortMs)
    .map((x) => x.item);

  const nbaItems: NbaItem[] = [...overdueItems, ...staleItems, ...researchItems].slice(0, 30);

  // ── Counter tiles ──
  const tiles: CounterTileData[] = [
    { key: "due-today", label: "Due Today", value: dueTodayCount, href: "/crm/tasks#due-today", accent: "#2563eb" },
    { key: "overdue", label: "Overdue", value: overdueCount, href: "/crm/tasks#overdue", accent: "#b91c1c" },
    { key: "stale", label: "Stale", value: staleAccountsFull.length, href: "/crm/accounts?sort=stale", accent: "#b45309" },
    { key: "to-research", label: "To Research", value: researchGapFull.length, href: "#needs-research", accent: "#7c3aed" },
    { key: "decision-makers", label: "Decision Makers", value: decisionMakerCount, href: "/crm/contacts?dm=1", accent: "#15803d" },
    { key: "new-this-week", label: "New This Week", value: newThisWeekCount, href: "/crm/accounts", accent: "#2563eb" },
  ];

  // ── Header summary line ──
  const summaryParts: string[] = [];
  if (overdueCount > 0) summaryParts.push(`${overdueCount} overdue`);
  if (dueTodayCount > 0) summaryParts.push(`${dueTodayCount} due today`);
  if (staleAccountsFull.length > 0) summaryParts.push(`${staleAccountsFull.length} going stale`);
  const summaryLine = summaryParts.length ? summaryParts.join(" · ") : "All caught up. Nothing urgent right now.";
  const summaryTone = overdueCount > 0 ? "text-bad" : dueTodayCount > 0 ? "text-warn" : "text-fg-muted";

  const hour = centralHour(now);
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const displayName = profileFirstName(user.fullName, user.email) || "there";

  return (
    <PageShell>
      {/* Header — greeting + date (CST) + one-line summary + search + Add. */}
      <Card>
        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[19px] font-bold text-fg">
                {greeting}, {displayName}
              </h1>
              <p className="mt-0.5 text-[13px] text-fg-muted">{formatDate(now.toISOString())}</p>
            </div>
            <p className={`shrink-0 text-[13px] font-semibold ${summaryTone}`}>{summaryLine}</p>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <DashboardSearch companies={companyOptions} contacts={searchContacts} />
            <HeaderAddCompanyButton reps={reps} />
          </div>
        </div>
      </Card>

      {/* Counter tiles — 3x2 on mobile, 6-across from sm up. */}
      <CounterTiles tiles={tiles} />

      {/* Quick-actions strip — horizontally scrollable on narrow viewports. */}
      <QuickActionsStrip
        companies={companyOptions}
        reps={reps}
        taskAccounts={companyOptions}
        taskContacts={quickTaskContacts}
        canAssignOthers={canAssignOthers}
        currentUser={currentUser}
      />

      {/* Body — 3-column on desktop (Next Best Action / Needs Research +
          No Contacts Yet / Follow-ups Due + Going Stale); mobile reflows to
          a single column via the `order-*` classes on each widget below,
          matching the approved mockup's mobile order (NBA, Follow-ups Due,
          Going Stale, then Needs Research + No Contacts Yet). */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
        <div className="order-3 lg:order-none lg:col-start-1 lg:col-span-6 lg:row-start-1 lg:row-span-2">
          <NextBestActionSection items={nbaItems} mobileVisibleCount={4} />
        </div>

        <div className="order-6 lg:order-none lg:col-start-7 lg:col-span-3 lg:row-start-1">
          <NeedsResearchList companies={researchGapTop} />
        </div>
        <div className="order-7 lg:order-none lg:col-start-7 lg:col-span-3 lg:row-start-2 lg:mt-4">
          <NoContactsYetList items={noContactAccounts} companies={companyOptions} />
        </div>

        <div className="order-4 lg:order-none lg:col-start-10 lg:col-span-3 lg:row-start-1">
          <FollowupsDueList items={followupsDue} mobileVisibleCount={2} />
        </div>
        <div className="order-5 lg:order-none lg:col-start-10 lg:col-span-3 lg:row-start-2 lg:mt-4">
          <GoingStaleList companies={staleAccounts} />
        </div>
      </div>
    </PageShell>
  );
}
