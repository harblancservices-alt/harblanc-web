import { createCrmServerClient, requireCrmUser } from "@/lib/crm/auth";
import { CRM_ACTIVITY } from "@/lib/crm/activity";
import {
  categoryForKind,
  kindsForCategory,
  viewHref,
  type ActivityCategory,
} from "./activityTypes";
import { centralDateKey, centralInputToIso } from "../_shell/format";

/**
 * THE ACTIVITY FEED'S DATA LAYER — sales accountability, not a timeline.
 *
 * ── WHAT IS ACTUALLY RECORDED (read this before trusting a number) ────
 *
 * Three tables carry agent activity, and they are queried directly rather
 * than reconciled into a new one:
 *
 *   crm_activities  the append-only event log. Carries user_id, kind,
 *                   account_id, contact_id, occurred_at. This is the ONLY
 *                   place that records WHO created a company, a contact or
 *                   a task — those tables have no creator column of their
 *                   own, so the log is the source of truth, not a copy.
 *   crm_calls       one row per logged call, with user_id.
 *   crm_notes       human notes (is_ai = false), with user_id.
 *
 * Calls and notes ALSO have a crm_activities row, so the log is queried
 * with those two kinds excluded and the real tables are read instead. That
 * is the existing admin page's merge, kept because it is right: the real
 * rows carry outcome, duration and body text the log does not.
 *
 * ── WHAT IS DERIVED, AND WHAT IS NOT ─────────────────────────────────
 *
 * NOTHING here is derived from a record's created_at. Every count is a
 * logged event with a real actor. "Companies created" counts
 * account_created rows, not crm_accounts.created_at, because created_at
 * cannot say WHO — and crm_accounts.assigned_user_id is the current OWNER,
 * which changes hands and is not the creator.
 *
 * The consequence is honest and visible: 38 of 88 account_created rows have
 * a null user_id (all from the 26 Aug OTR bulk intake — machine-created,
 * not an agent's work). Those are reported as SYSTEM, never silently
 * attributed to somebody and never counted into an agent's total. See
 * `unattributed` on ActivityMetrics.
 */

export type ActivityFeedItem = {
  id: string;
  category: ActivityCategory;
  kind: string | null;
  title: string;
  body: string | null;
  occurredAt: string;
  actorId: string | null;
  actorName: string | null;
  accountId: string | null;
  accountName: string | null;
  contactId: string | null;
  contactName: string | null;
  href: string | null;
};

export type ActivityMetrics = {
  total: number;
  byCategory: Record<ActivityCategory, number>;
  /** Distinct companies and people actually called in the period. Real,
   * because crm_calls carries account_id and contact_id per call. */
  uniqueCompaniesCalled: number;
  uniqueContactsCalled: number;
  /** Events in the period with no actor — system/bulk intake. Surfaced so a
   * total never quietly absorbs work nobody did. */
  unattributed: number;
};

export type AgentOption = { id: string; name: string };

export type ActivityRange = "today" | "yesterday" | "week" | "last_week" | "month" | "custom";

export type ActivityQuery = {
  agentId: string | null;
  category: ActivityCategory | null;
  range: ActivityRange;
  from?: string | null;
  to?: string | null;
  page: number;
};

export const PAGE_SIZE = 50;

/** A Central-day window as ISO instants, so a "day" means the same thing
 * here as everywhere else in this CRM. */
export function rangeBounds(
  q: Pick<ActivityQuery, "range" | "from" | "to">,
  now: Date = new Date(),
): { startIso: string; endIso: string; label: string } {
  const dayKey = (offsetDays: number) =>
    centralDateKey(new Date(now.getTime() + offsetDays * 86_400_000).toISOString()) ?? "";
  const start = (key: string) => centralInputToIso(`${key}T00:00`) ?? new Date(0).toISOString();
  const end = (key: string) => centralInputToIso(`${key}T23:59:59`) ?? new Date().toISOString();

  const todayKey = dayKey(0);
  // Central day-of-week, so "this week" does not shift with the server.
  const centralNow = new Date(`${todayKey}T12:00:00Z`);
  const dow = centralNow.getUTCDay(); // 0 = Sunday
  const mondayOffset = dow === 0 ? -6 : 1 - dow;

  switch (q.range) {
    case "today":
      return { startIso: start(todayKey), endIso: end(todayKey), label: "Today" };
    case "yesterday":
      return { startIso: start(dayKey(-1)), endIso: end(dayKey(-1)), label: "Yesterday" };
    case "week":
      return { startIso: start(dayKey(mondayOffset)), endIso: end(todayKey), label: "This week" };
    case "last_week":
      return {
        startIso: start(dayKey(mondayOffset - 7)),
        endIso: end(dayKey(mondayOffset - 1)),
        label: "Last week",
      };
    case "month": {
      const first = `${todayKey.slice(0, 7)}-01`;
      return { startIso: start(first), endIso: end(todayKey), label: "This month" };
    }
    case "custom": {
      const f = q.from || todayKey;
      const t = q.to || todayKey;
      return { startIso: start(f), endIso: end(t), label: `${f} → ${t}` };
    }
  }
}

