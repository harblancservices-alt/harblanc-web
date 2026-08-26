"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, BTN_EDIT } from "../_shell/ui";
import { titleCaseWords, upperCaseState } from "../_shell/format";
import { completeTask } from "../tasks/actions";
import {
  activityStatus,
  companyFlag,
  dueLabel,
  dueTint,
  groupAgentWork,
  sortAgentCompanies,
  type AgentCompany,
  type AgentTask,
} from "./agentWork";

/**
 * The sales agent's home page (/crm for anyone who isn't the owner).
 *
 * TWO panels and nothing else. Left, the tasks assigned to them, grouped
 * Overdue / Today / This week with a Done button on every row. Right, the
 * companies they own, neglected-first, with a flag on the ones that have
 * gone quiet or were never contacted at all.
 *
 * THERE IS NO BROWSING AFFORDANCE ON THIS SCREEN (Brent, 2026-08-25). No
 * unclaimed pool, no org-wide queue, no "see what else is out there" — an
 * agent works what they are given and what they own. "See all N" goes to the
 * Companies list, which for a restricted agent is already filtered to their
 * own book (see _shell/companyVisibility.ts); it is a fuller view of the
 * same rows, not a door onto everyone else's.
 */

/** How many rows of each group show before the tail collapses. */
const GROUP_CAP = 3;

