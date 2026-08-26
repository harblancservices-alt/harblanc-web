"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, BTN_EDIT } from "../_shell/ui";
import { CompanyCard } from "../_shell/CompanyCard";
import { titleCaseWords } from "../_shell/format";
import { CompleteTaskDialog } from "../tasks/CompleteTaskDialog";
import { CompletenessList } from "./CompletenessList";
import { gapsForBook, countGaps, type CompletenessInput } from "./completeness";
import {
  companyFlag,
  dueLabel,
  dueTint,
  groupAgentWork,
  newlyAssigned,
  type AgentCompany,
  type AgentTask,
} from "./agentWork";

/**
 * Workspace -> Dashboard (/crm) — the same screen for every user, owner
 * included (Brent, 2026-08-25).
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
  completeness,
  now,
  addCompanyButton,
}: {
  /** Display name shown next to the brand mark. */
  name: string;
  tasks: AgentTask[];
  companies: AgentCompany[];
  /** Company records the completeness gaps are derived from, per render. */
  completeness: CompletenessInput[];
  /** Server clock — every label on this page is computed against this one
   * instant so the server and client renders can't disagree by a day. */
  now: number;
  /** The "+ Add" company dialog trigger, passed in from the server page
   * because it needs the rep roster. */
  addCompanyButton: React.ReactNode;
}) {
  const at = new Date(now);
  const groups = groupAgentWork(tasks, at);
  const newCompanies = newlyAssigned(companies);

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

  // Derived here, every render. Nothing stored, nothing to reap — see
  // completeness.ts.
  const gaps = gapsForBook(completeness);
  const gapTotal = countGaps(completeness);

  const COMPANY_CAP = 8;
  const visibleNew = newCompanies.slice(0, COMPANY_CAP);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-4 sm:px-6">
      {/* ── Header: who you are, then the only three numbers that matter ── */}
      <header className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line pb-3">
        <h1 className="text-[19px] font-bold tracking-tight text-fg">Hello Hotshot</h1>
        <p className="text-[14px] text-fg-muted">{name}</p>
        <div className="ml-auto flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <Stat value={groups.overdue.length} label="Overdue" tone="bad" />
          <Stat value={groups.today.length} label="Due today" tone="accent" />
          <Stat value={newCompanies.length} label="New to work" tone="fg" />
        </div>
      </header>

      {/* THREE AREAS, NOT TWO (Brent, 2026-08-26). It was a wide "Your work"
          column with the gaps bolted onto its bottom, beside a narrow roster
          — two panels, one of them half empty, and the gaps reading as a
          footnote to the task list rather than their own kind of thing.
          Tasks, gaps and new companies are three separate questions, so they
          get three columns. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
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

        {/* ── Gaps ──────────────────────────────────────────────────── */}
        <Card>
          <div className="flex flex-wrap items-baseline gap-2 border-b border-line px-4 py-3">
            <h2 className="text-[15px] font-bold tracking-tight text-fg">Gaps</h2>
            <p className="text-[12.5px] text-fg-muted">records missing something</p>
          </div>
          {gapTotal === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-[13.5px] font-semibold text-fg">Nothing missing</p>
              <p className="mt-0.5 text-[12.5px] text-fg-muted">
                Every company you own has a contact, a location and a trade.
              </p>
            </div>
          ) : (
            <CompletenessList gaps={gaps} total={gapTotal} compact />
          )}
        </Card>

        {/* ── New to work ───────────────────────────────────────────── */}
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
            <h2 className="text-[15px] font-bold tracking-tight text-fg">New to work</h2>
            <span className="text-[12.5px] font-semibold text-fg-muted">{newCompanies.length}</span>
            <span className="ml-auto">{addCompanyButton}</span>
          </div>

          {/* NOT THE ROSTER. Only companies handed to you that you have not
              logged a contact against yet — see agentWork.ts::newlyAssigned.
              The full book is the Companies page, linked below. */}
          {newCompanies.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-[13.5px] font-semibold text-fg">
                {companies.length === 0 ? "No companies yet" : "You have started on all of them"}
              </p>
              <p className="mt-0.5 text-[12.5px] text-fg-muted">
                {companies.length === 0
                  ? "Add one, or wait for one to be assigned to you."
                  : "New ones show up here until you log a call or a note."}
              </p>
              {companies.length > 0 && (
                <Link
                  href="/crm/accounts"
                  prefetch={false}
                  className="mt-2 inline-block text-[13px] font-bold text-accent hover:underline"
                >
                  See all {companies.length}
                </Link>
              )}
            </div>
          ) : (
            <ul className="flex flex-col gap-2 p-3">
              {visibleNew.map((c) => (
                <li key={c.id}>
                  {/* The SHARED rich card (_shell/CompanyCard.tsx) — the same
                      component the pipeline board draws, so the two screens
                      can never disagree about a company. */}
                  <CompanyCard card={c} now={at.getTime()} flag={companyFlag(c, at)} />
                </li>
              ))}
              <li className="px-1 pt-1">
                <Link
                  href="/crm/accounts"
                  prefetch={false}
                  className="text-[13px] font-bold text-accent hover:underline"
                >
                  {newCompanies.length > COMPANY_CAP
                    ? `See all ${companies.length} companies`
                    : `All ${companies.length} companies`}
                </Link>
              </li>
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
  const [error] = useState<string | null>(null);
  // Done no longer completes on click — it opens the shared close-out dialog,
  // which collects the note completeTask now requires. Same component the
  // planning board uses, so the two screens ask for the same things.
  const [closing, setClosing] = useState(false);
  const pending = false;
  const tint = dueTint(task.dueAt, now);

  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="flex items-start gap-1.5 text-[13.5px] font-bold text-fg">
          {/* Same quiet dot as the planning board — one marker, not a badge,
              and nothing at all for normal priority. */}
          {task.isHigh && (
            <span
              aria-label="High priority"
              title="High priority"
              className="mt-[6px] h-[7px] w-[7px] shrink-0 rounded-full bg-bad"
            />
          )}
          <span className="min-w-0">{task.title}</span>
        </p>
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
          {/* WHO to speak to. The row exists so an agent can act without
              opening anything; a name is the difference between "call
              Longhorn Tube" and knowing who picks up. */}
          {task.contactName && (
            <span className="font-semibold text-fg-muted">
              &middot; {titleCaseWords(task.contactName)}
            </span>
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
        onClick={() => setClosing(true)}
        disabled={pending}
        className={`shrink-0 rounded-md px-3.5 py-1.5 text-[12.5px] font-bold transition-colors ${BTN_EDIT}`}
      >
        {pending ? "…" : "Done"}
      </button>

      {closing && (
        <CompleteTaskDialog
          taskId={task.id}
          title={task.title}
          dueAt={task.dueAt}
          onClose={() => setClosing(false)}
          onDone={() => {
            setClosing(false);
            router.refresh();
          }}
        />
      )}
    </li>
  );
}
