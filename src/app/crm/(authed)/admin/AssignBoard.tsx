"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, BTN_PRIMARY, BTN_NEUTRAL, BTN_EDIT } from "../_shell/ui";
import { FormError } from "../_shell/form";
import { CONTROL, CONTROL_SIZE, LABEL } from "../_shell/compactForm";
import { titleCaseWords } from "../_shell/format";
import { assignWork, sendTask } from "./assign-actions";
import { isDuplicateQuickTask, normalizeQuickTask } from "./quickTasks";
import { SourcePill } from "../_shell/SourcePill";
import { addQuickTask, removeQuickTask, type QuickTask } from "./quick-task-actions";
import type { TeamMember, ComposerContact } from "./assign-data";
import {
  itemHref,
  sortByLongestWaiting,
  splitEvenly,
  waitingLabel,
  waitingUrgency,
  type WorkItem,
} from "./workItem";
import { AddCompanyButton } from "./AddCompanyButton";

/**
 * Admin → Overview. ONE job: handing work out.
 *
 * Left, every company in the org that nobody owns, sorted longest-waiting
 * first. Right, the people it can go to. Below that, a composer for the small
 * asks that aren't a whole company.
 *
 * The left list used to pool three tables and carry a filter tab per source
 * (Prospects / OTR / BOL Center), a provenance badge on every row and a
 * warning that some selections could only become a task. All of that went on
 * 2026-08-26 when OTR and BOL Center were retired: the pool is one kind of
 * thing now, and a filter with a single option is furniture.
 *
 * The Type column survived that cull with a NEW job. It no longer says where
 * a row came from — every row is a company, and source is a label on the
 * record, not a kind of thing. It says whether this company already appears
 * to be in the book under another name, computed at read time. Brent's rule:
 * duplicates convert like everything else and get labelled so he can deal
 * with them himself.
 *
 * There is deliberately no metric tile, no activity feed and no per-person
 * performance number on this page. The only number attached to a person is
 * their current load, and it is there to answer "who has room" — not to
 * report on them.
 */