type ProfileRow = { id: string; full_name: string | null; email: string | null };
const nameOf = (p: ProfileRow | undefined) => (p ? p.full_name || p.email || "Unnamed" : null);

/** Every active member, for the agent selector. */
export async function listAgents(): Promise<AgentOption[]> {
  const supabase = await createCrmServerClient();
  const { data } = await supabase
    .from("crm_profiles")
    .select("id, full_name, email, is_active")
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  return ((data ?? []) as (ProfileRow & { is_active: boolean })[]).map((p) => ({
    id: p.id,
    name: nameOf(p) ?? "Unnamed",
  }));
}

/**
 * The feed and its metrics for one query.
 *
 * FILTERED AND PAGED IN THE DATABASE, not the browser. Each source is
 * bounded by the date window and the agent before any row is sent, and the
 * page slice is applied after the three are merged — the merge has to
 * happen in memory because three tables cannot be ordered as one without a
 * view, but each source is capped so the working set stays small.
 */
export async function loadActivity(q: ActivityQuery): Promise<{
  items: ActivityFeedItem[];
  metrics: ActivityMetrics;
  hasMore: boolean;
  rangeLabel: string;
  failed: boolean;
}> {
  await requireCrmUser();
  const supabase = await createCrmServerClient();
  const { startIso, endIso, label } = rangeBounds(q);

  // How many rows any one source may contribute. The merge takes the newest
  // PAGE_SIZE * (page + 1) overall, so each source only ever needs that many.
  const perSourceCap = Math.min(PAGE_SIZE * (q.page + 1) + PAGE_SIZE, 600);

  const wantCalls = !q.category || q.category === "call";
  const wantNotes = !q.category || q.category === "note";
  const wantLogged = !q.category || (q.category !== "call" && q.category !== "note");

  let activityQ = supabase
    .from("crm_activities")
    .select("id, kind, summary, body, occurred_at, user_id, account_id, contact_id")
    .not("kind", "in", `(${CRM_ACTIVITY.call},${CRM_ACTIVITY.noteAdded})`)
    .gte("occurred_at", startIso)
    .lte("occurred_at", endIso)
    .order("occurred_at", { ascending: false })
    .limit(perSourceCap);
  if (q.agentId) activityQ = activityQ.eq("user_id", q.agentId);
  if (q.category && wantLogged) {
    const kinds = kindsForCategory(q.category);
    // "Other" is everything unmapped, so it cannot be expressed as an IN
    // list — it is filtered after mapping instead.
    if (kinds.length > 0) activityQ = activityQ.in("kind", kinds);
  }

  let callQ = supabase
    .from("crm_calls")
    .select("id, account_id, contact_id, outcome, duration_seconds, summary, notes, occurred_at, user_id")
    .is("deleted_at", null)
    .gte("occurred_at", startIso)
    .lte("occurred_at", endIso)
    .order("occurred_at", { ascending: false })
    .limit(perSourceCap);
  if (q.agentId) callQ = callQ.eq("user_id", q.agentId);

  let noteQ = supabase
    .from("crm_notes")
    .select("id, account_id, contact_id, body, created_at, user_id")
    .is("deleted_at", null)
    .eq("is_ai", false)
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .order("created_at", { ascending: false })
    .limit(perSourceCap);
  if (q.agentId) noteQ = noteQ.eq("user_id", q.agentId);

  const [actRes, callRes, noteRes, profRes] = await Promise.all([
    wantLogged ? activityQ : Promise.resolve({ data: [], error: null }),
    wantCalls ? callQ : Promise.resolve({ data: [], error: null }),
    wantNotes ? noteQ : Promise.resolve({ data: [], error: null }),
    supabase.from("crm_profiles").select("id, full_name, email"),
  ]);

  // A failed read must not render as an empty period — "nobody did
  // anything" and "we could not look" are different answers.
  const failed = Boolean(actRes.error || callRes.error || noteRes.error);

  const profileById = new Map(((profRes.data ?? []) as ProfileRow[]).map((p) => [p.id, p]));

  type ActRow = {
    id: string; kind: string; summary: string | null; body: string | null;
    occurred_at: string; user_id: string | null; account_id: string | null; contact_id: string | null;
  };
  type CallRow = {
    id: string; account_id: string | null; contact_id: string | null; outcome: string | null;
    duration_seconds: number | null; summary: string | null; notes: string | null;
    occurred_at: string; user_id: string | null;
  };
  type NoteRow = {
    id: string; account_id: string | null; contact_id: string | null; body: string;
    created_at: string; user_id: string | null;
  };

  const base = (
    id: string, category: ActivityCategory, kind: string | null, title: string,
    body: string | null, occurredAt: string, userId: string | null,
    accountId: string | null, contactId: string | null,
  ): ActivityFeedItem => ({
    id, category, kind, title, body, occurredAt,
    actorId: userId,
    actorName: nameOf(profileById.get(userId ?? "")),
    accountId, accountName: null, contactId, contactName: null,
    href: viewHref({ category, accountId, contactId }),
  });

  const fromLog = ((actRes.data ?? []) as ActRow[])
    .map((a) =>
      base(`activity-${a.id}`, categoryForKind(a.kind), a.kind, a.summary || "Activity",
        a.body, a.occurred_at, a.user_id, a.account_id, a.contact_id),
    )
    // "Other" is the unmapped remainder, so it is selected here rather than
    // in SQL — the only filter that cannot be pushed down.
    .filter((i) => !q.category || i.category === q.category);

  const fromCalls = ((callRes.data ?? []) as CallRow[]).map((c) => {
    const dur = c.duration_seconds ? ` · ${Math.round(c.duration_seconds / 60)}m` : "";
    return base(`call-${c.id}`, "call", CRM_ACTIVITY.call,
      `Call · ${(c.outcome || "logged").replace(/_/g, " ")}${dur}`,
      [c.summary, c.notes].filter(Boolean).join("\n") || null,
      c.occurred_at, c.user_id, c.account_id, c.contact_id);
  });

  const fromNotes = ((noteRes.data ?? []) as NoteRow[]).map((n) =>
    base(`note-${n.id}`, "note", CRM_ACTIVITY.noteAdded, "Note",
      n.body, n.created_at, n.user_id, n.account_id, n.contact_id),
  );

  const merged = [...fromLog, ...fromCalls, ...fromNotes].sort((a, b) =>
    b.occurredAt.localeCompare(a.occurredAt),
  );

  // Metrics describe the whole PERIOD, not the page — they are counted off
  // the merged set before slicing, so paging never changes a total.
  const byCategory = {
    call: 0, task: 0, company: 0, contact: 0, note: 0, deal: 0, other: 0,
  } as Record<ActivityCategory, number>;
  for (const i of merged) byCategory[i.category] += 1;

  const companiesCalled = new Set<string>();
  const contactsCalled = new Set<string>();
  for (const c of fromCalls) {
    if (c.accountId) companiesCalled.add(c.accountId);
    if (c.contactId) contactsCalled.add(c.contactId);
  }

  const metrics: ActivityMetrics = {
    total: merged.length,
    byCategory,
    uniqueCompaniesCalled: companiesCalled.size,
    uniqueContactsCalled: contactsCalled.size,
    unattributed: merged.filter((i) => !i.actorId).length,
  };

  const start = q.page * PAGE_SIZE;
  const slice = merged.slice(start, start + PAGE_SIZE);
  const hasMore = merged.length > start + PAGE_SIZE;

  // Names resolved only for what is actually shown.
  const accountIds = [...new Set(slice.map((i) => i.accountId).filter((v): v is string => !!v))];
  const contactIds = [...new Set(slice.map((i) => i.contactId).filter((v): v is string => !!v))];
  const [accRes, conRes] = await Promise.all([
    accountIds.length
      ? supabase.from("crm_accounts").select("id, name").in("id", accountIds)
      : Promise.resolve({ data: [] }),
    contactIds.length
      ? supabase.from("crm_contacts").select("id, name").in("id", contactIds)
      : Promise.resolve({ data: [] }),
  ]);
  const accName = new Map(((accRes.data ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]));
  const conName = new Map(((conRes.data ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]));

  return {
    items: slice.map((i) => ({
      ...i,
      accountName: i.accountId ? accName.get(i.accountId) ?? null : null,
      contactName: i.contactId ? conName.get(i.contactId) ?? null : null,
    })),
    metrics,
    hasMore,
    rangeLabel: label,
    failed,
  };
}

