"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { titleCaseWords } from "../_shell/format";
import { CONTROL, CONTROL_SIZE } from "../_shell/compactForm";
import { BTN_PRIMARY, BTN_NEUTRAL } from "../_shell/ui";
import { createTask, planTask } from "./actions";
import { CompleteTaskDialog } from "./CompleteTaskDialog";
import { CompletenessList } from "../agent/CompletenessList";
import { gapsForBook, countGaps, type CompletenessInput } from "../agent/completeness";
import {
  buildPlanBoard,
  dueDateInputForColumn,
  isOverdue,
  isRealPlanMove,
  planCardLabel,
  PLAN_COLUMNS,
  PLAN_HINT,
  PLAN_LABEL,
  type PlanColumn,
  type PlanTask,
} from "./plan";

/**
 * Workspace → Tasks — the agent's planning board.
 *
 * Four columns: work handed to you but not yet planned (Inbox), then today,
 * tomorrow, the rest of the week. Dragging a card between columns IS the
 * scheduling mechanism — it writes crm_tasks.due_at through the shared task
 * write path — so planning a week costs four drags and no date pickers.
 *
 * This REPLACED the org-wide grouped list that used to live here. That view
 * still exists, at Admin → Tasks, where it belongs: an agent's Tasks page
 * should be their own work, and the org-wide read is a management question.
 *
 * Overdue cards sit at the TOP OF TODAY with a red edge rather than in a
 * column of their own — an overdue task is the most urgent thing you have
 * today, and its own column is somewhere for it to be quietly ignored.
 */
