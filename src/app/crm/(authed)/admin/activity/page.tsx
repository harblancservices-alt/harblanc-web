import Link from "next/link";
import { Card, CardHead } from "../../_shell/ui";
import { loadScoreboard, type ActivityRange } from "../../_activity/activity-data";
import { ACTIVITY_CATEGORIES, ACTIVITY_STYLE } from "../../_activity/activityTypes";

export const dynamic = "force-dynamic";

/**
 * ADMIN → ACTIVITY, rebuilt as a SCOREBOARD.
 *
 * It used to be the same flat org-wide feed the new Workspace → Activity
 * page now does better: 500 rows of everything, no metrics, no agent
 * comparison, filtered in the browser. A second feed is not what management
 * needs — the question here is "who is working and who isn't", which a feed
 * can only answer by being read end to end.
 *
 * So this is one row per agent with their real counts, and every row opens
 * that agent's detailed view. The counts come from the SAME loadActivity()
 * the detail page uses, so the table and the drill-down can never disagree.
 *
 * The feed itself is not lost — it is one click away, and the old
 * AdminActivityList component is gone rather than left as a duplicate
 * system.
 */

const RANGES: { key: ActivityRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
  { key: "last_week", label: "Last week" },
  { key: "month", label: "This month" },
];

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.range) ? sp.range[0] : sp.range;
  const range: ActivityRange = RANGES.some((r) => r.key === raw)
    ? (raw as ActivityRange)
    : "week";

  const { rows, unattributed, rangeLabel, failed } = await loadScoreboard({ range });
  const columns = ACTIVITY_CATEGORIES.filter((c) => c !== "other");

  return (
    <div className="p-3 sm:p-4">
      <Card>
        <CardHead
          title="Sales activity"
          hint={`${rangeLabel} · every agent, counted the same way`}
          right={
            <Link
              href="/crm/admin/activity/feed"
              prefetch={false}
              className="text-[12px] font-semibold text-accent hover:underline"
            >
              Open the full feed
            </Link>
          }
        />

        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={`/crm/admin/activity?range=${r.key}`}
              prefetch={false}
              className={`inline-flex min-h-8 items-center rounded-md px-2.5 text-[12px] font-semibold transition-colors ${
                range === r.key ? "bg-accent text-white" : "bg-card text-fg-muted hover:bg-inset"
              }`}
            >
              {r.label}
            </Link>
          ))}
        </div>

        {failed ? (
          <div className="px-4 py-10 text-center">
            <p className="text-[13px] font-bold text-bad">Activity could not be loaded</p>
            <p className="mx-auto mt-1 max-w-[42ch] text-[12px] text-fg-subtle">
              The query failed. These are not zeroes — they are unknowns, so nothing is shown rather
              than a table of noughts somebody might act on.
            </p>
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-fg-subtle">
            No active members to report on.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-[10.5px] font-bold uppercase tracking-[0.06em] text-fg-subtle">
                  <th className="px-3 py-2 text-left">Salesperson</th>
                  <th className="px-3 py-2 text-right">Activities</th>
                  {columns.map((c) => (
                    <th key={c} className="px-3 py-2 text-right">
                      {ACTIVITY_STYLE[c].label}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right">Companies called</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-b-0 hover:bg-inset">
                    <td className="px-3 py-2 font-bold text-fg">{r.name}</td>
                    <td className="crm-num px-3 py-2 text-right text-[15px] font-extrabold text-fg">
                      {r.total}
                    </td>
                    {columns.map((c) => (
                      <td
                        key={c}
                        className={`crm-num px-3 py-2 text-right font-semibold ${
                          r.byCategory[c] === 0 ? "text-fg-subtle" : "text-fg"
                        }`}
                      >
                        {r.byCategory[c]}
                      </td>
                    ))}
                    <td className="crm-num px-3 py-2 text-right font-semibold text-fg-muted">
                      {r.uniqueCompaniesCalled ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/crm/admin/activity/feed?agent=${r.id}&range=${range}`}
                        prefetch={false}
                        className="inline-flex min-h-9 items-center rounded-md border border-line-strong bg-card px-3 text-[12px] font-bold text-accent transition-colors hover:bg-accent-bg"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* The number that stops this table being read as the whole truth. */}
        {unattributed > 0 && (
          <p className="border-t border-line bg-warn-bg px-3 py-2 text-[12px] text-warn">
            <span className="font-bold">{unattributed}</span> events in this period have no agent
            recorded — bulk intake and system imports. They belong to nobody in this table and are
            deliberately not distributed across it.
          </p>
        )}
      </Card>
    </div>
  );
}
