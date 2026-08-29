"use client";

import { useState, useTransition, type ReactNode } from "react";
import { BTN_CREATE } from "../../../../_shell/ui";
import { useRouter } from "next/navigation";
import { logCall } from "../../../../calls/actions";
import {
  GOT_THROUGH_OUTCOMES,
  RESULT_OUTCOMES,
  RESULT_ROW_REQUIRES,
} from "../../../../calls/outcomes";
import { detectDate, draftFollowupTitle, warrantsFollowup, type DetectedDate } from "../../../../calls/followupDraft";
import { TASK_DAY_START, defaultTaskDueDateInput } from "../../../../tasks/snooze";
import { addNote } from "../../../actions";
import { readDraft, writeDraft, clearDraft, isRestorable } from "./composerDraft";
import { createTask } from "../../../../tasks/actions";
import type { QuickTask } from "../../../../admin/quick-task-actions";
import {
  SELECTABLE_LIFECYCLE_STAGES,
  normalizeStage,
  stageNeedsReason,
  LIFECYCLE_LABEL,
  type LifecycleStage,
} from "../../../lifecycle";
import { updateLifecycleStatus } from "../../../actions";

/**
 * "WHAT HAPPENED" — the composer, and the reason this page exists.
 *
 * Everything above and below it is a read. This is the one place you write,
 * and the design gives it the full width at the top of the page because
 * logging what just happened is the job.
 *
 * ── THE ONE-CLICK ROW ─────────────────────────────────────────────────
 *
 * Five buttons, each of which SAVES ON CLICK. No Save button, no dialog, no
 * confirmation step — you type what they said (or don't) and hit the outcome.
 * The vocabulary and the short labels come from calls/outcomes.ts so a call
 * logged here is the same crm_calls row as one logged from the full dialog,
 * and the timeline cannot tell them apart.
 *
 * ── "ADVANCE STAGE AFTER SAVING" ──────────────────────────────────────
 *
 * Ticked, the call saves and the company moves to the NEXT stage in the
 * funnel. It is deliberately "next", not a picker: the whole point is that
 * it costs one tick rather than a second decision.
 *
 * IT REFUSES TO CARRY A COMPANY INTO LOST OR DISQUALIFIED. Both need a
 * reason, and a checkbox has nowhere to put one — the write would be
 * rejected by the server after the call had already saved, leaving a rep who
 * ticked a box looking at a company that did not move and no explanation.
 * At the end of the funnel the tick is disabled and says why. Moving to a
 * terminal stage is what the stage strip above is for.
 *
 * ── WHAT IS NOT HERE ──────────────────────────────────────────────────
 *
 * The contact dropdown lists real crm_contacts rows. When a company has
 * NOBODY on file — which is the majority; Fritz Industries has zero — it
 * does not render a fake person, it renders the honest state and a link to
 * add one. The call still logs against the company.
 */

type Mode = "call" | "note" | "task";

/** Button treatment per outcome weight. Exactly one filled — the outcome a
 * rep is trying for — so the row has a target rather than five equal blues. */
/* ════ THE THREE COLOURS OF THIS PANEL ════════════════════════════════
   Brent, 2026-08-28: "green is the 'selected' so blue buttons, green
   selected, red 'save the call', red 'save note'."

     BLUE  (--accent #2f5fd6)  you can pick this
     GREEN (--ok     #0f7a4e)  you picked it
     RED   (--bad    #ad2a2a)  this writes the record

   ALL THREE ARE FILLED, never outlines. Four earlier colour passes were
   rejected because a "blue" button drawn as a border on a tinted panel
   reads as grey — the fill is the whole point, so every state below sets
   a background and white text rather than a border and coloured ink.

   The semantic outcome colours are gone with this change: "Bad number"
   used to be red and "Reached" green REGARDLESS of selection. Red now
   means "this button saves", so an outcome cannot also be red, and green
   now means "chosen", so an outcome cannot be green while unpicked. One
   vocabulary, three words. */
const PICKABLE =
  "border-accent bg-accent text-white hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

/* Selected. A different HUE and a ring, not a border tweak — the change
   has to be obvious across the room, not on inspection. */
