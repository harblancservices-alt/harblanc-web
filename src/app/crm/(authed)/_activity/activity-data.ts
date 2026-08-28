import { createCrmServerClient, requireCrmUser } from "@/lib/crm/auth";
import { redirect } from "next/navigation";
import { CRM_ACTIVITY } from "@/lib/crm/activity";
import {
  ACTIVITY_CATEGORIES,
  allMappedKinds,
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
  /**
   * Distinct companies and people actually called in the period. Real,
   * because crm_calls carries account_id and contact_id per call.
   *
   * NULL when the period holds more calls than DISTINCT_SCAN_CAP. PostgREST
   * cannot express count(distinct ...), so these are deduped from a narrow
   * two-column scan; past the cap that scan is incomplete and the honest
   * answer is "not available", not a number that is quietly too low. Every
   * other metric on this page is an exact SQL count and is never null.
   */
  uniqueCompaniesCalled: number | null;
  uniqueContactsCalled: number | null;
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

/**
 * How many call rows the distinct scan will read before giving up.
 *
 * The unique-companies / unique-people figures are distinct counts, and
 * PostgREST cannot express count(distinct ...). They are deduped from a
 * two-column scan instead, which is cheap because calls are by far the
 * lowest-volume source — the whole org logs tens of them a week. If a period
 * ever exceeds this, the scan is incomplete and those two figures report as
 * unavailable rather than short.
 */
export const DISTINCT_SCAN_CAP = 2000;

/**
 * Rows in the period that nobody is credited with, counted across all three
 * sources in SQL rather than off a fetched page.
 *
 * This is the number that exposed the undercount: it read 2 for a week that
 * actually held 75, because the 73 bulk-intake rows were older than the
 * capped fetch reached back to.
 */
async function countUnattributed(
  supabase: Awaited<ReturnType<typeof createCrmServerClient>>,
  startIso: string,
  endIso: string,
  wantLogged: boolean,
  wantCalls: boolean,
  wantNotes: boolean,
): Promise<number> {
  const [act, call, note] = await Promise.all([
    wantLogged
      ? supabase
          .from("crm_activities")
          .select("id", { count: "exact", head: true })
          .not("kind", "in", `(${CRM_ACTIVITY.call},${CRM_ACTIVITY.noteAdded})`)
          .is("user_id", null)
          .gte("occurred_at", startIso)
          .lte("occurred_at", endIso)
      : Promise.resolve({ count: 0 }),
    wantCalls
      ? supabase
          .from("crm_calls")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .is("user_id", null)
          .gte("occurred_at", startIso)
          .lte("occurred_at", endIso)
      : Promise.resolve({ count: 0 }),
    wantNotes
      ? supabase
          .from("crm_notes")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .eq("is_ai", false)
          .is("user_id", null)
          .gte("created_at", startIso)
          .lte("created_at", endIso)
      : Promise.resolve({ count: 0 }),
  ]);
  return (act.count ?? 0) + (call.count ?? 0) + (note.count ?? 0);
}

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

/**
 * OWNER ONLY, ENFORCED WHERE THE ROWS ARE READ.
 *
 * Every function in this file returns cross-agent data — one person's feed
 * next to another's, and totals for the whole org. The pages above are
 * already behind requireCrmAdmin(), but a guarded page with an unguarded
 * loader is not a guarded loader: this is the code that actually touches
 * crm_activities, crm_calls and crm_notes, so the check belongs here too.
 *
 * It redirects rather than returning empty. A member who somehow reaches
 * this should be told they are in the wrong place, not handed a page of
 * zeroes that reads like "nobody did anything".
 */
async function requireActivityViewer() {
  const user = await requireCrmUser();
  if (user.role !== "owner") redirect("/crm");
  return user;
}

/** Every active member, for the agent selector. */
export async function listAgents(): Promise<AgentOption[]> {
  await requireActivityViewer();
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
  await requireActivityViewer();
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
  const fetchFailed = Boolean(actRes.error || callRes.error || noteRes.error);

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

  /*
   * METRICS DESCRIBE THE WHOLE PERIOD, and now actually do.
   *
   * They used to be counted off `merged` — the rows this call had fetched —
   * which is capped per source so the page can stay paginated. That made
   * every number the size of the FETCH rather than the size of the period.
   * On the week of 2026-08-24 the org logged 275 activity rows against a
   * 100-row cap, so the dashboard reported roughly a third of the real work
   * and the unattributed banner read 2 where the truth was 75. Brent found
   * it by asking why two numbers disagreed.
   *
   * So the counts are COUNT queries now — `head: true`, no rows returned,
   * one round trip each and they run in parallel with everything else. The
   * capped fetch above still exists and is still capped, because it feeds
   * the rendered feed, which stays paginated. Counting and showing are two
   * different jobs and this is the line between them.
   */
  const inWindow = <T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T }>(
    qb: T,
    dateCol: string,
  ): T => qb.gte(dateCol, startIso).lte(dateCol, endIso);

  /** A crm_activities count, always excluding the call/note duplicates the
   *  dedicated tables already own, and honouring the agent filter. */
  const countActivities = (build: (qb: ReturnType<typeof activityCountBase>) => ReturnType<typeof activityCountBase>) => {
    let qb = build(activityCountBase());
    if (q.agentId) qb = qb.eq("user_id", q.agentId);
    return qb;
  };
  function activityCountBase() {
    return inWindow(
      supabase
        .from("crm_activities")
        .select("id", { count: "exact", head: true })
        .not("kind", "in", `(${CRM_ACTIVITY.call},${CRM_ACTIVITY.noteAdded})`),
      "occurred_at",
    );
  }

  /* Derived, never hand-listed: a category typed out here and forgotten in
     ACTIVITY_CATEGORIES (or the reverse) is a set of rows counted nowhere.
     "call" and "note" come from their own tables; "other" is the complement
     and is counted separately. */
  const LOGGED_CATEGORIES = ACTIVITY_CATEGORIES.filter(
    (c) => c !== "call" && c !== "note" && c !== "other",
  );
  const mapped = allMappedKinds();

  let callCountQ = inWindow(
    supabase.from("crm_calls").select("id", { count: "exact", head: true }).is("deleted_at", null),
    "occurred_at",
  );
  if (q.agentId) callCountQ = callCountQ.eq("user_id", q.agentId);

  let noteCountQ = inWindow(
    supabase
      .from("crm_notes")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("is_ai", false),
    "created_at",
  );
  if (q.agentId) noteCountQ = noteCountQ.eq("user_id", q.agentId);

  /* The distinct figures. PostgREST has no count(distinct ...), so this is a
     narrow two-column scan over the period's calls, deduped here. Capped —
     and when the cap is reached the answer becomes null rather than a number
     that is silently short, which is the exact failure being fixed. */
  let distinctScanQ = inWindow(
    supabase.from("crm_calls").select("account_id, contact_id").is("deleted_at", null),
    "occurred_at",
  ).limit(DISTINCT_SCAN_CAP);
  if (q.agentId) distinctScanQ = distinctScanQ.eq("user_id", q.agentId);

  const [
    callCountRes,
    noteCountRes,
    otherCountRes,
    distinctRes,
    ...loggedCountRes
  ] = await Promise.all([
    wantCalls ? callCountQ : Promise.resolve({ count: 0, error: null }),
    wantNotes ? noteCountQ : Promise.resolve({ count: 0, error: null }),
    wantLogged && (!q.category || q.category === "other")
      ? countActivities((qb) => qb.not("kind", "in", `(${mapped.join(",")})`))
      : Promise.resolve({ count: 0, error: null }),
    wantCalls ? distinctScanQ : Promise.resolve({ data: [], error: null }),
    ...LOGGED_CATEGORIES.map((cat) =>
      wantLogged && (!q.category || q.category === cat)
        ? countActivities((qb) => qb.in("kind", kindsForCategory(cat)))
        : Promise.resolve({ count: 0, error: null }),
    ),
  ]);

  const byCategory = {
    call: callCountRes.count ?? 0,
    note: noteCountRes.count ?? 0,
    other: otherCountRes.count ?? 0,
    task: 0, company: 0, contact: 0, deal: 0,
  } as Record<ActivityCategory, number>;
  LOGGED_CATEGORIES.forEach((cat, i) => {
    byCategory[cat] = loggedCountRes[i]?.count ?? 0;
  });

  const distinctRows = (distinctRes.data ?? []) as { account_id: string | null; contact_id: string | null }[];
  const scanTruncated = distinctRows.length >= DISTINCT_SCAN_CAP;
  const companiesCalled = new Set<string>();
  const contactsCalled = new Set<string>();
  for (const r of distinctRows) {
    if (r.account_id) companiesCalled.add(r.account_id);
    if (r.contact_id) contactsCalled.add(r.contact_id);
  }

  /* UNATTRIBUTED, over the whole period too. Only meaningful org-wide: with
     an agent selected every row has that agent as its actor by definition,
     so the honest answer is zero rather than a number about somebody else. */
  const unattributed = q.agentId
    ? 0
    : await countUnattributed(supabase, startIso, endIso, wantLogged, wantCalls, wantNotes);

  const countsFailed =
    Boolean(callCountRes.error) ||
    Boolean(noteCountRes.error) ||
    Boolean(otherCountRes.error) ||
    Boolean(distinctRes.error) ||
    loggedCountRes.some((r) => Boolean(r.error));

  const metrics: ActivityMetrics = {
    total: Object.values(byCategory).reduce((a, b) => a + b, 0),
    byCategory,
    uniqueCompaniesCalled: scanTruncated ? null : companiesCalled.size,
    uniqueContactsCalled: scanTruncated ? null : contactsCalled.size,
    unattributed,
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
    failed: fetchFailed || countsFailed,
  };
}

export type AgentScorecard = AgentOption & {
  total: number;
  byCategory: Record<ActivityCategory, number>;
  /** Null past DISTINCT_SCAN_CAP — see ActivityMetrics. */
  uniqueCompaniesCalled: number | null;
};

/**
 * One row per agent for the management overview — the same counting rules
 * as the individual view, so the table and the drill-down can never
 * disagree about a number.
 */
export async function loadScoreboard(
  q: Pick<ActivityQuery, "range" | "from" | "to">,
): Promise<{ rows: AgentScorecard[]; unattributed: number; rangeLabel: string; failed: boolean }> {
  await requireActivityViewer();
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