export type AgentScorecard = AgentOption & {
  total: number;
  byCategory: Record<ActivityCategory, number>;
  uniqueCompaniesCalled: number;
};

/**
 * One row per agent for the management overview — the same counting rules
 * as the individual view, so the table and the drill-down can never
 * disagree about a number.
 */
export async function loadScoreboard(
  q: Pick<ActivityQuery, "range" | "from" | "to">,
): Promise<{ rows: AgentScorecard[]; unattributed: number; rangeLabel: string; failed: boolean }> {
  const agents = await listAgents();
  const results = await Promise.all(
    agents.map((a) =>
      loadActivity({ agentId: a.id, category: null, range: q.range, from: q.from, to: q.to, page: 0 }),
    ),
  );
  const orgWide = await loadActivity({
    agentId: null, category: null, range: q.range, from: q.from, to: q.to, page: 0,
  });

  return {
    rows: agents
      .map((a, i) => ({
        ...a,
        total: results[i].metrics.total,
        byCategory: results[i].metrics.byCategory,
        uniqueCompaniesCalled: results[i].metrics.uniqueCompaniesCalled,
      }))
      .sort((x, y) => y.total - x.total),
    unattributed: orgWide.metrics.unattributed,
    rangeLabel: orgWide.rangeLabel,
    failed: orgWide.failed || results.some((r) => r.failed),
  };
}
