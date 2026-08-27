"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { titleCaseWords } from "../../_shell/format";
import { deleteTask, reassignTask } from "../../tasks/actions";
import { Modal } from "../../_shell/Modal";
import { IconTrash } from "../../_shell/icons";
import { BTN_DANGER, BTN_NEUTRAL } from "../../_shell/ui";
import { dueLabel, dueTint } from "../../agent/agentWork";
import type { DueTaskRow } from "../dueReport";
import {
  assigneeIdForColumn,
  buildBoard,
  isRealMove,
  boardTotals,
  UNASSIGNED_KEY,
  type BoardColumn,
} from "./taskBoard";

/**
 * Admin -> Tasks — every open task in the org, one column per person.
 *
 * THIS IS AN ASSIGNMENT MECHANISM, not a report. Dragging a card to another
 * column writes crm_tasks.assigned_user_id through the shared task-write
 * path (../../tasks/actions.ts::reassignTask). It does NOT move the
 * company's owner — see that action's docstring for why the two directions
 * stay separate.
 *
 * TWO CALLS I MADE, not Brent's (both noted in the report):
 *   - Columns SCROLL INTERNALLY rather than truncating with "+N more" (the
 *     mockup's tail). All columns stay side by side and every card is
 *     reachable, which is what makes the board workable as a place to move
 *     work rather than a place to read about it. A "+N more" behind a click
 *     is not a drop target.
 *   - EVERY employee gets a column, zero tasks included. An empty column
 *     says who has room, and it is something you can aim a card at.
 *
 * Drag-and-drop is the plain HTML5 API — no new dependency. Cards carry the
 * task id in dataTransfer; the column is the drop target. Keyboard and
 * touch users are not left without a path: every card also has a "Move to"
 * <select> that runs the identical action.
 */
export function TasksBoard({
  tasks,
  team,
  now,
}: {
  tasks: DueTaskRow[];
  team: { id: string; name: string }[];
  /** Server clock — one instant for every label on the page. */
  now: number;
}) {
  const router = useRouter();
  const at = new Date(now);
  const columns = buildBoard(tasks, team, at);
  const totals = boardTotals(tasks, at);

  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const cardById = new Map(tasks.map((t) => [t.id, t]));

  function move(taskId: string, targetKey: string) {
    const card = cardById.get(taskId);
    if (!card || !isRealMove(card, targetKey)) return;
    setError(null);
    startTransition(async () => {
      const result = await reassignTask(taskId, assigneeIdForColumn(targetKey));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function onDrop(e: React.DragEvent, targetKey: string) {
    e.preventDefault();
    setOver(null);
    setDragging(null);
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) move(taskId, targetKey);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-[19px] font-bold tracking-tight text-fg">Tasks</h1>
          <p className="text-[13px] text-fg-muted">every task in the org, by who owns it</p>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <Stat value={totals.total} label="open" />
          <Stat value={totals.overdue} label="overdue" tone="bad" />
          <Stat value={totals.today} label="due today" tone="accent" />
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-bad/30 bg-bad-bg px-3 py-2 text-[12.5px] font-semibold text-bad">
          {error}
        </p>
      )}

      {/* The board scrolls SIDEWAYS as a whole when the org outgrows the
          viewport; each column scrolls DOWN on its own. Both are needed —
          horizontal alone would make a long column push the page height out,
          vertical alone would squash five columns into slivers. */}
      <div className="min-h-0 flex-1 overflow-x-auto pb-1">
        <div className="flex h-full min-h-[24rem] gap-3">
          {columns.map((col) => (
            <Column
              key={col.key}
              column={col}
              now={at}
              team={team}
              isOver={over === col.key}
              pending={pending}
              draggingId={dragging}
              onDragStart={setDragging}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(col.key);
              }}
              onDragLeave={() => setOver((k) => (k === col.key ? null : k))}
              onDrop={(e) => onDrop(e, col.key)}
              onPick={move}
            />
          ))}
        </div>
      </div>

      <p className="text-[12px] text-fg-subtle">
        Drag a card to another column to reassign it. Moving a task does not change who owns the
        company.
      </p>
    </div>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: "bad" | "accent" }) {
  const color = tone === "bad" ? "text-bad" : tone === "accent" ? "text-accent" : "text-fg";
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`text-[18px] font-bold leading-none ${value === 0 ? "text-fg-subtle" : color}`}>
        {value}
      </span>
      <span className="text-[12.5px] text-fg-muted">{label}</span>
    </span>
  );
}

