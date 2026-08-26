"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, BTN_PRIMARY, BTN_NEUTRAL, BTN_EDIT } from "../_shell/ui";
import { FormError } from "../_shell/form";
import { CONTROL, CONTROL_SIZE, LABEL } from "../_shell/compactForm";
import { SegmentedTabs } from "../_shell/SegmentedTabs";
import { titleCaseWords } from "../_shell/format";
import { assignWork, sendTask } from "./assign-actions";
import { DEFAULT_QUICK_TASKS, isDuplicateQuickTask, normalizeQuickTask } from "./quickTasks";
import type { TeamMember } from "./assign-data";
import {
  ASSIGN_FALLBACK_NOTE,
  countBySource,
  itemHref,
  itemKey,
  itemOpenLabel,
  matchesFilter,
  partitionBySource,
  sortByLongestWaiting,
  splitEvenly,
  SOURCE_LABEL,
  SOURCE_TONE,
  waitingLabel,
  waitingUrgency,
  WORK_FILTERS,
  type WorkFilterKey,
  type WorkItem,
} from "./workItem";

/**
 * Admin → Overview. ONE job: handing work out.
 *
 * Left, everything in the org that nobody owns, pooled across three tables
 * and sorted longest-waiting first. Right, the people it can go to. Below
 * that, a composer for the small asks that aren't a whole company.
 *
 * There is deliberately no metric tile, no activity feed and no per-person
 * performance number on this page. The only number attached to a person is
 * their current load, and it is there to answer "who has room" — not to
 * report on them.
 */
