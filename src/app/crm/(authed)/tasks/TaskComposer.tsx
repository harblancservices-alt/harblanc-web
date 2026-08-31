"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, BTN_PRIMARY, BTN_NEUTRAL, BTN_EDIT } from "../_shell/ui";
import { FormError } from "../_shell/form";
import { CONTROL, CONTROL_SIZE, LABEL } from "../_shell/compactForm";
import { sendTask } from "../admin/assign-actions";
import { isDuplicateQuickTask, normalizeQuickTask } from "../admin/quickTasks";
import { defaultTaskDueDateInput } from "./snooze";
import { DEFAULT_TASK_TIME } from "./taskTime";
import { TaskTimeSelect } from "./TaskTimeSelect";
import { centralInputToIso } from "../_shell/format";
import { addQuickTask, removeQuickTask, type QuickTask } from "../admin/quick-task-actions";

/**
 * THE TASK COMPOSER — the one task-making surface in the CRM.
 *
 * It was Admin → Overview's "Or send them a task", written as a private
 * function inside AssignBoard.tsx. The dashboard's "Add task" button opened
 * something else entirely (the older TaskDialog), so the CRM had two ways to
 * make a task and only one of them knew about quick-task buttons,
 * instructions, what-done-looks-like, or the high-priority-needs-a-date
 * rule.
 *
 * This is the extraction, not a fork. AssignBoard renders it and so does the
 * dashboard; there is no second copy to drift.
 *
 * ── THE TWO THINGS THAT DIFFER BY CALLER ──────────────────────────────
 *
 * WHO IT IS FOR. An admin picks an agent. An agent makes work for
 * themselves, so `assignee: {kind:"self"}` renders no picker at all and
 * sends against their own id. That is not a simplification — it matches
 * every other assignment gate in the CRM, all of which are role === "owner"
 * (accounts/[id]/page.tsx, ActiveCustomersPanel, and the dashboard's own
 * canAssignOthers={false}). sendTask enforces the same rule server-side:
 * a non-owner may assign to themselves and nobody else. An agent handing
 * work to another agent has never been possible here and this does not
 * quietly introduce it.
 *
 * WHICH COMPANIES. The caller supplies the list already scoped — the admin
 * passes the whole unassigned pool, the dashboard passes the agent's own
 * companies, narrowed the same way every other agent surface is.
 *
 * ── EDITING THE QUICK-TASK BUTTONS ────────────────────────────────────
 *
 * Owner-only, because addQuickTask/removeQuickTask are owner-only on the
 * server and the buttons are org-shared vocabulary. An agent gets to USE
 * them and cannot rewrite them for everybody else; the controls are hidden
 * rather than shown and then failing.
 */

export type ComposerCompany = { id: string; name: string };

export type ComposerContactOption = {
  id: string;
  name: string;
  accountId: string;
  title: string | null;
};

export type TaskComposerAssignee =
  /** Admin: choose from the team. */
  | { kind: "pick"; team: { id: string; name: string }[] }
  /** Agent: it is for them, and there is no picker. */
  | { kind: "self"; id: string; label: string };