function Column({
  column,
  now,
  team,
  isOver,
  pending,
  draggingId,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onPick,
}: {
  column: BoardColumn;
  now: Date;
  team: { id: string; name: string }[];
  isOver: boolean;
  pending: boolean;
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onPick: (taskId: string, targetKey: string) => void;
}) {
  const unassigned = column.key === UNASSIGNED_KEY;
  return (
    <section
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-label={`${column.name}, ${column.counts.total} open`}
      className={`flex w-[19rem] shrink-0 flex-col rounded-lg border transition-colors ${
        isOver ? "border-accent bg-accent-bg" : "border-line-strong bg-inset"
      }`}
    >
      <header className="flex items-center gap-2 px-3 py-2.5">
        {unassigned ? (
          <span className="rounded-[3px] border border-bad/50 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.07em] text-bad">
            Unassigned
          </span>
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card text-[11.5px] font-bold text-fg-muted">
            {column.initials}
          </span>
        )}
        <div className="min-w-0 flex-1">
          {!unassigned && (
            <p className="truncate text-[13.5px] font-bold text-fg">{column.name}</p>
          )}
          <p className="text-[12px] text-fg-muted">
            {column.counts.total} open
            {column.counts.overdue > 0 && (
              <span className="font-semibold text-bad"> · {column.counts.overdue} overdue</span>
            )}
          </p>
        </div>
      </header>

      {/* Internally scrolling, NOT truncated — see the component docstring. */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
        {column.cards.length === 0 ? (
          <p className="px-1 py-6 text-center text-[12px] text-fg-subtle">
            {unassigned ? "Everything has an owner." : "Nothing on their plate."}
          </p>
        ) : (
          column.cards.map((card) => (
            <TaskCard
              key={card.id}
              card={card}
              now={now}
              team={team}
              columnKey={column.key}
              assigneeName={column.name}
              pending={pending}
              isDragging={draggingId === card.id}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onPick={onPick}
            />
          ))
        )}
      </div>
    </section>
  );
}

function TaskCard({
  card,
  now,
  team,
  columnKey,
  assigneeName,
  pending,
  isDragging,
  onDragStart,
  onDragEnd,
  onPick,
}: {
  card: DueTaskRow;
  now: Date;
  team: { id: string; name: string }[];
  columnKey: string;
  /** Whose column this card is sitting in. Named in the confirm, because
   * "delete this task" and "take this task off Sarah" are different
   * sentences and only one of them is what an admin is actually doing. */
  assigneeName: string;
  pending: boolean;
  isDragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onPick: (taskId: string, targetKey: string) => void;
}) {
  const tint = dueTint(card.dueAt, now);
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [removing, startRemoving] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /* Reuses tasks/actions.ts deleteTask — the same SOFT delete (deleted_at)
     the agent's own task row has always used, so a task an admin removes
     is recoverable exactly like any other and the row stays in the table
     for the accountability work. No second delete path was written. */
  function remove() {
    setError(null);
    startRemoving(async () => {
      const res = await deleteTask(card.id, card.accountId);
      if (res.ok) {
        setConfirm(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", card.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(card.id);
      }}
      onDragEnd={onDragEnd}
      className={`group relative cursor-grab rounded-[5px] border border-line bg-card p-2.5 shadow-e1 transition-opacity active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      } ${tint === "late" ? "border-l-[3px] border-l-bad" : ""}`}
    >
      {/* ADMIN-ONLY REMOVAL, top right. It is small because it sits on a
          drag handle and must not become the thing you grab, and it is
          always in the DOM rather than hover-revealed so it is reachable
          by keyboard and on touch. `draggable={false}` keeps a press on
          the icon from starting a card drag instead. */}
      <button
        type="button"
        draggable={false}
        onClick={() => setConfirm(true)}
        disabled={pending || removing}
        aria-label={`Delete task "${card.title}"`}
        title="Delete this task"
        className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-[4px] text-bad/70 transition-colors hover:bg-bad-bg hover:text-bad focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bad/40 disabled:opacity-40"
      >
        <IconTrash width={15} height={15} />
      </button>

      {/* pr-7 keeps a long title from running under the button above. */}
      <p className="flex items-start gap-1.5 pr-7 text-[13px] font-bold leading-snug text-fg">
        {/* The same quiet dot the agent surfaces use, so "high priority"
            looks like one thing across the CRM rather than three. */}
        {card.isHigh && (
          <span
            aria-label="High priority"
            title="High priority"
            className="mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full bg-bad"
          />
        )}
        <span className="min-w-0">{card.title}</span>
      </p>
      {card.accountId && card.companyName ? (
        <Link
          href={`/crm/accounts/${card.accountId}`}
          prefetch={false}
          draggable={false}
          className="mt-0.5 block truncate text-[12px] font-semibold text-accent hover:underline"
        >
          {titleCaseWords(card.companyName)}
        </Link>
      ) : (
        <p className="mt-0.5 text-[12px] text-fg-subtle">No company</p>
      )}
      <div className="mt-1.5 flex items-center gap-2">
        <span
          className={`inline-flex rounded-[3px] px-1.5 py-0.5 text-[11px] font-bold ${
            tint === "late"
              ? "bg-bad-bg text-bad"
              : tint === "now"
                ? "bg-accent-bg text-accent"
                : "text-fg-muted"
          }`}
        >
          {dueLabel(card.dueAt, now)}
        </span>
        {/* The non-drag path. Always in the DOM (not hover-revealed) so it is
            reachable by keyboard and on touch, where dragging is unreliable —
            a board whose only assignment mechanism needs a mouse is a board
            half the org cannot use. */}
        <select
          value={columnKey}
          disabled={pending}
          onChange={(e) => onPick(card.id, e.target.value)}
          aria-label={`Move "${card.title}" to someone else`}
          className="ml-auto max-w-[8.5rem] shrink-0 rounded-[4px] border border-line bg-card px-1 py-0.5 text-[11px] font-semibold text-fg-muted disabled:opacity-60"
        >
          <option value={UNASSIGNED_KEY}>Unassigned</option>
          {team.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {confirm && (
        <Modal
          open
          onClose={() => !removing && setConfirm(false)}
          busy={removing}
          title="Delete task"
        >
          <p className="text-[13.5px] leading-relaxed text-fg">
            Delete <span className="font-semibold">{card.title}</span>
            {columnKey === UNASSIGNED_KEY ? (
              <>, which nobody owns yet? It comes off the board straight away.</>
            ) : (
              <>
                {" "}
                from <span className="font-semibold">{assigneeName}</span>&rsquo;s list? It stops
                showing on their board straight away.
              </>
            )}
          </p>
          {error && (
            <p className="mt-3 rounded-md border border-bad/30 bg-bad-bg px-2.5 py-1.5 text-[12px] font-semibold text-bad">
              {error}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirm(false)}
              disabled={removing}
              className={`rounded-md px-3.5 py-2 text-[13px] font-semibold transition-colors ${BTN_NEUTRAL}`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={removing}
              className={`rounded-md px-3.5 py-2 text-[13px] font-semibold transition-colors ${BTN_DANGER}`}
            >
              {removing ? "Deleting\u2026" : "Delete task"}
            </button>
          </div>
        </Modal>
      )}
    </article>
  );
}