export function AgentDashboard({
  name,
  tasks,
  companies,
  now,
  addCompanyButton,
  viewSwitch = null,
  banner = null,
}: {
  /** Display name shown next to the brand mark. */
  name: string;
  tasks: AgentTask[];
  companies: AgentCompany[];
  /** Server clock — every label on this page is computed against this one
   * instant so the server and client renders can't disagree by a day. */
  now: number;
  /** The "+ Add" company dialog trigger, passed in from the server page
   * because it needs the rep roster. Null while an owner previews somebody
   * else — see AgentHome. */
  addCompanyButton: React.ReactNode;
  /** Owner-only view switcher, rendered in the header. Null for an agent,
   * whose /crm is this page and nothing else. */
  viewSwitch?: React.ReactNode;
  /** One line above the panels, e.g. the preview notice. */
  banner?: string | null;
}) {
  const at = new Date(now);
  const groups = groupAgentWork(tasks, at);
  const sortedCompanies = sortAgentCompanies(companies);

  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? Infinity : GROUP_CAP;
  // Every group is capped the same way, "Later" included. An earlier cut hid
  // the whole Later group behind the expander, which made a queue of nothing
  // but undated tasks render as an empty panel with a lone "+ 3 more" under
  // it — measured against real data, not hypothetical.
  const hidden = [groups.overdue, groups.today, groups.thisWeek, groups.later].reduce(
    (sum, rows) => sum + Math.max(0, rows.length - shown),
    0,
  );

  const COMPANY_CAP = 8;
  const visibleCompanies = sortedCompanies.slice(0, COMPANY_CAP);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-4 sm:px-6">
      {/* ── Header: who you are, then the only three numbers that matter ── */}
      <header className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line pb-3">
        <h1 className="text-[19px] font-bold tracking-tight text-fg">Hello Hotshot</h1>
        <p className="text-[14px] text-fg-muted">{name}</p>
        <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <Stat value={groups.overdue.length} label="Overdue" tone="bad" />
            <Stat value={groups.today.length} label="Due today" tone="accent" />
            <Stat value={companies.length} label="Companies" tone="fg" />
          </div>
          {viewSwitch}
        </div>
      </header>

      {banner && (
        <p className="mb-3 rounded-md border border-admin/30 bg-inset px-3 py-2 text-[12.5px] font-semibold text-fg-muted">
          {banner}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {/* ── Your work ─────────────────────────────────────────────── */}
        <Card>
          <div className="flex flex-wrap items-baseline gap-2 border-b border-line px-4 py-3">
            <h2 className="text-[15px] font-bold tracking-tight text-fg">Your work</h2>
            <p className="text-[12.5px] text-fg-muted">assigned to you — soonest first</p>
          </div>

          {tasks.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-[13.5px] font-semibold text-fg">Nothing assigned to you</p>
              <p className="mt-0.5 text-[12.5px] text-fg-muted">
                New work shows up here as soon as it&rsquo;s handed to you.
              </p>
            </div>
          ) : (
            <>
              <Group label="Overdue" tone="bad" rows={groups.overdue} cap={shown} now={at} />
              <Group label="Today" tone="accent" rows={groups.today} cap={shown} now={at} />
              <Group label="This week" tone="muted" rows={groups.thisWeek} cap={shown} now={at} />
              <Group label="Later" tone="muted" rows={groups.later} cap={shown} now={at} />
              {(hidden > 0 || expanded) && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="block px-4 py-3 text-[13px] font-bold text-accent hover:underline"
                >
                  {expanded ? "Show less" : `+ ${hidden} more`}
                </button>
              )}
            </>
          )}
        </Card>

        {/* ── Your companies ────────────────────────────────────────── */}
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
            <h2 className="text-[15px] font-bold tracking-tight text-fg">Your companies</h2>
            <span className="text-[12.5px] font-semibold text-fg-muted">{companies.length}</span>
            {addCompanyButton && <span className="ml-auto">{addCompanyButton}</span>}
          </div>

          {companies.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-[13.5px] font-semibold text-fg">No companies yet</p>
              <p className="mt-0.5 text-[12.5px] text-fg-muted">
                Add one, or wait for one to be assigned to you.
              </p>
            </div>
          ) : (
            <ul>
              {visibleCompanies.map((c) => {
                const status = activityStatus(c, at);
                const flag = companyFlag(c, at);
                const place = [titleCaseWords(c.city), upperCaseState(c.state)]
                  .filter(Boolean)
                  .join(", ");
                return (
                  <li key={c.id} className="border-b border-line last:border-b-0">
                    <Link
                      href={`/crm/accounts/${c.id}`}
                      prefetch={false}
                      className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-accent-bg"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-bold text-fg">
                          {titleCaseWords(c.name)}
                        </span>
                        {place && (
                          <span className="block truncate text-[11.5px] text-fg-subtle">{place}</span>
                        )}
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className={`text-[12.5px] font-bold ${
                            status.tone === "good"
                              ? "text-ok"
                              : status.tone === "warn"
                                ? "text-warn"
                                : status.tone === "bad"
                                  ? "text-bad"
                                  : "text-fg-muted"
                          }`}
                        >
                          {status.text}
                        </span>
                        {flag && (
                          <span
                            className={`rounded-[3px] border px-1.5 py-px text-[10.5px] font-semibold ${
                              flag === "quiet"
                                ? "border-warn/60 text-warn"
                                : "border-bad/50 text-bad"
                            }`}
                          >
                            {flag === "quiet" ? "quiet" : "never contacted"}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
              {companies.length > COMPANY_CAP && (
                <li className="px-4 py-3">
                  {/* Their own book, in full — the Companies list is already
                      scoped to a restricted agent's own rows. Not a pool. */}
                  <Link
                    href="/crm/accounts"
                    prefetch={false}
                    className="text-[13px] font-bold text-accent hover:underline"
                  >
                    See all {companies.length}
                  </Link>
                </li>
              )}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone: "bad" | "accent" | "fg" }) {
  const color = tone === "bad" ? "text-bad" : tone === "accent" ? "text-accent" : "text-fg";
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`text-[19px] font-bold leading-none ${value === 0 ? "text-fg-subtle" : color}`}>
        {value}
      </span>
      <span className="text-[12.5px] text-fg-muted">{label}</span>
    </span>
  );
}

function Group({
  label,
  tone,
  rows,
  cap,
  now,
}: {
  label: string;
  tone: "bad" | "accent" | "muted";
  rows: AgentTask[];
  cap: number;
  now: Date;
}) {
  if (rows.length === 0) return null;
  const visible = rows.slice(0, cap);
  const chip =
    tone === "bad"
      ? "bg-bad-bg text-bad"
      : tone === "accent"
        ? "bg-accent-bg text-accent"
        : "bg-inset text-fg-muted";
  return (
    <>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2">
        <span
          className={`rounded-[3px] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.07em] ${chip}`}
        >
          {label}
        </span>
        <span className="text-[11.5px] font-semibold text-fg-muted">{rows.length}</span>
      </div>
      <ul>
        {visible.map((task) => (
          <TaskRow key={task.id} task={task} now={now} />
        ))}
      </ul>
    </>
  );
}

function TaskRow({ task, now }: { task: AgentTask; now: Date }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const tint = dueTint(task.dueAt, now);

  function markDone() {
    setError(null);
    startTransition(async () => {
      const result = await completeTask(task.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-bold text-fg">{task.title}</p>
        <p className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-fg-subtle">
          {task.accountId && task.companyName ? (
            <Link
              href={`/crm/accounts/${task.accountId}`}
              prefetch={false}
              className="font-semibold text-accent hover:underline"
            >
              {titleCaseWords(task.companyName)}
            </Link>
          ) : (
            <span>No company</span>
          )}
          {task.hint && <span>&middot; {task.hint}</span>}
        </p>
        {error && <p className="text-[11.5px] font-semibold text-bad">{error}</p>}
      </div>
      <span
        className={`shrink-0 text-[12.5px] font-bold ${
          tint === "late"
            ? "text-bad"
            : tint === "now"
              ? "text-accent"
              : tint === "soon"
                ? "text-fg-muted"
                : "text-fg-subtle"
        }`}
      >
        {dueLabel(task.dueAt, now)}
      </span>
      <button
        type="button"
        onClick={markDone}
        disabled={pending}
        className={`shrink-0 rounded-md px-3.5 py-1.5 text-[12.5px] font-bold transition-colors ${BTN_EDIT}`}
      >
        {pending ? "…" : "Done"}
      </button>
    </li>
  );
}
