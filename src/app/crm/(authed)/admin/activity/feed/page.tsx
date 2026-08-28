import { serverNow } from "@/lib/crm/serverNow";
import { requireCrmAdmin } from "../../guard";
import { ActivityDashboard } from "../../../_activity/ActivityDashboard";
import { listAgents, loadActivity, type ActivityRange } from "../../../_activity/activity-data";
import { ACTIVITY_CATEGORIES, type ActivityCategory } from "../../../_activity/activityTypes";

export const dynamic = "force-dynamic";

/**
 * ADMIN → ACTIVITY → the detailed feed. OWNER ONLY.
 *
 * This lived at /crm/activity, in the agent workspace nav, from 2026-08-28
 * 01:00 until 20:15 Central. That was wrong and it was my mistake: the page
 * shows EVERY agent's numbers side by side, defaults to "All agents", and
 * carries a per-agent switcher. Tyler — the org's one non-owner — opened it
 * seven times before it was caught. Nothing about that was his doing; the
 * tab was in his nav because I put it there.
 *
 * It is management reporting. It belongs beside Companies, Contacts and
 * Tasks under Admin Account, and it is gated three ways now:
 *
 *   1. buildCrmNav() only ever renders the link for role === "owner"
 *   2. ../../layout.tsx awaits requireCrmAdmin() before any child renders
 *   3. requireCrmAdmin() again HERE, and once more inside loadActivity /
 *      listAgents in _activity/activity-data.ts
 *
 * Three and four are the ones that matter. A hidden nav item is not a
 * permission, and a guarded page with an unguarded loader is not a
 * permission either — the loader is what actually reads the rows.
 *
 * The components live under _activity/ rather than activity/. The leading
 * underscore is a Next.js private folder: it can never become a route
 * again, whatever anybody drops into it later.
 */

const RANGES = new Set<ActivityRange>(["today", "yesterday", "week", "last_week", "month", "custom"]);

function one(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export default async function AdminActivityFeedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireCrmAdmin();

  const sp = await searchParams;

  const rawRange = one(sp.range);
  const range: ActivityRange = RANGES.has(rawRange as ActivityRange)
    ? (rawRange as ActivityRange)
    : "week";

  const rawType = one(sp.type);
  // An unknown type in the URL is ignored rather than showing nothing —
  // a bad link should degrade to "everything", not to a blank page.
  const category: ActivityCategory | null = ACTIVITY_CATEGORIES.includes(rawType as ActivityCategory)
    ? (rawType as ActivityCategory)
    : null;

  const pageRaw = Number.parseInt(one(sp.page) ?? "0", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 0;

  const query = {
    agentId: one(sp.agent),
    category,
    range,
    from: one(sp.from),
    to: one(sp.to),
    page,
  };

  const [{ items, metrics, hasMore, rangeLabel, failed }, agents] = await Promise.all([
    loadActivity(query),
    listAgents(),
  ]);

  return (
    <div className="p-3 sm:p-4">
      <ActivityDashboard
        items={items}
        metrics={metrics}
        agents={agents}
        hasMore={hasMore}
        rangeLabel={rangeLabel}
        failed={failed}
        nowMs={serverNow()}
        agentId={query.agentId}
        category={category}
        range={range}
        from={query.from}
        to={query.to}
        page={page}
      />
    </div>
  );
}