const PICKED =
  "border-ok bg-ok text-white ring-2 ring-ok/35 hover:bg-ok/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ok/50";

/* The commit action. BTN_CREATE -- the shared "this makes a record" token,
   the same one "+ person" and the dashboard's Add buttons use. Was a
   copy of that string until 2026-08-29. */
const COMMIT = BTN_CREATE;

/**
 * A STEP, not a label. The four things a call is — got through, how it
 * went, what next, save — used to be four identical grey micro-captions,
 * so the panel read as a form of equal-weight controls instead of a
 * sequence. A numbered marker and a real heading make the order legible
 * without a word of explanation. The marker goes GREEN once its step is
 * answered, the same green a picked button uses.
 */
function Step({ n, children, done }: { n: number; children: ReactNode; done?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-extrabold crm-num ${
          done ? "bg-ok text-white" : "bg-inset text-fg-subtle"
        }`}
      >
        {n}
      </span>
      <span className="text-[12.5px] font-bold tracking-[-0.01em] text-fg">{children}</span>
    </div>
  );
}

export function WhatHappened({
  accountId,
  contacts,
  stage,
  quickTasks,
  taskOwnerLabel,
}: {
  accountId: string;
  contacts: { id: string; name: string; phoneLabel: string | null }[];
  stage: string;
  /* The admin's curated quick tasks, THREADED FROM THE SERVER PAGE rather
     than fetched here.

     The first cut loaded them with a server action when Task mode opened,
     the way ContactDialog loads a company's sites. It works, but every
     server action in this CRM runs requireCrmUser(), which REDIRECTS to
     /crm/login when the session has lapsed — and a redirect returned from
     a server action navigates the whole page. A rep who had typed a task
     and clicked the tab would land on the sign-in screen with their text
     gone, and would report it, if at all, as "the CRM is broken".

     Passing the data down costs four components a prop and removes the
     failure entirely: nothing in this panel calls the server until the
     rep presses save, which is the moment they expect a round trip. */
  quickTasks: QuickTask[];
  /** WHO A TASK MADE HERE WILL BELONG TO. Null when the viewer owns this
   * company — see the line's own note for why that case says nothing. */
  taskOwnerLabel: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  /* A DRAFT SURVIVING FROM LAST TIME. Read once, lazily, at mount: a
     session bounce, a closed tab or a crash all unmount this component, and
     without this whatever was typed is gone for good (see composerDraft.ts,
     and the note Tyler lost on 2026-08-28). */
  const restored = useState(() => {
    const d = readDraft(accountId);
    return isRestorable(d, Date.now()) ? d : null;
  })[0];

  const [mode, setMode] = useState<Mode>(restored?.mode ?? "call");
  const [text, setText] = useState(restored?.text ?? "");
  const [restoredNotice, setRestoredNotice] = useState(restored !== null);
  const [contactId, setContactId] = useState<string>(contacts[0]?.id ?? "");
  const [advance, setAdvance] = useState(false);

  /* ── THE TWO ANSWERS, and what they reveal ────────────────────────
     `gotThrough` is the connection (crm_calls.outcome). `result` is what
     came of it (crm_calls.disposition) and does not exist until the first
     answer says somebody picked up — you cannot have a result from a
     voicemail. */
  const [gotThrough, setGotThrough] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  /* The follow-up. `detected` is what the note appeared to say; it is
     stored so the chip can render it SELECTED and visible rather than
     applying a date nobody saw. Computed in event handlers, never during
     render — the React Compiler forbids reading the clock there. */
  const [detected, setDetected] = useState<DetectedDate | null>(null);
  const [followupDate, setFollowupDate] = useState<string>("");
  const [followupTitle, setFollowupTitle] = useState<string>("");
  /* Once the rep edits the title we stop rewriting it under them. */
  const [titleTouched, setTitleTouched] = useState(false);
  /* Whether the box has the caret right now. Paired with titleTouched it
     is what lets the drafted title step aside on click without being
     destroyed — see the input's own note. */
  const [titleFocused, setTitleFocused] = useState(false);
  /* THE TASK TAB'S DUE DATE. Defaults to tomorrow 08:00 Central and is on
     screen before the task saves, so the date is one somebody saw rather
     than one the system applied quietly. Lazily initialised: the React
     Compiler forbids reading the clock during render, and this runs once. */
  const [taskDue, setTaskDue] = useState<string>(() => defaultTaskDueDateInput());
  /* Same for the date. Until the rep picks a day themselves, the DATE
     BELONGS TO THE DETECTOR — which means the detector can also take it
     back when the words it read are no longer there. Without this the
     reading outlived its own sentence: clear "call him back tuesday" and
     the chip vanished but 1 Sep stayed silently in the date field, with
     nothing in the row selected to show for it, and a task was still
     created on save. */
  const [dateTouched, setDateTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const active = normalizeStage(stage);
  const order = SELECTABLE_LIFECYCLE_STAGES as readonly LifecycleStage[];
  const nextStage: LifecycleStage | null = order[order.indexOf(active) + 1] ?? null;
  // The tick is only offered where it can actually be honoured.
  const canAdvance = nextStage !== null && !stageNeedsReason(nextStage);

  /** Every keystroke, straight to local storage. Cheap, synchronous, and
     guarded — a storage failure must never stop somebody typing. */
  function rememberText(next: string) {
    setText(next);
    setRestoredNotice(false);
    if (next.trim()) writeDraft(accountId, { mode, text: next, savedAt: Date.now() });
    else clearDraft(accountId);
  }

  /** Everything the composer was holding, back to empty. */
  function resetComposer() {
    // The work is on the server now, so the local copy has done its job.
    clearDraft(accountId);
    setRestoredNotice(false);
    setText("");
    setGotThrough(null);
    setResult(null);
    setDetected(null);
    setFollowupDate("");
    setFollowupTitle("");
    setTitleTouched(false);
    setTitleFocused(false);
    setTaskDue(defaultTaskDueDateInput());
    setDateTouched(false);
  }

  function done(res: { ok: boolean; error?: string }) {
    if (!res.ok) {
      setError(res.error ?? "That did not save.");
      return;
    }
    resetComposer();
    setError(null);
    router.refresh();
  }

  /**
   * Re-draft from the note and the outcome, unless the rep has typed their
   * own title. Runs in event handlers only — detectDate reads the clock and
   * the React Compiler forbids that during render.
   */
  function redraft(note: string, outcome: string | null) {
    const found = detectDate(note, new Date());
    setDetected(found);
    if (!titleTouched) setFollowupTitle(draftFollowupTitle(note, outcome, found));
    /* The detected date is PRE-SELECTED, and the chip renders it visibly.
       It is also RETRACTED when the note stops saying it — a reading must
       not outlive the words it was read from. A day the rep picked
       themselves is theirs and is never touched here. */
    if (!dateTouched) setFollowupDate(found ? found.date : "");
  }

  function pickGotThrough(value: string) {
    setError(null);
    setGotThrough(value);
    // Changing the connection answer invalidates a result that no longer
    // applies — "Wants a quote" cannot survive switching to "No answer".
    const nextResult = value === RESULT_ROW_REQUIRES ? result : null;
    if (nextResult !== result) setResult(nextResult);
    redraft(text, nextResult ?? value);
  }

  function pickResult(value: string) {
    setError(null);
    setResult(value);
    redraft(text, value);
  }

  /** The outcome the follow-up is drafted from: the result when there is
   * one, otherwise the connection answer. */
  const effectiveOutcome = result ?? gotThrough;
  const showFollowup = warrantsFollowup(effectiveOutcome);

  /** One-tap timings. Computed here rather than in render for the same
   * clock reason; `useMemo` would be recomputed per render anyway, so this
   * is a plain function called from the chips' own render path with a
   * stable base date captured once per interaction. */
  const followupChips = buildChips(detected);

  /** One click on an outcome = one saved call, the outcome, and the task. */
  function saveCall() {
    if (!gotThrough) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("outcome", gotThrough);
      if (result) fd.set("disposition", result);
      if (followupDate) {
        fd.set("followup_required", "on");
        fd.set("reminder_date", followupDate);
        if (followupTitle.trim()) fd.set("followup_title", followupTitle.trim());
      }
      fd.set("account_mode", "existing");
      fd.set("account_id", accountId);
      if (contactId) {
        fd.set("contact_mode", "existing");
        fd.set("contact_id", contactId);
      } else {
        fd.set("contact_mode", "none");
      }
      if (text.trim()) fd.set("summary", text.trim());

      const res = await logCall(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }

      // The stage move is a SECOND write and is reported separately — the
      // call is already saved, so a failure here must not read as "nothing
      // happened".
      if (advance && canAdvance && nextStage) {
        const moved = await updateLifecycleStatus(accountId, nextStage);
        if (!moved.ok) {
          // The CALL saved. Clear the composer for the same reason a
          // success does — leaving the outcome and a detected follow-up
          // on screen invites logging the whole thing twice.
          resetComposer();
          setError(`Call saved, but the stage did not move: ${moved.error}`);
          router.refresh();
          return;
        }
        setAdvance(false);
      }
      done({ ok: true });
    });
  }

  function saveNote() {
    if (!text.trim()) {
      setError("Write something first.");
      return;
    }
    setError(null);
    startTransition(async () => done(await addNote(accountId, text.trim(), false)));
  }

  function saveTask() {
    if (!text.trim()) {
      setError("Give the task a title.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("title", text.trim());
      fd.set("account_id", accountId);
      if (contactId) fd.set("contact_id", contactId);
      // createTask reads due_at as a Central datetime-local string. Empty
      // means the rep cleared it deliberately, which stays legal.
      if (taskDue) fd.set("due_at", `${taskDue}T${TASK_DAY_START}`);
      done(await createTask(fd));
    });
  }

  const placeholder =
    mode === "call" ? "What did they say?" : mode === "note" ? "What do we now know?" : "What needs doing?";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-2 pt-3">
        {/* Who this is about. Real rows only. */}
        {contacts.length > 0 ? (
          <label className="relative">
            <span className="sr-only">Who</span>
            <select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              disabled={pending}
              className="appearance-none rounded-md border border-line-strong bg-card py-2 pl-6 pr-7 text-[12.5px] font-semibold text-fg outline-none focus:border-accent disabled:opacity-60"
            >
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.phoneLabel ? ` · ${c.phoneLabel}` : ""}
                </option>
              ))}
              <option value="">Nobody in particular</option>
            </select>
            <span
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-warn"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[8px] text-fg-subtle"
            >
              ▼
            </span>
          </label>
        ) : (
          /* THE DASH STAYS — it is the app's own mark for a fixable
             blank (see the "+ phone" slot on the company profile), so it
             is carrying meaning, not decoration. Only the colour moves.
             It is a step DARKER than the inputs beside it rather than the
             same, because a dashed border reads lighter than a solid one
             at the same value: matching the token would not have matched
             the appearance. --line-strong is the top of the border scale,
             so this borrows the next real token down the neutral ramp
             rather than inventing a hex. */
          <span className="rounded-md border border-dashed border-fg-subtle px-2.5 py-2 text-[12px] text-fg-subtle">
            Nobody on file
          </span>
        )}

        {/* Three-way mode toggle, active one dark. */}
        <div className="flex overflow-hidden rounded-md border border-line">
          {(["call", "note", "task"] as Mode[]).map((m, i) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              disabled={pending}
              aria-pressed={mode === m}
              className={`px-4 py-2 text-[12.5px] font-bold transition-colors ${i > 0 ? "border-l border-line" : ""} ${
                mode === m ? "bg-fg text-white" : "bg-card text-fg hover:bg-inset"
              }`}
            >
              {m === "call" ? "Log a call" : m === "note" ? "Note" : "Task"}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pb-1">
        <input
          value={text}
          onChange={(e) => {
            rememberText(e.target.value);
            // A note or a task is not a call. Typing in those modes must
            // not drive the call's date detection, or switching back shows
            // a follow-up read out of somebody's meeting notes.
            if (mode === "call" && gotThrough) redraft(e.target.value, effectiveOutcome);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && mode !== "call") {
              e.preventDefault();
              if (mode === "note") saveNote();
              else saveTask();
            }
          }}
          placeholder={placeholder}
          disabled={pending}
          className="w-full rounded-md border border-line-strong bg-card px-3 py-2.5 text-[13px] text-fg outline-none placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
        />
      </div>

      {mode === "call" ? (
        <div className="flex flex-col gap-3 px-4 pb-3.5 pt-2">
          {/* STEP 1 — the connection. */}
          <div>
            <Step n={1} done={Boolean(gotThrough)}>Did you get through?</Step>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {GOT_THROUGH_OUTCOMES.map((o) => {
                const on = gotThrough === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => pickGotThrough(o.value)}
                    disabled={pending}
                    className={`rounded-md border px-3.5 py-2 text-[12.5px] font-bold transition-all disabled:opacity-55 ${
                      on ? PICKED : PICKABLE
                    }`}
                  >
                    {o.short}
                  </button>
                );
              })}
            </div>
          </div>

          {/* STEP 2 — only once somebody actually picked up. You cannot have
              a result from a voicemail. */}
          {gotThrough === RESULT_ROW_REQUIRES && (
            <div>
              <Step n={2} done={Boolean(result)}>How did it go?</Step>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {RESULT_OUTCOMES.map((o) => {
                  const on = result === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => pickResult(o.value)}
                      disabled={pending}
                      className={`rounded-md border px-3.5 py-2 text-[12.5px] font-bold transition-all disabled:opacity-55 ${
                        on ? PICKED : PICKABLE
                      }`}
                    >
                      {o.short}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 3 - what happens next, once an outcome makes one sensible. */}
          {showFollowup && (
            <div className="border-t border-line pt-3">
              <Step n={3} done={Boolean(followupDate)}>What next?</Step>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {/* THE PREFILL GETS OUT OF THE WAY — Brent, 2026-08-28:
                    "follow up prefills into the whats next box. remove
                    those words when it is clicked on."

                    It clears by NOT BEING SHOWN while the box is focused
                    and still untouched, rather than by being wiped. The
                    difference matters in three places:

                      · click in on the untouched draft -> the box is empty
                        and the placeholder shows, so he types over nothing
                      · click in AFTER typing -> titleTouched is true, so
                        his own text is shown and never cleared
                      · click in, type nothing, click away -> the draft was
                        never destroyed, so it simply reappears, and the
                        task still saves with its proper name instead of a
                        blank one bought by a stray click

                    followupTitle stays the single source of truth
                    throughout; this only decides what is on screen. */}
                <input
                  value={titleFocused && !titleTouched ? "" : followupTitle}
                  onFocus={() => setTitleFocused(true)}
                  onBlur={() => setTitleFocused(false)}
                  onChange={(e) => {
                    setTitleTouched(true);
                    setFollowupTitle(e.target.value);
                  }}
                  placeholder="What needs doing next?"
                  aria-label="Follow-up title"
                  disabled={pending}
                  className="min-w-0 flex-1 basis-56 rounded-md border border-line-strong bg-card px-3 py-2 text-[12.5px] text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
                />

                {followupChips.map((c) => {
                  const on = followupDate === c.date;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => {
                        setDateTouched(true);
                        setFollowupDate(c.date);
                      }}
                      disabled={pending}
                      /* IT NOTICES, IT NEVER DECIDES - and the noticing is
                         now carried by the chip itself. A reading taken
                         from the note wears a marker and an accent tint in
                         BOTH states, so it is identifiable before it is
                         chosen and still identifiable after. Nothing is
                         applied silently or unseen; a wrong read is still
                         one tap to correct. */
                      title={c.fromNote ? `Read from your note: \u201c${c.label}\u201d` : undefined}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-[12px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-55 ${
                        on ? PICKED : PICKABLE
                      }`}
                    >
                      {c.fromNote && (
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-white"
                        />
                      )}
                      {c.label}
                      {c.fromNote && <span className="sr-only"> &mdash; read from your note</span>}
                    </button>
                  );
                })}

                <label className="flex items-center gap-1.5 text-[12px] text-fg-subtle">
                  <span className="sr-only">Pick a date</span>
                  <input
                    type="date"
                    value={followupDate}
                    onChange={(e) => {
                      setDateTouched(true);
                      setFollowupDate(e.target.value);
                    }}
                    disabled={pending}
                    className="rounded-md border border-line-strong bg-inset px-2 py-1.5 text-[12px] text-fg outline-none focus:border-accent disabled:opacity-60"
                  />
                </label>

                {/* A REAL OPTION, not a text link that only exists once you
                    have already picked a day. "No follow-up" is one of the
                    answers to "what next?", so it sits in the row with the
                    others and shows as chosen when it is. */}
                <button
                  type="button"
                  onClick={() => {
                    // Dismissing a follow-up has to STICK — otherwise the
                    // next keystroke re-applies the date they just declined.
                    setDateTouched(true);
                    setFollowupDate("");
                  }}
                  disabled={pending}
                  aria-pressed={!followupDate}
                  className={`rounded-md border px-3 py-2 text-[12px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-55 ${
                    followupDate ? PICKABLE : PICKED
                  }`}
                >
                  No follow-up
                </button>
              </div>
            </div>
          )}

          {/* STEP 4 - one save writes the call, the outcome and the task. */}
          <div className="border-t border-line pt-3">
            <Step n={4}>Save it</Step>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={saveCall}
                disabled={pending || !gotThrough}
                className={`rounded-md px-5 py-2.5 text-[13.5px] font-bold shadow-sm transition-colors disabled:pointer-events-none disabled:opacity-40 ${COMMIT}`}
              >
                {pending ? "Saving\u2026" : "Save the call"}
              </button>

              {/* Subordinate to the save, and only as loud as it needs to
                  be: a tick, not a second decision. */}
              <label
                className={`flex items-center gap-2 text-[12px] ${
                  canAdvance ? "text-fg-muted" : "cursor-not-allowed text-fg-subtle"
                }`}
                title={
                  canAdvance && nextStage
                    ? `Moves this company to ${LIFECYCLE_LABEL[nextStage]}`
                    : nextStage
                      ? `${LIFECYCLE_LABEL[nextStage]} needs a reason \u2014 use the stage strip`
                      : "This company is already at the end of the funnel"
                }
              >
                <input
                  type="checkbox"
                  checked={advance && canAdvance}
                  disabled={pending || !canAdvance}
                  onChange={(e) => setAdvance(e.target.checked)}
                  className="h-3.5 w-3.5 accent-accent"
                />
                advance stage after saving
                {canAdvance && nextStage && (
                  <span className="font-semibold text-fg">&rarr; {LIFECYCLE_LABEL[nextStage]}</span>
                )}
              </label>
            </div>
          </div>
        </div>
      ) : (
        /* THE TASK PRESETS RUN ALONG THE BOTTOM, on the same line as the
           action — Brent, 2026-08-28: "i want the list of blue task buttons
           running along the button where create task lays. i want create
           task to be red just like the + person button on company profiles."

           These are the SAME quick tasks the admin task maker offers
           (admin/quick-task-actions.ts), loaded rather than re-authored:
           Brent curates that list in one place and a second hard-coded copy
           here is how the two drift apart. Loaded on entering Task mode,
           the way ContactDialog loads a company's sites when it opens,
           rather than threading a prop down four components for a tab most
           visits never open.

           They WRAP rather than truncate — this panel sits in a 380px
           column and a preset whose label is cut in half is not a preset. */
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3.5 pt-2">
          <button
            type="button"
            onClick={mode === "note" ? saveNote : saveTask}
            disabled={pending || !text.trim()}
            className={`shrink-0 rounded-md px-3.5 py-2 text-[12.5px] font-bold transition-colors disabled:opacity-55 ${COMMIT}`}
          >
            {pending ? "Saving…" : mode === "note" ? "Save note" : "Create task"}
          </button>

          {mode === "task" && (
            <label className="flex shrink-0 items-center gap-1.5 text-[11.5px] font-semibold text-fg-muted">
              Due
              <input
                type="date"
                value={taskDue}
                onChange={(e) => setTaskDue(e.target.value)}
                disabled={pending}
                aria-label="Task due date"
                className="rounded-md border border-line-strong bg-card px-2 py-1.5 text-[12px] text-fg outline-none focus:border-accent disabled:opacity-60"
              />
            </label>
          )}

          {/* WHO IT IS FOR — a statement, not a control.
              Brent could not tell where an admin's task went: created on
              somebody else's company it goes to THEM (createTask resolves
              the company's owner), and every agent surface filters on
              assigned_user_id, so the wrong answer was invisible from both
              sides. This says the answer before the button is pressed.

              NOTHING IS SHOWN WHEN THE OWNER IS THE VIEWER. The line
              exists to name a destination that is not the obvious one; an
              agent on their own company already knows, and "for you" on a
              panel we have spent several rounds thinning out is noise. The
              page decides that and sends null.

              Deliberately quiet — muted, small, no border, no fill — so it
              cannot compete with the red Create task beside it. */}
          {mode === "task" && taskOwnerLabel && (
            <span className="shrink-0 text-[11.5px] text-fg-subtle">for {taskOwnerLabel}</span>
          )}

          {mode === "task" &&
            quickTasks.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setText(q.label)}
                disabled={pending}
                className={`shrink-0 rounded-md border px-2.5 py-2 text-[12.5px] font-semibold transition-colors disabled:opacity-55 ${
                  text === q.label ? PICKED : PICKABLE
                }`}
              >
                {q.label}
              </button>
            ))}
        </div>
      )}

      {error && (
        <p className="mx-4 mb-3 rounded-md border border-bad/30 bg-bad-bg px-2.5 py-1.5 text-[12px] font-semibold text-bad">
          {error}
        </p>
      )}

      {/* Say the draft came back. Text reappearing on its own is unnerving
          if nobody explains it, and a rep who does not know it was restored
          may retype what is already in the box. */}
      {restoredNotice && !error && (
        <p className="mx-4 mb-3 rounded-md border border-line-strong bg-inset px-2.5 py-1.5 text-[12px] font-semibold text-fg-muted">
          Picked up where you left off — this was still unsaved.
        </p>
      )}
    </div>
  );
}