export function AssignBoard({
  items,
  team,
  contacts,
  now,
  quickTasks,
}: {
  items: WorkItem[];
  team: TeamMember[];
  /** Org contacts for the composer's contact picker — see ComposerContact. */
  contacts: ComposerContact[];
  now: number;
  /** Live rows from crm_quick_tasks, org-shared and ordered. */
  quickTasks: QuickTask[];
}) {
  const router = useRouter();
  /**
   * TWO MODES. Default is BROWSE: no checkbox exists anywhere, the whole row
   * opens the item so an admin can look before deciding. SELECT mode reveals
   * the checkboxes, stops rows navigating, and shows the selection bar.
   *
   * Browse first because looking is the more common act — you read the queue
   * far more often than you hand it out, and a screen full of checkboxes
   * makes reading feel like a form to fill in.
   */
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = useMemo(() => sortByLongestWaiting(items), [items]);

  const visibleKeys = visible.map((i) => i.id);
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selected.has(k));

  /** Leaving select mode always clears the selection — an invisible pending
   * selection that reappears later is a trap. */
  function toggleSelectMode() {
    setSelectMode((prev) => {
      if (prev) setSelected(new Set());
      return !prev;
    });
    setError(null);
    setNotice(null);
  }

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** Select-all applies to what's ON SCREEN. */
  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleKeys.forEach((k) => next.delete(k));
      else visibleKeys.forEach((k) => next.add(k));
      return next;
    });
  }

  const selectedCount = selected.size;

  function describe(claimed: number, tasked: number): string {
    const bits: string[] = [];
    if (claimed) bits.push(`${claimed} ${claimed === 1 ? "company" : "companies"} assigned`);
    if (tasked) bits.push(`${tasked} ${tasked === 1 ? "task" : "tasks"} created`);
    return bits.join(" · ") || "Nothing to do";
  }

  function handOff(personId: string, keys: string[], who: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await assignWork(personId, keys);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSelected((prev) => {
        const next = new Set(prev);
        keys.forEach((k) => next.delete(k));
        return next;
      });
      setNotice(`${who}: ${describe(result.claimed, result.tasked)}.`);
    });
  }

  function splitAcrossTeam() {
    if (team.length === 0) return;
    const deal = splitEvenly(visibleKeys.filter((k) => selected.has(k)), team.map((p) => p.id));
    const entries = Object.entries(deal);
    if (entries.length === 0) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      let claimed = 0;
      let tasked = 0;
      for (const [personId, keys] of entries) {
        const result = await assignWork(personId, keys);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        claimed += result.claimed;
        tasked += result.tasked;
      }
      setSelected(new Set());
      setNotice(`Split across ${entries.length} ${entries.length === 1 ? "person" : "people"} — ${describe(claimed, tasked)}.`);
    });
  }

  // Lightest / heaviest tags — only meaningful with more than one person, and
  // only when they actually differ.
  const loads = team.map((p) => p.openTasks + p.prospects);
  const min = Math.min(...loads);
  const max = Math.max(...loads);
  const tagWorthShowing = team.length > 1 && min !== max;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      {/* ── Left: the pool ──────────────────────────────────────────────
          A bounded, internally-scrolling panel rather than a card that grows
          to 55 rows: the selection bar has to stay on screen the whole time
          you're picking, and Card's own `overflow-hidden` makes a
          viewport-sticky child impossible. Scrolling the LIST instead of the
          page keeps the bar planted at the panel's foot. */}
      {/* Back to 7rem. It was briefly 22rem to clear the "Where the work
          stands" readout that sat above this card; Brent removed that section
          on 2026-08-25, so the extra 15rem is now just empty page under a
          short card. The rail cannot be made viewport-sticky instead of
          bounded, because Card sets overflow-hidden and that makes it a
          scroll container of its own — sticky would resolve against the card
          rather than the window. */}
      <Card className="flex max-h-[calc(100vh-7rem)] flex-col">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-[15px] font-bold tracking-tight text-fg">Work to assign</h2>
          <p className="text-[12.5px] text-fg-muted">
            {items.length} {items.length === 1 ? "item" : "items"} with nobody on them
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          {/* "Add company" lives here because this is where the pool lives.
              It was the OTR page's "Add entry" button until that page was
              retired; the dialog is the same one, and what it writes is now a
              real unassigned company rather than a queue entry. */}
          <AddCompanyButton />
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[12px] text-fg-subtle">Sorted by longest waiting</p>
            <button
              type="button"
              onClick={toggleSelectMode}
              className={`rounded-md px-3 py-1.5 text-[12.5px] font-bold transition-colors ${
                selectMode ? BTN_NEUTRAL : BTN_PRIMARY
              }`}
            >
              {selectMode ? "Cancel" : "Select to assign"}
            </button>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="px-4 pb-8 pt-4 text-center">
            <p className="text-[13.5px] font-semibold text-fg">Nothing waiting here</p>
            <p className="mt-0.5 text-[12.5px] text-fg-muted">Every company in the org has an owner.</p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[680px] border-collapse">
              <thead>
                <tr className="border-b border-line text-[10.5px] font-bold uppercase tracking-[0.07em] text-fg-muted">
                  {/* The GUTTER is always here; the checkbox inside it is
                      not. Reserving the cell in both modes is what stops the
                      whole list jumping sideways when select mode turns on —
                      and rendering no <input> in browse mode keeps the
                      earlier rule true: there is no checkbox in the DOM until
                      you ask for one. It doubles as the company column's
                      left indent, so the list reads as a column rather than
                      text shoved against the card edge. */}
                  <th className="w-12 px-4 py-2">
                    {selectMode && (
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleAllVisible}
                        aria-label="Select everything shown"
                        className="h-4 w-4 cursor-pointer accent-[#2f5fd6]"
                      />
                    )}
                  </th>
                  <th className="px-2 py-2 text-left">Company</th>
                  {/* PROVENANCE, plus the duplicate flag. It briefly carried
                      only the flag, after the OTR/BOL funnels were retired
                      and "type" stopped meaning which TABLE a row came
                      from — but it still means where the company came from,
                      and that changes who you would hand it to. */}
                  <th className="px-2 py-2 text-left">Type</th>
                  <th className="px-2 py-2 text-left">What it needs</th>
                  <th className="px-2 py-2 text-left">Waiting</th>
                  {/* Reserved in BOTH modes, like the gutter. The column count
                      has to be identical either way or the table
                      redistributes its widths and the whole list drifts —
                      measured at 4px before this was pinned. */}
                  <th className="w-32 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => {
                  const key = item.id;
                  const checked = selected.has(key);
                  const urgency = waitingUrgency(item.waitingSince, now);
                  const href = itemHref(item);
                  return (
                    <tr
                      key={key}
                      onClick={() => (selectMode ? toggle(key) : router.push(href))}
                      className={`group cursor-pointer border-b border-line transition-colors ${
                        checked ? "bg-accent-bg" : "hover:bg-accent-bg"
                      }`}
                    >
                      {/* Same gutter, same width, both modes — see the header
                          cell. Only stops click propagation when it actually
                          holds a checkbox; in browse mode the gutter is part
                          of the row's clickable area like any other cell. */}
                      <td
                        className="w-12 px-4 py-2.5"
                        onClick={selectMode ? (e) => e.stopPropagation() : undefined}
                      >
                        {selectMode && (
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(key)}
                            aria-label={`Select ${item.company}`}
                            className="h-4 w-4 cursor-pointer accent-[#2f5fd6]"
                          />
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <p className="text-[13px] font-semibold text-fg">{titleCaseWords(item.company)}</p>
                        {(item.city || item.state) && (
                          <p className="text-[11.5px] text-fg-subtle">
                            {[item.city, item.state].filter(Boolean).join(", ")}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <span className="flex flex-wrap items-center gap-1.5">
                          {/* Same helper Admin -> Companies uses, so the two
                              screens say the same words about the same
                              company. A recognised token becomes its label;
                              free text shows VERBATIM (truncated for the
                              column, full string on hover) rather than
                              collapsing into "Other", which would hide the
                              junk that needs cleaning; null reads "Not
                              recorded". */}
                          <SourcePill source={item.source} />
                          {item.duplicateOf.length > 0 && (
                            <span
                              // The names go in the title so "which one?" —
                              // the first thing you ask — is one hover away
                              // rather than a separate hunt.
                              title={`Already in the CRM as: ${item.duplicateOf.join(", ")}`}
                              className="inline-flex shrink-0 rounded-[4px] border border-warn/60 px-1.5 py-0.5 text-[11px] font-semibold text-warn"
                            >
                              Duplicate
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-[12.5px] text-fg-muted">{item.needs}</td>
                      <td
                        className={`px-2 py-2.5 text-[12.5px] font-semibold ${
                          urgency === "hot" ? "text-bad" : urgency === "warm" ? "text-warn" : "text-fg-muted"
                        }`}
                      >
                        {waitingLabel(item.waitingSince, now)}
                      </td>
                      {/* Always present so the column count never changes; the
                          LINK inside it is browse-only. A REAL link, not just
                          the row handler — so the label can say where it goes
                          and middle-click / open-in-new-tab behave normally. */}
                      <td
                        className="w-32 px-2 py-2.5 text-right"
                        onClick={selectMode ? undefined : (e) => e.stopPropagation()}
                      >
                        {!selectMode && (
                          <Link
                            href={href}
                            prefetch={false}
                            className="invisible whitespace-nowrap text-[12px] font-semibold text-accent underline-offset-2 hover:underline group-hover:visible"
                          >
                            View company &rsaquo;
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* The mockup's dark rail. STICKY, not just last-in-the-card: the
            real pool is 55 rows deep, not the mockup's nine, so a bar that
            merely sat at the bottom of the list would be off-screen at the
            moment you select something. It rides the viewport instead. */}
        {selectedCount > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-3 bg-[#111418] px-4 py-3">
            <span className="text-[13px] font-bold text-white">{selectedCount} selected</span>
            <span className="text-[12.5px] text-white/60">Choose someone on the right, or</span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-[12.5px] font-semibold text-white underline underline-offset-2 hover:text-white/80"
            >
              clear
            </button>
            <button
              type="button"
              onClick={splitAcrossTeam}
              disabled={pending || team.length === 0}
              className="ml-auto rounded-md border border-white/25 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              Split evenly across the team
            </button>
          </div>
        )}
      </Card>

      {/* ── Right: people, then the composer ──────────────────────────── */}
      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="text-[15px] font-bold tracking-tight text-fg">Assign to</h2>
            <p className="text-[12.5px] text-fg-muted">
              {selectedCount > 0
                ? `click a person to hand them the ${selectedCount} selected`
                : "select work on the left first"}
            </p>
          </div>

          {notice && (
            <p className="border-b border-line bg-ok-bg px-4 py-2 text-[12.5px] font-semibold text-fg">{notice}</p>
          )}
          {error && (
            <div className="px-4 pt-2">
              <FormError message={error} />
            </div>
          )}

          {team.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-fg-muted">
              No active people on this org yet.
            </p>
          ) : (
            <ul>
              {team.map((p) => {
                const load = p.openTasks + p.prospects;
                return (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-inset text-[12px] font-bold text-fg-muted">
                      {p.initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-bold text-fg">{p.name}</p>
                      <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-fg-muted">
                        <span>
                          {p.openTasks} open · {p.prospects}{" "}
                          {p.prospects === 1 ? "prospect" : "prospects"}
                        </span>
                        {tagWorthShowing && load === min && (
                          <span className="rounded-[3px] border border-ok/50 px-1.5 py-px text-[10.5px] font-semibold text-ok">
                            lightest load
                          </span>
                        )}
                        {tagWorthShowing && load === max && (
                          <span className="rounded-[3px] border border-warn/60 px-1.5 py-px text-[10.5px] font-semibold text-warn">
                            heaviest load
                          </span>
                        )}
                      </p>
                    </div>
                    {/* SOLID BLUE IN ITS BASE STATE. It used to be disabled
                        whenever nothing was selected, which rendered it at
                        60% opacity — three washed-out buttons stacked down
                        the panel, reading as broken rather than as the
                        primary action. It is the primary action on this
                        panel, so it looks like one at all times.
                        With no selection it does the useful thing instead of
                        nothing: turns on select mode so you can pick. */}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        selectedCount === 0
                          ? setSelectMode(true)
                          : handOff(p.id, Array.from(selected), p.name)
                      }
                      title={selectedCount === 0 ? "Pick work on the left to hand to this person" : undefined}
                      className={`shrink-0 rounded-md px-3 py-2 text-[12.5px] font-bold transition-colors disabled:opacity-60 ${BTN_PRIMARY}`}
                    >
                      {pending ? "Assigning…" : `Assign ${selectedCount || ""}`.trim()}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <TaskComposer team={team} items={items} contacts={contacts} quickTasks={quickTasks} />
      </div>
    </div>
  );
}

/**
 * The small-ask composer. Every field here persists: crm_tasks carries
 * assigned_user_id, due_at and account_id, so Who / Due / On are real
 * columns, not decoration.
 *
 * "On" only offers companies that are already real accounts — an OTR entry
 * has no crm_accounts row until it is released, so there is nothing to point
 * a task at. Those items are still assignable on the left; they just can't be
 * the subject of a company-linked task yet.
 */
function TaskComposer({
  team,
  items,
  contacts,
  quickTasks,
}: {
  team: TeamMember[];
  items: WorkItem[];
  contacts: ComposerContact[];
  /** Live rows from crm_quick_tasks, already ordered by sort_order. */
  quickTasks: QuickTask[];
}) {
  const router = useRouter();
  const [taskEditPending, startTaskEdit] = useTransition();
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [who, setWho] = useState(team[0]?.id ?? "");
  // DUE DEFAULTS TO EMPTY (2026-08-26) — undated work lands in the agent's
  // Inbox on Workspace → Tasks and they plan it, matching what assignment
  // now does. A date is still allowed, for work that genuinely can't move.
  const [due, setDue] = useState("");
  const [accountId, setAccountId] = useState("");
  const [contactId, setContactId] = useState("");
  /** The BRIEF — why this task exists, what to walk in knowing. Stored in
   * crm_tasks.notes, which has always been the brief. */
  const [instructions, setInstructions] = useState("");
  /** The OUTCOME — "got a rate". The bar the close-out note gets checked
   * against once that standard lands. */
  const [doneWhen, setDoneWhen] = useState("");
  /** TWO STATES ONLY (Brent). crm_tasks.priority's vocabulary is
   * low/normal/high; the composer offers the two that carry meaning here —
   * due date already says WHEN, priority only has to say "does this jump
   * the queue". "low" stays valid in the column for tasks made elsewhere. */
  const [high, setHigh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const companies = useMemo(
    () =>
      // Every pooled item is a company now, so there is nothing to filter
      // out — this used to drop the OTR and BOL rows, which had no
      // crm_accounts id to point a task at.
      items
        .map((i) => ({ id: i.id, name: titleCaseWords(i.company) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [items],
  );

  /** The chosen company's own contacts. Plainly computed, not memoised:
   * the dependency would include `contacts`, and the list is small enough
   * that a filter per render is cheaper than the memo bookkeeping. */
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
        dueAt: due ? new Date(`${due}T12:00:00`).toISOString() : null,
        accountId: accountId || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const target = team.find((t) => t.id === who)?.name ?? "them";
      setSent(`Sent to ${target}.`);
      setTitle("");
      setDue("");
      setAccountId("");
      setContactId("");
      setInstructions("");
      setDoneWhen("");
      setHigh(false);
    });
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-[15px] font-bold tracking-tight text-fg">Or send them a task</h2>
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
      </div>

      <div className="flex flex-col gap-3 p-4">
        <div>
          <p className={LABEL}>Quick tasks — one click</p>

          {adding && (
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

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Who</span>
            <select value={who} onChange={(e) => setWho(e.target.value)} className={`w-full ${CONTROL_SIZE} ${CONTROL}`}>
              {team.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          {/* HIGH PRIORITY REQUIRES A DATE (Brent, 2026-08-26). "Urgent,
              whenever" is a contradiction — it tells the agent to drop
              everything for something with no deadline, which is how urgent
              stops meaning anything. Normal-priority work is unchanged: it
              stays optional and lands in their Inbox to plan. */}
          <label className="flex flex-col gap-1">
            <span className={LABEL}>{high ? "Due — required" : "Due"}</span>
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              aria-invalid={high && !due}
              className={`w-full ${CONTROL_SIZE} ${CONTROL} ${
                high && !due ? "border-bad" : ""
              }`}
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
            {pending ? "Sending…" : "Send it"}
          </button>
          <span className="text-[12px] text-fg-muted">
            {sent ??
              (high && !due
                ? "High priority needs a date — say when it’s needed."
                : due
                  ? "Lands on their board for that day."
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
    </Card>
  );
}
