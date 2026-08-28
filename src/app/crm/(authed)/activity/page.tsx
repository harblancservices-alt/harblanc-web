import { serverNow } from "@/lib/crm/serverNow";
import { ActivityDashboard } from "./ActivityDashboard";
import { listAgents, loadActivity, type ActivityRange } from "./activity-data";
import { ACTIVITY_CATEGORIES, type ActivityCategory } from "./activityTypes";

export const dynamic = "force-dynamic";

/**
 * WORKSPACE → ACTIVITY. The sales-accountability view: who did what, to
 * whom, when, and one click to the record.
 *
 * Every filter is a search param, so the QUERY runs on the server with the
 * date window and the agent already applied. The browser never receives a
 * period it is not showing, which is what keeps this usable when the log is
 * large.
 */

const RANGES = new Set<ActivityRange>(["today", "yesterday", "week", "last_week", "month", "custom"]);

function one(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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
