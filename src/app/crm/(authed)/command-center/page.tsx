import Link from "next/link";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, CardHead, EmptyState } from "../_shell/ui";
import {
  timestampMs,
  formatRelativeTime,
  firstName as profileFirstName,
  titleCaseWords,
} from "../_shell/format";
import { parsePhones } from "../_shell/contactFields";
import type { CrmTaskItem } from "../tasks/TaskRow";
import type { RepOption } from "../accounts/CompanyDialog";
import { HeaderAddCompanyButton } from "../QuickActions";
import { QuickActionsStrip } from "../QuickActionsStrip";
import { CounterTiles, type CounterTileData } from "../CounterTiles";
import { DashboardSearch, type SearchContactOption } from "../DashboardSearch";
import { NextBestActionSection, type NbaItem } from "../NextBestActionSection";
import { IconNote, IconCompanies, IconCalendar, IconTasks } from "../_shell/icons";
import { normalizeStage, stageRank, stageLabel, STALE_DAYS_BY_STAGE, LOST_WINBACK_DAYS } from "../accounts/lifecycle";
import { CRM_ACTIVITY, CRM_CONTACT_ACTIVITY_KINDS } from "@/lib/crm/activity";
import { ensureWinbackTask } from "@/lib/crm/stageAutomation";
import { taskUrgencyBucket } from "@/lib/crm/taskUrgency";
import { taskPriorityCompare } from "../tasks/priority";

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
  assigned_user_id: string | null;
  source: string | null;
  ai_status: string | null;
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
 * Drives the "% profile complete" reason text on the Next Best Action
 * queue's research-gap tier.
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

