import Link from "next/link";
import { Card } from "../_shell/ui";
import { titleCaseWords } from "../_shell/format";
import {
  lateLabel,
  longestOverdue,
  reportByAssignee,
  summarizeDue,
  UNASSIGNED_KEY,
  type DueTaskRow,
} from "./dueReport";
import type { TeamMember } from "./assign-data";

/**
 * Admin -> Overview, top half: WHERE THE WORK STANDS.
 *
 * Rebuilt around due dates (Brent, 2026-08-25). Overdue on this page means
 * exactly one thing — an open task past its due date — and it means the same
 * thing on the agent's own dashboard, because both read
 * lib/crm/taskUrgency.ts rather than each deciding for themselves.
 *
 * A plain server component: no state, no interaction beyond links. The
 * page's interactive half is the assignment board underneath it, which is
 * untouched.
 */
export function DueReportPanel({
  tasks,
  team,
  now,
}: {
  tasks: DueTaskRow[];
  team: TeamMember[];
  /** Server clock — one instant for every label on the page. */
  now: number;
}) {
  const at = new Date(now);
  const totals = summarizeDue(tasks, at);
  const rows = reportByAssignee(
    tasks,
    team.map((t) => ({ id: t.id, name: t.name })),
    at,
  );
  const worst = longestOverdue(tasks, at);

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-[15px] font-bold tracking-tight text-fg">Where the work stands</h2>
        <p className="text-[12.5px] text-fg-muted">
          {totals.total} open {totals.total === 1 ? "task" : "tasks"} · overdue means past its due
          date
        </p>
      </div>

      {totals.total === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-fg-muted">
          Nothing is open right now.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          {/* ── Per person ─────────────────────────────────────────── */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse">
              <thead>
                <tr className="border-b border-line text-[10.5px] font-bold uppercase tracking-[0.07em] text-fg-muted">
                  <th className="px-4 py-2 text-left">Person</th>
                  <th className="px-2 py-2 text-right">Overdue</th>
                  <th className="px-2 py-2 text-right">Today</th>
                  <th className="px-2 py-2 text-right">This week</th>
                  <th className="px-2 py-2 text-right">Later</th>
                  <th className="px-2 py-2 text-right">No date</th>
                  <th className="px-4 py-2 text-right">Open</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const unassigned = row.key === UNASSIGNED_KEY;
                  return (
                    <tr key={row.key} className="border-b border-line last:border-b-0">
                      <td className="px-4 py-2.5">
                        <span
                          className={`text-[13px] font-bold ${unassigned ? "text-warn" : "text-fg"}`}
                        >
                          {row.name}
                        </span>
                        {unassigned && (
                          <span className="ml-1.5 text-[11.5px] text-fg-subtle">
                            open tasks with no owner
                          </span>
                        )}
                      </td>
                      <Num value={row.counts.overdue} tone="bad" />
                      <Num value={row.counts.today} tone="accent" />
                      <Num value={row.counts.thisWeek} />
                      <Num value={row.counts.later} />
                      <Num value={row.counts.none} tone="warn" />
                      <td className="px-4 py-2.5 text-right text-[13px] font-bold text-fg">
                        {row.counts.total}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-line-strong bg-inset text-[12.5px] font-bold text-fg">
                  <td className="px-4 py-2">Everyone</td>
                  <td className="px-2 py-2 text-right">{totals.overdue}</td>
                  <td className="px-2 py-2 text-right">{totals.today}</td>
                  <td className="px-2 py-2 text-right">{totals.thisWeek}</td>
                  <td className="px-2 py-2 text-right">{totals.later}</td>
                  <td className="px-2 py-2 text-right">{totals.none}</td>
                  <td className="px-4 py-2 text-right">{totals.total}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── The actual overdue tasks ───────────────────────────── */}
          <div className="border-t border-line lg:border-l lg:border-t-0">
            <p className="border-b border-line bg-inset px-4 py-2 text-[10.5px] font-bold uppercase tracking-[0.07em] text-fg-muted">
              Furthest behind
            </p>
            {worst.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12.5px] text-fg-muted">
                Nothing is past its due date.
              </p>
            ) : (
              <ul>
                {worst.map((task) => (
                  <li
                    key={task.id}
                    className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-line px-4 py-2 last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-fg">
                      {task.title}
                    </span>
                    <span className="shrink-0 text-[12px] font-bold text-bad">
                      {lateLabel(task.dueAt, at)}
                    </span>
                    {task.accountId && task.companyName && (
                      <Link
                        href={`/crm/accounts/${task.accountId}`}
                        prefetch={false}
                        className="w-full truncate text-[11.5px] font-semibold text-accent hover:underline"
                      >
                        {titleCaseWords(task.companyName)}
                      </Link>
                    )}
                  </li>
                ))}
                <li className="px-4 py-2">
                  <Link
                    href="/crm/tasks"
                    prefetch={false}
                    className="text-[12.5px] font-bold text-accent hover:underline"
                  >
                    Open the full task list
                  </Link>
                </li>
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

/** A count cell. Zero always renders muted regardless of tone — a red 0 next
 * to "Overdue" reads as a problem when it is the opposite. */
function Num({ value, tone }: { value: number; tone?: "bad" | "accent" | "warn" }) {
  const color =
    value === 0
      ? "text-fg-subtle"
      : tone === "bad"
        ? "text-bad"
        : tone === "accent"
          ? "text-accent"
          : tone === "warn"
            ? "text-warn"
            : "text-fg";
  return <td className={`px-2 py-2.5 text-right text-[13px] font-bold ${color}`}>{value}</td>;
}
