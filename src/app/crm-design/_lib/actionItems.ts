import type { ActivityItem, Company, LifecycleStage, Prospect, TaskItem, TeamMember } from "./types";

/**
 * Dashboard "Your next best actions" — auto-priority engine. Nothing here is
 * manually tagged; every item on the list is derived from a real signal
 * (a task's due date, a gap in logged activity, an un-worked release) and
 * ranked by that signal. The task's own `priority` field still renders as a
 * visual "High" cue (see page.tsx), but it never affects ordering — Brent's
 * explicit call.
 */

/** Days of silence (no call/note/email/stage-change) before an engaged
 * account gets flagged as going stale. One constant, one place to tune. */
export const STALE_DAYS = 21;

/** Stages worth watching for staleness — an account Sales is actively
 * working. Not new_lead (never contacted yet — that's a different problem,
 * not "gone quiet") and not won/lost (already past the pipeline). */
const STALE_ELIGIBLE_STAGES: LifecycleStage[] = ["contacted", "qualified", "quoted", "negotiating", "active_customer"];

/** What counts as "contact" for staleness purposes — logging a document or
 * completing a task doesn't reset the clock, talking to the account does. */
const ENGAGEMENT_KINDS: ActivityItem["kind"][] = ["call", "note", "email", "stage_change"];

export type ActionItemKind = "overdue" | "due_today" | "stale" | "new_prospect" | "due_soon";

export type ActionItemReasonTone = "danger" | "accent" | "warning" | "neutral";

export type ActionItem = {
  id: string;
  kind: ActionItemKind;
  title: string;
  companyId: string | null;
  companyName: string | null;
  reason: string;
  reasonTone: ActionItemReasonTone;
  href: string | null;
  /** Present only for task-backed kinds (overdue/due_today/due_soon) — the
   * synthesized kinds (stale/new_prospect) aren't tasks and have no
   * checkbox, they link straight to the record instead. */
  taskId?: string;
  priority?: TaskItem["priority"];
  /** Internal — smaller sorts first within a kind. Ranking is fully
   * computed, never manual. */
  sortValue: number;
};

const KIND_RANK: Record<ActionItemKind, number> = {
  overdue: 1,
  due_today: 2,
  stale: 3,
  new_prospect: 4,
  due_soon: 5,
};

function dateOnly(iso: string): Date {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}
function weekdayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short" });
}

export function computeActionItems(input: {
  tasks: TaskItem[];
  companies: Company[];
  activities: ActivityItem[];
  prospects: Prospect[];
  currentUser: TeamMember;
}): ActionItem[] {
  const { tasks, companies, activities, prospects, currentUser } = input;
  const today = dateOnly(new Date().toISOString());

  // Task visibility: owner/admin see every open task, an agent sees only
  // tasks assigned to them — same rule the dashboard used before this
  // feature existed, untouched.
  const isElevated = currentUser.role === "owner" || currentUser.role === "admin";
  const taskVisible = (t: TaskItem) => isElevated || t.assignedUserId === currentUser.id;

  // Company visibility (for the synthesized stale/new_prospect items): same
  // rule as the Companies list — a limited agent only sees their own book.
  const companyRestricted = !isElevated && !currentUser.canViewAllCompanies;
  const companyVisible = (companyId: string | null) => {
    if (!companyId) return false;
    if (!companyRestricted) return true;
    return companies.find((c) => c.id === companyId)?.assignedUserId === currentUser.id;
  };

  const companiesWithOpenTask = new Set(
    tasks.filter((t) => t.status === "open" && t.companyId).map((t) => t.companyId as string),
  );

  const items: ActionItem[] = [];

  // 1/2/5 — OVERDUE, DUE TODAY, DUE SOON: derived straight from open tasks'
  // dueAt, compared to today (date-only, so "due today" means the calendar
  // day, not the next 24 hours).
  for (const t of tasks) {
    if (t.status !== "open" || !t.dueAt || !taskVisible(t)) continue;
    const diff = daysBetween(dateOnly(t.dueAt), today); // negative = past
    const company = t.companyId ? companies.find((c) => c.id === t.companyId) ?? null : null;
    const base = {
      id: `task-${t.id}`,
      title: t.title,
      companyId: t.companyId,
      companyName: company?.name ?? null,
      href: company ? `/crm-design/companies/${company.id}` : null,
      taskId: t.id,
      priority: t.priority,
    };
    if (diff < 0) {
      const late = -diff;
      items.push({ ...base, kind: "overdue", reason: `${late} day${late === 1 ? "" : "s"} late`, reasonTone: "danger", sortValue: diff });
    } else if (diff === 0) {
      items.push({ ...base, kind: "due_today", reason: "due today", reasonTone: "accent", sortValue: new Date(t.dueAt).getTime() });
    } else if (diff <= 7) {
      items.push({ ...base, kind: "due_soon", reason: `due ${weekdayLabel(t.dueAt)}`, reasonTone: "neutral", sortValue: diff });
    }
  }

  // 3 — GOING STALE: an engaged account gone quiet for STALE_DAYS+ with
  // nothing already tracking it (an open task means it's already being
  // worked — don't pile a duplicate reminder on top).
  for (const c of companies) {
    if (!STALE_ELIGIBLE_STAGES.includes(c.stage)) continue;
    if (!companyVisible(c.id)) continue;
    if (companiesWithOpenTask.has(c.id)) continue;
    const lastEngagement = activities
      .filter((a) => a.companyId === c.id && ENGAGEMENT_KINDS.includes(a.kind))
      .reduce<string | null>((latest, a) => (!latest || a.occurredAt > latest ? a.occurredAt : latest), null);
    const referenceDate = lastEngagement ?? c.createdAt;
    const daysSince = daysBetween(today, dateOnly(referenceDate));
    if (daysSince < STALE_DAYS) continue;
    items.push({
      id: `stale-${c.id}`,
      kind: "stale",
      title: `Reach out — ${c.name}`,
      companyId: c.id,
      companyName: c.name,
      reason: `no contact in ${daysSince} days`,
      reasonTone: "warning",
      href: `/crm-design/companies/${c.id}`,
      sortValue: -daysSince,
    });
  }

  // 4 — NEW PROSPECT, NO ACTION YET: released to Sales, nothing logged
  // against it since. One item per company even if it has multiple
  // releases (e.g. two BOLs) — the earliest release date drives the sort.
  const seenProspectCompanies = new Set<string>();
  for (const p of [...prospects].sort((a, b) => a.releasedAt.localeCompare(b.releasedAt))) {
    if (seenProspectCompanies.has(p.companyId)) continue;
    if (!companyVisible(p.companyId)) continue;
    if (companiesWithOpenTask.has(p.companyId)) continue;
    if (activities.some((a) => a.companyId === p.companyId)) continue;
    const company = companies.find((c) => c.id === p.companyId);
    if (!company) continue;
    seenProspectCompanies.add(p.companyId);
    items.push({
      id: `prospect-${company.id}`,
      kind: "new_prospect",
      title: `Make first contact — ${company.name}`,
      companyId: company.id,
      companyName: company.name,
      reason: "new prospect — no contact yet",
      reasonTone: "accent",
      href: `/crm-design/companies/${company.id}`,
      sortValue: new Date(p.releasedAt).getTime(),
    });
  }

  return items.sort((a, b) => {
    const rankDiff = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    return rankDiff !== 0 ? rankDiff : a.sortValue - b.sortValue;
  });
}