export function TasksHub({
  tasks,
  companies,
  completeness,
  now,
  doneThisWeek,
}: {
  tasks: PlanTask[];
  /** Company records the gaps are derived from, per render — never stored. */
  completeness: CompletenessInput[];
  /** Companies this agent may file a task against — scoped upstream by the
   * shared visibility rule, same as every other picker. */
  companies: { id: string; name: string }[];
  /** Server clock, so every bucket and label is computed against one instant. */
  now: number;
  doneThisWeek: number;
}) {
  const router = useRouter();
  const at = new Date(now);
  const board = buildPlanBoard(tasks, at);

  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<PlanColumn | null>(null);
  const [composing, setComposing] = useState<PlanColumn | null>(null);
  /** The task being closed out. Completion no longer happens on the tick —
   * it opens the dialog, which collects the note the standard requires. */
  const [closing, setClosing] = useState<PlanTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const byId = new Map(tasks.map((t) => [t.id, t]));
  // Derived every render. Shown under INBOX because that column is already
  // "work you haven't planned"; a gap is the same kind of thing, minus the
  // human who asked for it.
  const gaps = gapsForBook(completeness, 4);
  const gapTotal = countGaps(completeness);
  const overdueCount = tasks.filter((t) => isOverdue(t, at)).length;

  function move(taskId: string, target: PlanColumn) {
    const task = byId.get(taskId);
    if (!task || !isRealPlanMove(task, target, at)) return;
    setError(null);
    startTransition(async () => {
      const result = await planTask(taskId, target);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function finish(taskId: string) {
    setError(null);
    setClosing(byId.get(taskId) ?? null);
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-[19px] font-bold tracking-tight text-fg">Tasks</h1>
          <p className="text-[13px] text-fg-muted">your work, planned your way</p>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <Stat value={tasks.length} label="open" />
          <Stat value={overdueCount} label="overdue" tone="bad" />
          <Stat value={doneThisWeek} label="done this week" tone="ok" />
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-bad/30 bg-bad-bg px-3 py-2 text-[12.5px] font-semibold text-bad">
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-x-auto pb-1">
        <div className="flex h-full min-h-[22rem] gap-3">
          {PLAN_COLUMNS.map((key) => (
            <section
              key={key}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(key);
              }}
              onDragLeave={() => setOver((k) => (k === key ? null : k))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                setDragging(null);
                const id = e.dataTransfer.getData("text/plain");
                if (id) move(id, key);
              }}
              aria-label={`${PLAN_LABEL[key]}, ${board[key].length} tasks`}
              className={`flex w-[19.5rem] shrink-0 flex-col rounded-lg border transition-colors ${
                over === key ? "border-accent bg-accent-bg" : "border-line-strong bg-inset"
              }`}
            >
              <header className="flex items-start gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.09em] text-fg-muted">
                      {PLAN_LABEL[key]}
                    </span>
                    <span className="text-[13px] font-bold text-fg">{board[key].length}</span>
                  </p>
                  {PLAN_HINT[key] && (
                    <p className="text-[11.5px] text-fg-subtle">{PLAN_HINT[key]}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setComposing((c) => (c === key ? null : key))}
                  aria-label={`Add a task to ${PLAN_LABEL[key]}`}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[15px] font-bold leading-none transition-colors ${
                    composing === key ? BTN_NEUTRAL : "border border-accent bg-card text-accent hover:bg-accent-bg"
                  }`}
                >
                  {composing === key ? "×" : "+"}
                </button>
              </header>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {composing === key && (
                  <Composer
                    column={key}
                    companies={companies}
                    now={at}
                    onDone={() => {
                      setComposing(null);
                      router.refresh();
                    }}
                    onCancel={() => setComposing(null)}
                  />
                )}

                {board[key].length === 0 && composing !== key && !(key === "inbox" && gaps.length) ? (
                  <p className="px-1 py-6 text-center text-[12px] text-fg-subtle">
                    {key === "inbox" ? "Nothing waiting to be planned." : "Nothing here."}
                  </p>
                ) : (
                  board[key].map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      now={at}
                      pending={pending}
                      isDragging={dragging === task.id}
                      onDragStart={setDragging}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                      onComplete={finish}
                      onPick={move}
                    />
                  ))
                )}

                {key === "inbox" && <CompletenessList gaps={gaps} total={gapTotal} compact />}
              </div>
            </section>
          ))}
        </div>
      </div>

      <p className="text-[12px] text-fg-subtle">
        Drag a card between columns to reschedule it · tick the circle to close it out · + adds a
        task straight into that column.
      </p>

      {closing && (
        <CompleteTaskDialog
          taskId={closing.id}
          title={closing.title}
          dueAt={closing.dueAt}
          definitionOfDone={closing.definitionOfDone}
          onClose={() => setClosing(null)}
          onDone={() => {
            setClosing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: "bad" | "ok" }) {
  const color = tone === "bad" ? "text-bad" : tone === "ok" ? "text-ok" : "text-fg";
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`text-[18px] font-bold leading-none ${value === 0 ? "text-fg-subtle" : color}`}>
        {value}
      </span>
      <span className="text-[12.5px] text-fg-muted">{label}</span>
    </span>
  );
}

function TaskCard({
  task,
  now,
  pending,
  isDragging,
  onDragStart,
  onDragEnd,
  onComplete,
  onPick,
}: {
  task: PlanTask;
  now: Date;
  pending: boolean;
  isDragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onComplete: (id: string) => void;
  onPick: (id: string, column: PlanColumn) => void;
}) {
  const late = isOverdue(task, now);
  const label = planCardLabel(task, now);

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(task.id);
      }}
      onDragEnd={onDragEnd}
      // NO RED LEFT EDGE. Overdue used to be signalled three ways at once —
      // this edge, the due pill and the priority dot — and three signals for
      // one fact is noise, not emphasis (Brent, 2026-08-26). The PILL is the
      // one that survives, because it is the only one carrying the actual
      // information: not "late" but "4 days late".
      className={`cursor-grab rounded-[5px] border border-line bg-card p-2.5 shadow-e1 transition-opacity active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        {/* The completion control. A real checkbox, not a styled div — it has
            to be reachable by keyboard and announced as what it is. */}
        <input
          type="checkbox"
          checked={false}
          disabled={pending}
          onChange={() => onComplete(task.id)}
          aria-label={`Complete "${task.title}"`}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded-full accent-[#2f5fd6] disabled:opacity-60"
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-start gap-1.5 text-[13px] font-bold leading-snug text-fg">
            {/* HIGH PRIORITY IS A DOT, not a badge. It has to be findable at
                a glance without competing with the due pill, and a card
                carrying three coloured chips reads as noise. Normal priority
                shows nothing at all — the absence is the signal.
                
                AMBER, NOT RED. It used to be bg-bad, the same colour the card
                used for overdue, so a high-priority task that was perfectly
                on time still looked alarming and you could not tell the two
                apart. Red now means late and nothing else; this dot means
                priority and nothing else. */}
            {task.isHigh && (
              <span
                aria-label="High priority"
                title="High priority"
                className="mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full bg-warn"
              />
            )}
            <span className="min-w-0">{task.title}</span>
          </p>
          {task.accountId && task.companyName ? (
            <Link
              href={`/crm/accounts/${task.accountId}`}
              prefetch={false}
              draggable={false}
              className="mt-0.5 block truncate text-[12px] font-semibold text-accent hover:underline"
            >
              {titleCaseWords(task.companyName)}
            </Link>
          ) : (
            <p className="mt-0.5 text-[12px] text-fg-subtle">No company</p>
          )}
          {/* WHO to speak to sits on the face — it changes what you do next,
              which the task type does not. The two share a line so the card
              doesn't grow a row for each. */}
          <p className="truncate text-[11.5px] text-fg-subtle">
            {task.contactName ? (
              <span className="font-semibold text-fg-muted">{titleCaseWords(task.contactName)}</span>
            ) : null}
            {task.contactName && task.provenance ? " · " : null}
            {task.provenance}
          </p>
        </div>
        {label && (
          <span
            className={`shrink-0 rounded-[3px] px-1.5 py-0.5 text-[11px] font-bold ${
              late ? "bg-bad-bg text-bad" : "bg-accent-bg text-accent"
            }`}
          >
            {label}
          </span>
        )}
      </div>

      {/* THE BRIEF AND THE BAR, ON THE FACE (Brent, 2026-08-26: everything
          visible). These were behind a "Details" toggle, on the reasoning
          that a board of open paragraphs stops being a board. Brent's call
          overrides it, and the conditional is what keeps it workable: MOST
          tasks carry neither, so most cards stay exactly as short as they
          were — and the tall ones are tall because somebody actually wrote a
          brief, which is worth seeing without a click.

          "Done when" leads. It is the thing being asked for; the brief is
          context for getting there. */}
      {(task.definitionOfDone || task.instructions) && (
        <div className="mt-1.5 space-y-1 border-l-2 border-line pl-2">
          {task.definitionOfDone && (
            <p className="text-[11.5px] leading-relaxed text-fg-muted">
              <span className="font-bold text-fg">Done when:</span> {task.definitionOfDone}
            </p>
          )}
          {task.instructions && (
            <p className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-fg-muted">
              {task.instructions}
            </p>
          )}
        </div>
      )}

      {/* The non-drag path. Always present, not hover-revealed, so keyboard
          and touch users can plan too — dragging is unreliable on both. */}
      <select
        value=""
        disabled={pending}
        onChange={(e) => e.target.value && onPick(task.id, e.target.value as PlanColumn)}
        aria-label={`Move "${task.title}" to another column`}
        className="mt-1.5 w-full rounded-[4px] border border-line bg-card px-1 py-0.5 text-[11px] font-semibold text-fg-muted disabled:opacity-60"
      >
        <option value="">Move to…</option>
        {PLAN_COLUMNS.map((c) => (
          <option key={c} value={c}>
            {PLAN_LABEL[c]}
          </option>
        ))}
      </select>
    </article>
  );
}

/**
 * The "+" composer. Writes through createTask — the same action the task
 * dialog uses — with the column's own date prefilled, so a task created here
 * lands in the column you created it in. Assignment is left blank, which
 * createTask resolves to the creator; an agent cannot assign to anyone else
 * and the server re-checks that regardless.
 */
function Composer({
  column,
  companies,
  now,
  onDone,
  onCancel,
}: {
  column: PlanColumn;
  companies: { id: string; name: string }[];
  now: Date;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [accountId, setAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    if (!title.trim()) {
      setError("Give the task a title.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("title", title.trim());
      if (accountId) fd.set("account_id", accountId);
      const date = dueDateInputForColumn(column, now);
      // createTask reads due_at as a Central datetime-local string. Midday,
      // matching every other write in this CRM, so a timezone shift can't
      // roll it onto the wrong day. Inbox sends nothing at all.
      if (date) fd.set("due_at", `${date}T12:00`);
      const result = await createTask(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTitle("");
      setAccountId("");
      onDone();
    });
  }

  return (
    <div className="rounded-[5px] border border-accent bg-card p-2.5">
      <input
        type="text"
        value={title}
        autoFocus
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") onCancel();
        }}
        placeholder={`New task in ${PLAN_LABEL[column]}`}
        aria-label={`New task in ${PLAN_LABEL[column]}`}
        className={`w-full ${CONTROL_SIZE} ${CONTROL}`}
      />
      <select
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
        aria-label="Company for the new task"
        className={`mt-1.5 w-full ${CONTROL_SIZE} ${CONTROL}`}
      >
        <option value="">No company</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {companies.length === 0 && (
        <p className="mt-1 text-[11.5px] text-fg-subtle">
          No companies are assigned to you yet, so this task will stand alone.
        </p>
      )}
      {error && <p className="mt-1 text-[11.5px] font-semibold text-bad">{error}</p>}
      <div className="mt-1.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className={`rounded-md px-2.5 py-1 text-[12px] font-bold transition-colors ${BTN_PRIMARY}`}
        >
          {pending ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${BTN_NEUTRAL}`}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