/**
 * The one-tap timings, plus whatever the note appeared to say.
 *
 * The detected chip sits SECOND, right after Tomorrow, because it is the
 * one most likely to be right and the rep should see it without hunting.
 * It carries the rep's own word ("Friday"), not a formatted date, so what
 * is on screen matches what they typed.
 */
function buildChips(
  detected: DetectedDate | null,
): { key: string; label: string; date: string; fromNote?: boolean }[] {
  const now = new Date();
  const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const plus = (days: number) => ymd(new Date(now.getTime() + days * 86_400_000));

  const chips: { key: string; label: string; date: string; fromNote?: boolean }[] = [
    { key: "tomorrow", label: "Tomorrow", date: plus(1) },
    { key: "next-week", label: "Next week", date: plus(7) },
    { key: "two-weeks", label: "2 weeks", date: plus(14) },
  ];

  if (!detected) return chips;

  /* THE REP'S OWN WORD WINS. When what they wrote lands on a day a preset
     already covers — "Friday" said on a Thursday is also Tomorrow — the
     preset takes their label instead of a second chip appearing for the
     same date. Otherwise the panel would say "we noticed Friday" and then
     highlight a button marked Tomorrow, which reads as the detection
     having been ignored. */
  const collision = chips.find((c) => c.date === detected.date);
  if (collision) {
    collision.label = detected.label;
    /* `fromNote` is what carries the detection to the screen now that the
       sentence is gone. Marked here whether the reading got its own chip
       or landed on a preset, so the badge appears either way. */
    collision.fromNote = true;
    return chips;
  }

  // Second position: after Tomorrow, where it is seen without hunting.
  return [
    chips[0],
    { key: "detected", label: detected.label, date: detected.date, fromNote: true },
    ...chips.slice(1),
  ];
}