export function TaskComposer({
  assignee,
  companies,
  contacts,
  quickTasks,
  canEditQuickTasks = false,
  /** "card" wraps in the panel Admin → Overview uses. "bare" drops the
   * wrapper for callers that already supply chrome — the dashboard renders
   * this inside a Modal, and a card inside a dialog is two headers. */
  chrome = "card",
  onSent,
}: {
  assignee: TaskComposerAssignee;
  companies: ComposerCompany[];
  contacts: ComposerContactOption[];
  quickTasks: QuickTask[];
  canEditQuickTasks?: boolean;
  chrome?: "card" | "bare";
  onSent?: () => void;
}) {
  const router = useRouter();
  const [taskEditPending, startTaskEdit] = useTransition();
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [who, setWho] = useState(
    assignee.kind === "self" ? assignee.id : assignee.team[0]?.id ?? "",
  );
  /* DUE DEFAULTS TO TOMORROW 08:00 CENTRAL (2026-08-28).
     This REVERSES the 2026-08-26 decision that recorded here — "due
     defaults to empty, undated work lands in the Inbox and gets planned
     there, matching what assignment does". Brent chose the default after
     weighing it against making due_at mandatory: "okay i like that 8am
     clause".
     Assignment still lands undated; that path is untouched. What changed
     is what happens when a PERSON writes a task and says nothing about
     when. The value is visible in the Due field before sending and can be
     cleared, so undated remains a choice rather than an accident.
     Lazy initialiser: the clock is read once, not on every render. */
  const [due, setDue] = useState<string>(() => defaultTaskDueDateInput());
  /* The same 9am the profile composer opens on, so the two composers agree
     with each other even while both disagree with TASK_DAY_START. See
     taskTime.ts for that disagreement, which is deliberate. */
  const [dueTime, setDueTime] = useState<string>(DEFAULT_TASK_TIME);
  const [accountId, setAccountId] = useState("");
  const [contactId, setContactId] = useState("");
  /** The BRIEF — why this task exists, what to walk in knowing. Stored in
   * crm_tasks.notes, which has always been the brief. */
  const [instructions, setInstructions] = useState("");
  /** The OUTCOME — "got a rate". The bar the close-out note gets checked
   * against. */
  const [doneWhen, setDoneWhen] = useState("");
  /** TWO STATES ONLY (Brent). crm_tasks.priority's vocabulary is
   * low/normal/high; the composer offers the two that carry meaning here —
   * the due date already says WHEN, priority only has to say "does this jump
   * the queue". "low" stays valid for tasks made elsewhere. */
  const [high, setHigh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const forSelf = assignee.kind === "self";

  /** The chosen company's own contacts. Plainly computed, not memoised: the
   * dependency would include `contacts`, and the list is small enough that a
   * filter per render is cheaper than the memo bookkeeping. */
  const companyContacts = accountId ? contacts.filter((c) => c.accountId === accountId) : [];

  /** Both handlers write to crm_quick_tasks and let the server action's
   * revalidatePath refresh the list — no local copy to drift out of sync. */
  function onAddQuickTask() {
    const label = normalizeQuickTask(draft);
    if (!label) {
      setAddError("Give the button a label.");
      return;
    }
    if (isDuplicateQuickTask(quickTasks.map((q) => q.label), label)) {
      setAddError(`"${label}" is already there.`);
      return;
    }
    setAddError(null);
    startTaskEdit(async () => {
      const result = await addQuickTask(label);
      if (!result.ok) {
        setAddError(result.error);
        return;
      }
      setDraft("");
      router.refresh();
    });
  }

  function onRemoveQuickTask(task: QuickTask) {
    setAddError(null);
    startTaskEdit(async () => {
      const result = await removeQuickTask(task.id);
      if (!result.ok) {
        setAddError(result.error);
        return;
      }
      // Clearing a button that is currently the composer's title would leave
      // a selected-looking state with nothing selected.
      setTitle((t) => (t === task.label ? "" : t));
      router.refresh();
    });
  }

  function send() {
    setError(null);
    setSent(null);
    startTransition(async () => {
      const result = await sendTask({
        title,
        assignedUserId: who,
        contactId: contactId || null,
        notes: instructions,
        definitionOfDone: doneWhen,
        priority: high ? "high" : "normal",
        // A date input gives "YYYY-MM-DD"; store it as an instant at local
        // midday so a timezone shift can't roll it onto the wrong day.
        // CENTRAL, not the browser's timezone. `new Date("...T12:00:00")`
        // parsed the string in whatever zone the rep happened to be in, so
        // the same pick produced a different instant from a different
        // machine. 08:00 Central via centralInputToIso is the one meaning
        // of "8am" this CRM has.
        dueAt: due ? centralInputToIso(`${due}T${dueTime}`) : null,
        accountId: accountId || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSent(
        forSelf
          ? due
            ? "Added to your board."
            : "Added to your Inbox."
          : `Sent to ${
              assignee.kind === "pick"
                ? assignee.team.find((t) => t.id === who)?.name ?? "them"
                : "them"
            }.`,
      );
      setTitle("");
      setDue(defaultTaskDueDateInput());
      setDueTime(DEFAULT_TASK_TIME);
      setAccountId("");
      setContactId("");
      setInstructions("");
      setDoneWhen("");
      setHigh(false);
      // The list this task just landed in is rendered by the server.
      router.refresh();
      onSent?.();
    });
  }

  const body = (
    <div className="flex flex-col gap-3 p-4">
      <div>
        <p className={LABEL}>Quick tasks — one click</p>

        {adding && canEditQuickTasks && (
          <div className="mt-1.5 flex flex-wrap items-start gap-1.5">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onAddQuickTask()}
              placeholder="e.g. Ask about their reefer volume"
              aria-label="New quick task"
              className={`min-w-0 flex-1 ${CONTROL_SIZE} ${CONTROL}`}
            />
            <button
              type="button"
              onClick={onAddQuickTask}
              disabled={taskEditPending}
              className={`rounded-md px-3 py-2 text-[12.5px] font-bold transition-colors disabled:opacity-60 ${BTN_PRIMARY}`}
            >
              {taskEditPending ? "Saving…" : "Add"}
            </button>
          </div>
        )}
        {addError && <p className="mt-1 text-[12px] font-semibold text-bad">{addError}</p>}

        {/* A fixed grid, not flex-wrap — buttons of differing widths wrapped
            raggedly and orphaned the last one. Every button is solid accent;
            in edit mode each grows a remove control instead of setting the
            title. */}
        <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {quickTasks.map((q) => (
            <div key={q.id} className="relative">
              <button
                type="button"
                disabled={taskEditPending}
                onClick={() => (editing ? onRemoveQuickTask(q) : setTitle(q.label))}
                className={`w-full rounded-[5px] border border-accent px-2.5 py-1.5 text-center text-[12.5px] font-semibold text-white transition-colors disabled:opacity-60 ${
                  title === q.label && !editing
                    ? "bg-accent-hover ring-2 ring-accent/40"
                    : "bg-accent hover:bg-accent-hover"
                }`}
                title={editing ? `Remove "${q.label}"` : undefined}
              >
                {q.label}
              </button>
              {editing && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#c0272d] text-[10px] font-bold leading-none text-white"
                >
                  ×
                </span>
              )}
            </div>
          ))}
        </div>
        {editing && (
          <p className="mt-1.5 text-[11.5px] text-fg-muted">
            Click a button to remove it. Removed buttons are kept and can be restored.
          </p>
        )}
      </div>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Or write your own</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Call back about the rate they asked for"
          className={`w-full ${CONTROL_SIZE} ${CONTROL}`}
        />
      </label>

      <div
        className={`grid grid-cols-1 gap-2 ${forSelf ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}
      >
        {/* No picker when it is your own work — see this file's header. */}
        {assignee.kind === "pick" && (
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Who</span>
            <select
              value={who}
              onChange={(e) => setWho(e.target.value)}
              className={`w-full ${CONTROL_SIZE} ${CONTROL}`}
            >
              {assignee.team.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {/* HIGH PRIORITY REQUIRES A DATE (Brent, 2026-08-26). "Urgent,
            whenever" is a contradiction — it says drop everything for
            something with no deadline, which is how urgent stops meaning
            anything. Normal-priority work is unchanged: still optional,
            still lands in the Inbox to plan. */}
        <label className="flex flex-col gap-1">
          <span className={LABEL}>{high ? "Due — required" : "Due"}</span>
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            aria-invalid={high && !due}
            className={`w-full ${CONTROL_SIZE} ${CONTROL} ${high && !due ? "border-bad" : ""}`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>At</span>
          <TaskTimeSelect
            value={dueTime}
            onChange={setDueTime}
            label="Task due time"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>On</span>
          <select
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              // The contact belongs to the company. Changing the company
              // must drop it, or the form would carry a pairing that no
              // longer exists — which sendTask would reject anyway.
              setContactId("");
            }}
            className={`w-full ${CONTROL_SIZE} ${CONTROL}`}
          >
            <option value="">No company</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* WHO AT THE COMPANY. "Call Dale at Longhorn Tube" beats "Call
          Longhorn Tube". Only appears once a company is chosen, since a
          contact with no company can't be reached from here; says so
          plainly when that company has nobody on file rather than
          rendering an empty control. */}
      {accountId && (
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Who to speak to</span>
          {companyContacts.length === 0 ? (
            <span className="text-[12px] text-fg-subtle">
              No contacts on file for this company yet.
            </span>
          ) : (
            <select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              className={`w-full ${CONTROL_SIZE} ${CONTROL}`}
            >
              <option value="">Anyone there</option>
              {companyContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title ? `${c.name} — ${c.title}` : c.name}
                </option>
              ))}
            </select>
          )}
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Instructions</span>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={3}
          placeholder="Why this matters, what they should know walking in, anything already tried."
          className={`w-full resize-y ${CONTROL_SIZE} ${CONTROL}`}
        />
      </label>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="flex flex-col gap-1">
          <span className={LABEL}>What done looks like</span>
          <input
            type="text"
            value={doneWhen}
            onChange={(e) => setDoneWhen(e.target.value)}
            placeholder="Got a rate · confirmed they're still shipping"
            className={`w-full ${CONTROL_SIZE} ${CONTROL}`}
          />
        </label>
        {/* Two states, not a scale. A checkbox rather than a select makes
            that structural — there is no third thing to pick. */}
        <label className="flex items-end gap-2 pb-2">
          <input
            type="checkbox"
            checked={high}
            onChange={(e) => setHigh(e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-[#c0272d]"
          />
          <span className="text-[12.5px] font-semibold text-fg">High priority</span>
        </label>
      </div>

      <FormError message={error} />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={send}
          disabled={pending || !title.trim() || !who || (high && !due)}
          className={`rounded-md px-3.5 py-2 text-[13px] font-bold transition-colors disabled:pointer-events-none disabled:opacity-50 ${BTN_PRIMARY}`}
        >
          {pending ? (forSelf ? "Adding…" : "Sending…") : forSelf ? "Add it" : "Send it"}
        </button>
        <span className="text-[12px] text-fg-muted">
          {sent ??
            (high && !due
              ? "High priority needs a date — say when it’s needed."
              : due
                ? forSelf
                  ? "Lands on your board for that day."
                  : "Lands on their board for that day."
                : forSelf
                  ? "Lands in your Inbox to plan."
                  : "Lands in their Inbox to plan.")}
        </span>
        {title && (
          <button
            type="button"
            onClick={() => setTitle("")}
            className={`ml-auto rounded-md px-2.5 py-1.5 text-[12px] font-semibold ${BTN_NEUTRAL}`}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );

  if (chrome === "bare") return body;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-[15px] font-bold tracking-tight text-fg">
          {forSelf ? "Add a task" : "Or send them a task"}
        </h2>
        {canEditQuickTasks && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setAdding((v) => !v);
                setEditing(false);
                setAddError(null);
              }}
              className={`rounded-md px-2.5 py-1.5 text-[12px] font-bold transition-colors ${BTN_PRIMARY}`}
            >
              {adding ? "Close" : "+ Add"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing((v) => !v);
                setAdding(false);
              }}
              className={`rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
                editing ? BTN_NEUTRAL : BTN_EDIT
              }`}
            >
              {editing ? "Done" : "Edit"}
            </button>
          </div>
        )}
      </div>
      {body}
    </Card>
  );
}