export function AssignBoard({
  items,
  team,
  now,
}: {
  items: WorkItem[];
  team: TeamMember[];
  now: number;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<WorkFilterKey>("all");
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

  const sorted = useMemo(() => sortByLongestWaiting(items), [items]);
  const counts = useMemo(() => countBySource(items), [items]);
  const visible = useMemo(() => sorted.filter((i) => matchesFilter(i, filter)), [sorted, filter]);

  const visibleKeys = visible.map(itemKey);
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

  /** Select-all applies to what's ON SCREEN, not the whole pool — ticking a
   * header box while a filter is active must never quietly select rows the
   * filter is hiding. */
  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleKeys.forEach((k) => next.delete(k));
      else visibleKeys.forEach((k) => next.add(k));
      return next;
    });
  }

  const { ownable, taskOnly } = partitionBySource(items, selected);
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
      <Card className="flex max-h-[calc(100vh-7rem)] flex-col">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-[15px] font-bold tracking-tight text-fg">Work to assign</h2>
          <p className="text-[12.5px] text-fg-muted">
            {items.length} {items.length === 1 ? "item" : "items"} with nobody on them
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <SegmentedTabs
            ariaLabel="Work source"
            items={WORK_FILTERS.map((f) => ({
              key: f.key,
              label: f.label,
              active: filter === f.key,
              onSelect: () => setFilter(f.key),
              count: counts[f.key],
              // "All" aggregates the others rather than owning work, so it
              // never carries a dot; the per-source tabs do, when non-zero.
              countNeedsAttention: f.key !== "all",
            }))}
          />
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
            <p className="mt-0.5 text-[12.5px] text-fg-muted">
              {filter === "all"
                ? "Everything in the org has an owner."
                : `No ${SOURCE_LABEL[filter as Exclude<WorkFilterKey, "all">]} items need attention right now.`}
            </p>
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
                  const key = itemKey(item);
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
                        <span
                          className={`inline-flex rounded-[4px] border px-1.5 py-0.5 text-[11px] font-semibold ${SOURCE_TONE[item.source]}`}
                        >
                          {SOURCE_LABEL[item.source]}
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
                            {itemOpenLabel(item.source)} &rsaquo;
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

          {taskOnly.length > 0 && (
            <p className="border-t border-line bg-inset px-4 py-2 text-[11.5px] text-fg-muted">
              {ownable.length > 0
                ? `${ownable.length} of these can be owned outright. `
                : "None of these can be owned outright. "}
              {ASSIGN_FALLBACK_NOTE}
            </p>
          )}
        </Card>

        <TaskComposer team={team} items={items} />
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
function TaskComposer({ team, items }: { team: TeamMember[]; items: WorkItem[] }) {
  const [title, setTitle] = useState("");
  /**
   * SESSION-ONLY. Seeded from DEFAULT_QUICK_TASKS; adds and deletes live here
   * and nowhere else, because there is no approved place to put them yet.
   * When a store exists this becomes the fetched list and these two handlers
   * become server actions — the UI does not change. See quickTasks.ts.
   */
  const [quickTasks, setQuickTasks] = useState<string[]>([...DEFAULT_QUICK_TASKS]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [who, setWho] = useState(team[0]?.id ?? "");
  const [due, setDue] = useState("");
  const [accountId, setAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const companies = useMemo(
    () =>
      items
        .filter((i) => i.source === "prospect")
        .map((i) => ({ id: i.id, name: titleCaseWords(i.company) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [items],
  );

  function addQuickTask() {
    const label = normalizeQuickTask(draft);
    if (!label) {
      setAddError("Give the button a label.");
      return;
    }
    if (isDuplicateQuickTask(quickTasks, label)) {
      setAddError(`"${label}" is already there.`);
      return;
    }
    setQuickTasks((prev) => [...prev, label]);
    setDraft("");
    setAddError(null);
  }

  function removeQuickTask(label: string) {
    setQuickTasks((prev) => prev.filter((q) => q !== label));
    // Clearing a button that is currently the composer's title would leave a
    // selected-looking state with nothing selected.
    setTitle((t) => (t === label ? "" : t));
  }

  function send() {
    setError(null);
    setSent(null);
    startTransition(async () => {
      const result = await sendTask({
        title,
        assignedUserId: who,
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
                onKeyDown={(e) => e.key === "Enter" && addQuickTask()}
                placeholder="e.g. Ask about their reefer volume"
                aria-label="New quick task"
                className={`min-w-0 flex-1 ${CONTROL_SIZE} ${CONTROL}`}
              />
              <button
                type="button"
                onClick={addQuickTask}
                className={`rounded-md px-3 py-2 text-[12.5px] font-bold transition-colors ${BTN_PRIMARY}`}
              >
                Add
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
              <div key={q} className="relative">
                <button
                  type="button"
                  onClick={() => (editing ? removeQuickTask(q) : setTitle(q))}
                  className={`w-full rounded-[5px] border border-accent px-2.5 py-1.5 text-center text-[12.5px] font-semibold text-white transition-colors ${
                    title === q && !editing
                      ? "bg-accent-hover ring-2 ring-accent/40"
                      : "bg-accent hover:bg-accent-hover"
                  }`}
                  title={editing ? `Remove "${q}"` : undefined}
                >
                  {q}
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
              Click a button to remove it. Changes last for this session only — see below.
            </p>
          )}
          {/* Said plainly on screen, not just in a commit message: this is
              the one part of the panel that does not survive a reload. */}
          <p className="mt-1.5 text-[11.5px] text-warn">
            Custom quick tasks aren&rsquo;t saved yet — they reset on reload and aren&rsquo;t shared with the
            team. Needs a place to store them.
          </p>
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
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Due</span>
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className={`w-full ${CONTROL_SIZE} ${CONTROL}`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>On</span>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
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

        <FormError message={error} />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={send}
            disabled={pending || !title.trim() || !who}
            className={`rounded-md px-3.5 py-2 text-[13px] font-bold transition-colors disabled:pointer-events-none disabled:opacity-50 ${BTN_PRIMARY}`}
          >
            {pending ? "Sending…" : "Send it"}
          </button>
          <span className="text-[12px] text-fg-muted">
            {sent ?? "Lands in their queue immediately."}
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