/**
 * THE COMMAND CENTRE — the org-wide operations view.
 *
 * NOT LINKED FROM THE NAV (2026-08-25). It was /crm, the Workspace →
 * Dashboard destination, until Brent said that item should render the AGENT
 * DASHBOARD instead — his own tasks and his own companies, the same screen
 * everyone else gets, no role split. That is now what /crm serves.
 *
 * This page is parked here rather than deleted: it is ~800 lines of approved,
 * working functionality (org search, the quick-actions strip, the Next Best
 * Action queue, six counter tiles, the activity feed) and throwing it away was
 * not the ask. It still loads at /crm/command-center for anyone who types the
 * URL. Give it a nav item, or delete it — Brent's call, see the report.
 *
 * Brent's approved "Command Center" mockup: 6 counter
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
export default async function CommandCenterPage() {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const now = new Date();

  const [
    openTasksRes,
    profilesRes,
    companyOptionsRes,
    orgContactsRes,
    allAccountsRes,
    researchNotesRes,
    myActivitiesRes,
    myCallsRes,
    myNotesRes,
  ] = await Promise.all([
    // Every open task, org-wide — not just the viewer's own assignments.
    // Source of truth for "is there active future work, and when is it
    // due" — including every follow-up (contact or call sourced), since
    // syncFollowupTask() guarantees a follow-up always has a linked open
    // task here. No separate next_followup_at-driven query needed anymore
    // (see CRM_TASK_INTEGRATION_AUDIT.md Phase 2).
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
        "id, name, phone, phones, lifecycle_status, assigned_user_id, source, ai_status, created_at, attention_dismissed_at, primary_contact_id, dba, linkedin_url, year_founded, ownership_type, industry, company_size, website, fit_rating, payment_terms, current_carrier, context_notes",
      )
      .is("deleted_at", null)
      .or("ai_status.is.null,ai_status.neq.pending_review")
      .limit(500),
    // Which accounts already have an AI-research note on file — the org-wide
    // "Needs Research" gap-finder over data AiResearchSection already logs
    // per-company (crm_notes.is_ai=true).
    supabase.from("crm_notes").select("account_id").eq("is_ai", true).is("deleted_at", null).limit(5000),
    // ── Recent activity, mine — the dashboard's right column. Same
    // three-source merge admin/activity-data.ts uses org-wide (crm_activities
    // minus call/note kinds, plus crm_calls, plus human crm_notes), scoped to
    // this viewer's own user_id instead of the whole org — "jump back to
    // what I just did," not a firehose. ──
    supabase
      .from("crm_activities")
      .select("id, kind, summary, occurred_at, account_id, contact_id")
      .eq("user_id", user.id)
      .not("kind", "in", `(${CRM_ACTIVITY.call},${CRM_ACTIVITY.noteAdded})`)
      .order("occurred_at", { ascending: false })
      .limit(8),
    supabase
      .from("crm_calls")
      .select("id, account_id, contact_id, outcome, occurred_at")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(8),
    supabase
      .from("crm_notes")
      .select("id, account_id, contact_id, created_at")
      .eq("user_id", user.id)
      .eq("is_ai", false)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

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
      openTaskRows.map((t) => t.account_id).filter((id): id is string => Boolean(id) && !nameById.has(id as string)),
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

  // ── Recent activity, mine — merge the 3 sources fetched above, newest
  // first, capped at 8 (see the queries' own comment for why 3 sources). ──
  type MyActivityRow = { id: string; kind: string; summary: string | null; occurred_at: string; account_id: string | null; contact_id: string | null };
  type MyCallRow = { id: string; account_id: string | null; contact_id: string | null; outcome: string | null; occurred_at: string };
  type MyNoteRow = { id: string; account_id: string | null; contact_id: string | null; created_at: string };
  type RecentActivityItem = {
    id: string;
    title: string;
    occurredAt: string;
    href: string | null;
    recordLabel: string | null;
  };
  function recordFor(accountId: string | null, contactId: string | null): { href: string | null; label: string | null } {
    if (accountId) return { href: `/crm/accounts/${accountId}`, label: nameById.get(accountId) ?? null };
    if (contactId) return { href: `/crm/contacts/${contactId}`, label: contactNameById.get(contactId) ?? null };
    return { href: null, label: null };
  }
  const recentActivity: RecentActivityItem[] = [
    ...((myActivitiesRes.data ?? []) as MyActivityRow[]).map((a) => {
      const rec = recordFor(a.account_id, a.contact_id);
      return { id: `activity-${a.id}`, title: a.summary || "Activity", occurredAt: a.occurred_at, href: rec.href, recordLabel: rec.label };
    }),
    ...((myCallsRes.data ?? []) as MyCallRow[]).map((c) => {
      const rec = recordFor(c.account_id, c.contact_id);
      return {
        id: `call-${c.id}`,
        title: `Call · ${(c.outcome || "logged").replace(/_/g, " ")}`,
        occurredAt: c.occurred_at,
        href: rec.href,
        recordLabel: rec.label,
      };
    }),
    ...((myNotesRes.data ?? []) as MyNoteRow[]).map((n) => {
      const rec = recordFor(n.account_id, n.contact_id);
      return { id: `note-${n.id}`, title: "Note added", occurredAt: n.created_at, href: rec.href, recordLabel: rec.label };
    }),
  ]
    .sort((a, b) => (timestampMs(b.occurredAt) ?? 0) - (timestampMs(a.occurredAt) ?? 0))
    .slice(0, 8);

  // ── Tasks, bucketed by due date (shared by the counters and Next Best
  // Action's overdue/due-today tiers). crm_tasks is the sole source here —
  // every follow-up (contact or call sourced) already has a linked open
  // task via syncFollowupTask(), so a separate next_followup_at-driven query
  // would only double-count it (see CRM_TASK_INTEGRATION_AUDIT.md Phase 2). ──
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
  // Shared bucketing (lib/crm/taskUrgency.ts) — same Central-day-boundary
  // logic the global Tasks page and TaskRow's rail color use, so all three
  // agree (CRM_URGENCY_AUDIT.md §2 flagged this as three independent
  // reimplementations of the same check).
  const overdueTasks = allOpenTasks.filter((t) => taskUrgencyBucket(t.due_at, now) === "overdue");
  const dueTodayTasks = allOpenTasks.filter((t) => taskUrgencyBucket(t.due_at, now) === "today");

  const overdueCount = overdueTasks.length;
  const dueTodayCount = dueTodayTasks.length;

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

  const DISMISS_WINDOW_DAYS = 5;
  // "lost" is a dead end for the research-gap/no-contact prospecting-hygiene
  // tiers below, same as the old terminal-stage exclusion (which used to
  // also cover a separate "inactive" stage — that stage is gone; see
  // lifecycle.ts's legacyAlias, which folds old "inactive" rows into "lost"
  // at read time regardless of what's still stored).
  const nonLostAccounts = allAccounts.filter((a) => normalizeStage(a.lifecycle_status) !== "lost");
  const lostAccounts = allAccounts.filter((a) => normalizeStage(a.lifecycle_status) === "lost");

  /** Days since the account's last logged contact, falling back to
   * created_at when there's no contact record at all (never-contacted isn't
   * "infinitely stale" — it just hasn't had time to be). Shared by the
   * stale tier's per-stage clock below and the Lost win-back clock. */
  function daysQuiet(a: AccountRow): number {
    const ms = lastContactMsByAccount.get(a.id) ?? timestampMs(a.created_at) ?? now.getTime();
    return Math.floor((now.getTime() - ms) / DAY_MS);
  }
  /** New Lead's clock runs off "how long has this sat unclaimed"
   * (created_at) rather than contact recency — an unclaimed lead has none by
   * definition; see STALE_DAYS_BY_STAGE's own comment in lifecycle.ts. */
  function daysUnclaimed(a: AccountRow): number {
    const ms = timestampMs(a.created_at) ?? now.getTime();
    return Math.floor((now.getTime() - ms) / DAY_MS);
  }
  /** A New Lead is normally unclaimed by construction (claiming advances it
   * straight to Researching — see claimAiLead), but a company CAN be created
   * manually at New Lead and pre-assigned to its creator in the same write
   * (accounts/actions.ts::createAccount defaults assigned_user_id to the
   * creator) — a real case confirmed against live data, not hypothetical.
   * That account has an owner already, so it isn't claimable (claimAiLead's
   * `assigned_user_id IS NULL` guard would just reject it) and its clock
   * should run off actual contact recency like every other owned stage, not
   * "unclaimed" time it never really had. */
  function isUnclaimedNewLead(a: AccountRow): boolean {
    return normalizeStage(a.lifecycle_status) === "new_lead" && a.assigned_user_id === null;
  }
  /** True only when the CLAIM pill would actually work — matches
   * claimAiLead's own guard (ai_status='released' AND unassigned) exactly,
   * so the button's promise always holds. See ai-agent/queue.ts for why the
   * gate is source-agnostic. isUnclaimedNewLead alone isn't enough: a company
   * can be an unassigned New Lead from a plain manual quick-add (ai_status
   * never set to "released") — real data confirmed this too — and claimAiLead
   * would reject that with "no longer available to claim" since it was never
   * published into the Prospects queue in the first place. */
  function isClaimableNewLead(a: AccountRow): boolean {
    return isUnclaimedNewLead(a) && a.ai_status === "released";
  }
  function staleDays(a: AccountRow): number {
    return isUnclaimedNewLead(a) ? daysUnclaimed(a) : daysQuiet(a);
  }

  // ── Going stale — per-stage clocks (CRM_URGENCY_AUDIT.md P0: the old flat
  // 7-day rule treated a brand-new Lead the same as an already-Quoted
  // account; see STALE_DAYS_BY_STAGE in lifecycle.ts for the actual
  // thresholds, now the single source of truth every reader here defers to).
  // active_customer has no configured threshold (never nags) and lost is
  // handled separately by the win-back clock below, so a missing threshold
  // just excludes the stage rather than needing a second check. ──
  const staleAccountsFull = nonLostAccounts
    .filter((a) => {
      const threshold = STALE_DAYS_BY_STAGE[normalizeStage(a.lifecycle_status)];
      if (threshold === undefined) return false;
      const dismissedMs = timestampMs(a.attention_dismissed_at);
      if (dismissedMs !== null && now.getTime() - dismissedMs < DISMISS_WINDOW_DAYS * DAY_MS) return false;
      return staleDays(a) >= threshold;
    })
    // NBA ranking (CRM_URGENCY_AUDIT.md): quoting outranks contacted outranks
    // researching outranks new_lead(unclaimed) — exactly the funnel order
    // stageRank already encodes, so sorting by rank descending gives that
    // ordering for free; days-stale breaks ties within the same stage.
    .sort((a, b) => {
      const rankDiff = stageRank(normalizeStage(b.lifecycle_status)) - stageRank(normalizeStage(a.lifecycle_status));
      return rankDiff !== 0 ? rankDiff : staleDays(b) - staleDays(a);
    });

  // ── Lost win-back (CRM_URGENCY_AUDIT.md: no cron in this CRM, so computed
  // at READ time on every dashboard load) — a lost account quiet for
  // LOST_WINBACK_DAYS both surfaces in the NBA queue below AND lazily gets
  // ONE unassigned "Reach back out" task if it doesn't already have an open
  // one (see lib/crm/stageAutomation.ts::ensureWinbackTask). ──
  const dueWinbackAccounts = lostAccounts.filter((a) => daysQuiet(a) >= LOST_WINBACK_DAYS);
  await Promise.all(
    dueWinbackAccounts.map((a) => ensureWinbackTask(supabase, { orgId: user.orgId, accountId: a.id })),
  );

  // ── Needs Research — companies with no AI-research note on file yet,
  // thinnest profile first. Excludes lost, same as Stale. Folds into the
  // Next Best Action queue below — no longer a standalone widget. ──
  const researchedAccountIds = new Set(
    ((researchNotesRes.data ?? []) as { account_id: string | null }[])
      .map((r) => r.account_id)
      .filter((id): id is string => Boolean(id)),
  );
  const researchGapFull = nonLostAccounts
    .filter((a) => !researchedAccountIds.has(a.id))
    .map((a) => ({ id: a.id, name: titleCaseWords(a.name), completenessPct: buildProfileCompleteness(a) }))
    .sort((a, b) => a.completenessPct - b.completenessPct);

  // ── No Contacts Yet — companies with zero non-deleted crm_contacts rows,
  // newest first (a fresh gap is more urgent to close than an old one). Folds
  // into the Next Best Action queue as its own (lowest-priority) tier below —
  // no longer a separate standalone widget. ──
  const contactCountByAccount = new Map<string, number>();
  for (const c of orgContacts) {
    if (!c.account_id) continue;
    contactCountByAccount.set(c.account_id, (contactCountByAccount.get(c.account_id) ?? 0) + 1);
  }
  const noContactAccounts = nonLostAccounts
    .filter((a) => (contactCountByAccount.get(a.id) ?? 0) === 0)
    .sort((a, b) => (timestampMs(b.created_at) ?? 0) - (timestampMs(a.created_at) ?? 0))
    .slice(0, 10);

  // ── Decision Makers / New This Week counters ──
  const decisionMakerCount = orgContacts.filter((c) => c.is_decision_maker).length;
  const newThisWeekCount = allAccounts.filter((a) => {
    const ms = timestampMs(a.created_at);
    return ms !== null && now.getTime() - ms <= 7 * DAY_MS;
  }).length;

  // ── Next Best Action — ONE ranked queue, every signal folded in: overdue
  // tasks/follow-ups, due-today follow-ups, going-stale accounts, research
  // gaps, and companies with no contact on file — replacing what used to be
  // 5 separate cards (Next Best Action + Needs Research + No Contacts Yet +
  // Follow-ups Due + Going Stale) with the single list /crm-design's
  // Dashboard uses. Tiered rather than blended into a single score (the
  // earlier research audit flagged a fuzzy composite score as a real trust
  // risk): overdue work always outranks due-today, which outranks staleness,
  // which outranks a research gap, which outranks a bare contact gap — each
  // tier then sorted by its own natural urgency. ──
  // Task-based tiers sort by due date first (the tier's own natural
  // urgency), then priority as a tiebreak (CRM_URGENCY_AUDIT.md P0: priority
  // used to never affect ordering anywhere — see tasks/priority.ts's
  // taskPriorityCompare, shared with the global Tasks page).
  //
  // These stay raw CrmTaskItems now rather than being flattened into NbaItem
  // rows: NextBestActionSection renders them with the shared Style-C TaskRow
  // card, so a task can be completed / logged / snoozed straight from the
  // dashboard (TASK_CARD_AUDIT.md §4.1 — it previously could not be completed
  // here at all). The old avatarLabel/reason/tag flattening and this page's
  // hand-copied taskContextAction went with it; the card derives all of that
  // from the task itself.
  const taskSort = (a: CrmTaskItem, b: CrmTaskItem) =>
    (timestampMs(a.due_at) ?? 0) - (timestampMs(b.due_at) ?? 0) || taskPriorityCompare(a, b);
  const nbaTasks: CrmTaskItem[] = [
    ...[...overdueTasks].sort(taskSort),
    ...[...dueTodayTasks].sort(taskSort),
  ].slice(0, 20);
  // Stale tier reason now names the stage (thresholds differ per stage, so
  // "Stale 6d" alone no longer tells the full story — see STALE_DAYS_BY_STAGE)
  // and the pill itself is stage-aware: what a rep should DO about a stale
  // New Lead (claim it) is a different action than a stale Quoting account
  // (chase the quote), so the label and the task it pre-fills both follow
  // the account's actual stage instead of every row offering the same
  // generic "FOLLOW UP".
  const staleItems: NbaItem[] = staleAccountsFull.map((a) => {
    const stage = normalizeStage(a.lifecycle_status);
    const unclaimed = isUnclaimedNewLead(a);
    const days = staleDays(a);
    const name = titleCaseWords(a.name);
    const reason = unclaimed ? `Unclaimed ${days}d` : `${stageLabel(stage)} · stale ${days}d`;

    let action: NbaItem["action"];
    if (isClaimableNewLead(a)) {
      // Claiming IS the resolution here — see NbaClaimAction (assigns +
      // advances to Researching + fires that stage's entry task in one call).
      action = { kind: "claim", label: "CLAIM", accountId: a.id };
    } else if (stage === "researching" || stage === "new_lead") {
      // A New Lead that's either already assigned or was never published
      // into the claim queue (see isClaimableNewLead) isn't claimable, so it
      // falls back to the same "start working it" pill Researching gets.
      action = {
        kind: "task",
        label: "REACH OUT",
        defaults: { title: `Reach out to ${name}`, task_type: "Research prospect", account_id: a.id },
      };
    } else if (stage === "quoting") {
      action = {
        kind: "task",
        label: "FOLLOW UP ON QUOTE",
        defaults: {
          title: `Follow up on quote with ${name}`,
          task_type: "Follow-up call",
          account_id: a.id,
          due_at: new Date(now.getTime() + 24 * 3_600_000).toISOString(),
        },
      };
    } else {
      // "contacted" — the only remaining staleness-eligible stage.
      action = {
        kind: "task",
        label: "FOLLOW UP",
        defaults: { title: `Follow up with ${name}`, task_type: "Follow-up call", account_id: a.id },
      };
    }

    return {
      id: `stale-${a.id}`,
      href: `/crm/accounts/${a.id}`,
      avatarLabel: name,
      companyName: name,
      reason,
      tag: "STALE",
      action,
    };
  });
  // Lost win-back — the task offering the actual outreach was already
  // lazily created above (ensureWinbackTask); this item is deliberately a
  // plain link to the company (which surfaces that already-created,
  // unassigned task), not another task-offer pill — that would create a
  // SECOND task on top of the one that already exists.
  const winbackItems: NbaItem[] = dueWinbackAccounts.map((a) => ({
    id: `winback-${a.id}`,
    href: `/crm/accounts/${a.id}`,
    avatarLabel: titleCaseWords(a.name),
    companyName: titleCaseWords(a.name),
    reason: `Lost · quiet ${daysQuiet(a)}d`,
    tag: "WIN-BACK",
    action: { kind: "link", label: "REACH BACK OUT", href: `/crm/accounts/${a.id}` },
  }));
  const researchItems: NbaItem[] = researchGapFull.map((c) => ({
    id: `research-${c.id}`,
    href: `/crm/accounts/${c.id}`,
    avatarLabel: c.name,
    companyName: c.name,
    reason: `${c.completenessPct}% profile complete`,
    tag: null,
    action: {
      kind: "task",
      label: "RESEARCH",
      defaults: {
        title: `Research ${c.name}`,
        task_type: "Research prospect",
        account_id: c.id,
      },
    },
  }));
  const noContactItems: NbaItem[] = noContactAccounts.map((a) => {
    const name = titleCaseWords(a.name);
    return {
      id: `no-contact-${a.id}`,
      href: `/crm/accounts/${a.id}`,
      avatarLabel: name,
      companyName: name,
      reason: "No contacts on file",
      tag: null,
      // Opens the same AddContactDialog the Companies list uses, pre-
      // attached to this company (see NbaAddContactAction.tsx) — the gap
      // this row flags is resolved directly, in one click, instead of the
      // old bare-navigation "RESEARCH" pill that just pointed at the profile
      // (CRM_TASK_INTEGRATION_AUDIT.md §7 classified that as tier D).
      action: { kind: "add-contact", label: "ADD CONTACT", accountId: a.id, accountName: name },
    };
  });

  // The non-task signal tiers, in rank order below the task block. Combined
  // cap unchanged at 40 rows of work — the task cards claim their slots first,
  // exactly as they did when everything shared one flat list.
  const nbaItems: NbaItem[] = [
    ...staleItems,
    ...winbackItems,
    ...researchItems,
    ...noContactItems,
  ].slice(0, Math.max(0, 40 - nbaTasks.length));

  // ── Counter tiles ──
  const tiles: CounterTileData[] = [
    { key: "due-today", label: "Due Today", value: dueTodayCount, href: "/crm/tasks#due-today", tone: "accent" },
    { key: "overdue", label: "Overdue", value: overdueCount, href: "/crm/tasks#overdue", tone: "danger" },
    { key: "stale", label: "Stale", value: staleAccountsFull.length, href: "/crm/accounts?sort=stale", tone: "warning" },
    { key: "to-research", label: "To Research", value: researchGapFull.length, href: "/crm/accounts", tone: "admin" },
    { key: "decision-makers", label: "Decision Makers", value: decisionMakerCount, href: "/crm/contacts?dm=1", tone: "success" },
    { key: "new-this-week", label: "New This Week", value: newThisWeekCount, href: "/crm/accounts", tone: "neutral" },
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
      {/* Page header — matches /crm-design's Dashboard PageHeader exactly:
          greeting as the H1, one summary subtitle line, primary action on
          the right. Was a Card-wrapped custom header block; that Card is
          gone — this is now a bare header the way every /crm-design page
          composes its top. DashboardSearch has no equivalent slot in the
          prototype (no ⌘K palette built yet) — kept here since it's real,
          working functionality with nowhere else to live. */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-[20px] font-bold tracking-tight text-fg">
            {greeting}, {displayName}
          </h1>
          <p className={`mt-0.5 text-[13px] font-medium ${summaryTone}`}>{summaryLine}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DashboardSearch companies={companyOptions} contacts={searchContacts} />
          <HeaderAddCompanyButton reps={reps} />
        </div>
      </div>

      {/* KPI tiles — crm-design's KpiTile pattern (Card + mono number colored
          by tone, no top accent rule). 6 real tiles, not the prototype's 4 —
          Stale/To Research/Decision Makers are real, distinct signals with
          no mock-data equivalent to trim to; the TILE ITSELF is the
          prototype's shape. */}
      <CounterTiles tiles={tiles} className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-6" />

      {/* Quick-actions strip — real, daily-use functionality with no
          prototype equivalent (no command-driven quick actions built there
          yet); kept as a compact strip rather than dropped. */}
      <QuickActionsStrip
        companies={companyOptions}
        reps={reps}
        taskAccounts={companyOptions}
        taskContacts={quickTaskContacts}
        canAssignOthers={canAssignOthers}
        currentUser={currentUser}
      />

      {/* Body — /crm-design's exact 2-column composition: Next Best Action
          (2/3 width, one unified ranked queue — was 5 separate cards, see
          the nbaItems comment above) + Recent Activity, mine (1/3 width,
          newly built from real crm_activities/crm_calls/crm_notes scoped to
          this viewer — the prototype's Recent Activity card had no real
          backend equivalent before this pass). */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <NextBestActionSection
            tasks={nbaTasks}
            items={nbaItems}
            mobileVisibleCount={4}
            contacts={quickTaskContacts}
            accounts={companyOptions}
            reps={reps}
            canAssignOthers={canAssignOthers}
            currentUser={currentUser}
            companies={companyOptions}
          />
        </div>

        <Card>
          <CardHead title="Recent activity" hint="Yours" />
          {recentActivity.length === 0 ? (
            <EmptyState
              icon={<IconNote />}
              title="Nothing logged yet"
              body="Your own calls, notes, and stage changes will show up here — jump back to what you just did."
            />
          ) : (
            <ul className="divide-y divide-line">
              {recentActivity.map((a) => (
                <li key={a.id}>
                  {a.href ? (
                    <Link href={a.href} prefetch={false} className="block px-4 py-2.5 transition-colors hover:bg-elevated">
                      <p className="truncate text-[13px] font-medium text-fg">{a.title}</p>
                      <p className="text-[11.5px] text-fg-muted">
                        {a.recordLabel ? `${a.recordLabel} · ` : ""}
                        {formatRelativeTime(a.occurredAt, now)}
                      </p>
                    </Link>
                  ) : (
                    <div className="px-4 py-2.5">
                      <p className="truncate text-[13px] font-medium text-fg">{a.title}</p>
                      <p className="text-[11.5px] text-fg-subtle">{formatRelativeTime(a.occurredAt, now)}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Quick links — /crm-design's 3-tile row (Companies/Calendar/Tasks). */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <QuickLink href="/crm/accounts" icon={<IconCompanies width={18} height={18} />} label="Companies" sub={`${nameById.size} total`} />
        <QuickLink href="/crm/calendar" icon={<IconCalendar width={18} height={18} />} label="Calendar" sub="This week's follow-ups" />
        <QuickLink href="/crm/tasks" icon={<IconTasks width={18} height={18} />} label="Tasks" sub={`${openTaskRows.length} open`} />
      </div>
    </PageShell>
  );
}

function QuickLink({ href, icon, label, sub }: { href: string; icon: React.ReactNode; label: string; sub: string }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="group flex items-center gap-3 rounded-lg border border-line-strong bg-card p-4 shadow-e1 transition-all hover:-translate-y-0.5 hover:shadow-e2"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">{icon}</span>
      <span>
        <span className="block text-[13.5px] font-bold text-fg">{label}</span>
        <span className="block text-[11.5px] text-fg-muted">{sub}</span>
      </span>
    </Link>
  );
}
