"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logCall } from "../../../../calls/actions";
import {
  GOT_THROUGH_OUTCOMES,
  RESULT_OUTCOMES,
  RESULT_ROW_REQUIRES,
  callOutcomeWeight,
  type OutcomeWeight,
} from "../../../../calls/outcomes";
import { detectDate, draftFollowupTitle, warrantsFollowup, type DetectedDate } from "../../../../calls/followupDraft";
import { addNote } from "../../../actions";
import { createTask } from "../../../../tasks/actions";
import {
  SELECTABLE_LIFECYCLE_STAGES,
  normalizeStage,
  stageNeedsReason,
  LIFECYCLE_LABEL,
  type LifecycleStage,
} from "../../../lifecycle";
import { updateLifecycleStatus } from "../../../actions";
import { Micro } from "./chrome";

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
/* Unpicked. Every outcome sits quiet until it is chosen; only the picked
   one takes its semantic colour, so the row reads as a question with one
   answer rather than seven competing buttons. */
const OUTCOME_IDLE = "border-line-strong bg-card text-fg hover:bg-inset";

const OUTCOME_BUTTON: Record<OutcomeWeight, string> = {
  good: "border-ok bg-ok text-white hover:bg-ok/90",
  bad: "border-bad/50 bg-bad-bg text-bad hover:border-bad",
  warn: "border-warn/50 bg-warn-bg text-warn hover:border-warn",
  neutral: "border-line-strong bg-card text-fg hover:bg-inset",
};

export function WhatHappened({
  accountId,
  contacts,
  stage,
}: {
  accountId: string;
  contacts: { id: string; name: string; phoneLabel: string | null }[];
  stage: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("call");
  const [text, setText] = useState("");
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
  const [error, setError] = useState<string | null>(null);

  const active = normalizeStage(stage);
  const order = SELECTABLE_LIFECYCLE_STAGES as readonly LifecycleStage[];
  const nextStage: LifecycleStage | null = order[order.indexOf(active) + 1] ?? null;
  // The tick is only offered where it can actually be honoured.
  const canAdvance = nextStage !== null && !stageNeedsReason(nextStage);

  function done(res: { ok: boolean; error?: string }) {
    if (!res.ok) {
      setError(res.error ?? "That did not save.");
      return;
    }
    setText("");
    setError(null);
    setGotThrough(null);
    setResult(null);
    setDetected(null);
    setFollowupDate("");
    setFollowupTitle("");
    setTitleTouched(false);
    router.refresh();
  }

  /** Who the follow-up is about, for the line under it. */
  const contactLabel =
    contacts.find((c) => c.id === contactId)?.name ?? "this company";

  /**
   * Re-draft from the note and the outcome, unless the rep has typed their
   * own title. Runs in event handlers only — detectDate reads the clock and
   * the React Compiler forbids that during render.
   */
  function redraft(note: string, outcome: string | null) {
    const found = detectDate(note, new Date());
    setDetected(found);
    if (!titleTouched) setFollowupTitle(draftFollowupTitle(note, outcome, found));
    // The detected date is PRE-SELECTED, and the chip renders it visibly.
    if (found) setFollowupDate(found.date);
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
          setText("");
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
              className="appearance-none rounded-md border border-line bg-card py-2 pl-6 pr-7 text-[12.5px] font-semibold text-fg outline-none focus:border-accent disabled:opacity-60"
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
          <span className="rounded-md border border-dashed border-line-strong px-2.5 py-2 text-[12px] text-fg-subtle">
            Nobody on file — this logs against the company
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
            setText(e.target.value);
            if (gotThrough) redraft(e.target.value, effectiveOutcome);
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
          className="w-full rounded-md border border-line bg-card px-3 py-2.5 text-[13px] text-fg outline-none placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
        />
      </div>

      {mode === "call" ? (
        <div className="flex flex-col gap-3 px-4 pb-3.5 pt-2">
          {/* ROW 1 — the connection. */}
          <div>
            <Micro className="block text-fg">Did you get through?</Micro>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {GOT_THROUGH_OUTCOMES.map((o) => {
                const on = gotThrough === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => pickGotThrough(o.value)}
                    disabled={pending}
                    className={`rounded-md border px-3.5 py-2 text-[12.5px] font-bold transition-colors disabled:opacity-55 ${
                      on ? OUTCOME_BUTTON[callOutcomeWeight(o.value)] : OUTCOME_IDLE
                    }`}
                  >
                    {o.short}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ROW 2 — only once somebody actually picked up. You cannot have
              a result from a voicemail. */}
          {gotThrough === RESULT_ROW_REQUIRES && (
            <div>
              <Micro className="block text-fg">How did it go?</Micro>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {RESULT_OUTCOMES.map((o) => {
                  const on = result === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => pickResult(o.value)}
                      disabled={pending}
                      className={`rounded-md border px-3.5 py-2 text-[12.5px] font-bold transition-colors disabled:opacity-55 ${
                        on ? OUTCOME_BUTTON[callOutcomeWeight(o.value)] : OUTCOME_IDLE
                      }`}
                    >
                      {o.short}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* THE FOLLOW-UP, once an outcome makes one sensible. */}
          {showFollowup && (
            <div className="border-t border-line pt-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <Micro className="text-fg">Follow up</Micro>
                {/* IT NOTICES, IT NEVER DECIDES. The chip is drawn already
                    selected and this line says where it came from, so a
                    wrong read costs one tap rather than a missed customer.
                    Never applied silently, never applied unseen. */}
                {detected && (
                  <span className="text-[11.5px] font-semibold text-accent">
                    we noticed &ldquo;{detected.label}&rdquo; in your note
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  value={followupTitle}
                  onChange={(e) => {
                    setTitleTouched(true);
                    setFollowupTitle(e.target.value);
                  }}
                  placeholder="What needs doing next?"
                  aria-label="Follow-up title"
                  disabled={pending}
                  className="min-w-0 flex-1 rounded-md border border-line bg-card px-3 py-2 text-[12.5px] text-fg outline-none focus:border-accent disabled:opacity-60"
                />

                {followupChips.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setFollowupDate(c.date)}
                    disabled={pending}
                    className={`rounded-md border px-3 py-2 text-[12px] font-bold transition-colors disabled:opacity-55 ${
                      followupDate === c.date
                        ? "border-accent bg-accent text-white"
                        : "border-line-strong bg-card text-fg hover:bg-inset"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}

                <label className="flex items-center gap-1.5 text-[12px] text-fg-subtle">
                  <span className="sr-only">Pick a date</span>
                  <input
                    type="date"
                    value={followupDate}
                    onChange={(e) => setFollowupDate(e.target.value)}
                    disabled={pending}
                    className="rounded-md border border-line-strong bg-card px-2 py-1.5 text-[12px] text-fg outline-none focus:border-accent disabled:opacity-60"
                  />
                </label>

                {followupDate && (
                  <button
                    type="button"
                    onClick={() => setFollowupDate("")}
                    className="text-[11.5px] font-semibold text-fg-subtle hover:text-fg"
                  >
                    No follow-up
                  </button>
                )}
              </div>

              <p className="mt-1.5 text-[11.5px] text-fg-subtle">
                {followupDate
                  ? `Assigned to you \u00b7 ${contactLabel}`
                  : "Pick a day and it becomes a dated task on your board."}
              </p>
            </div>
          )}

          {/* ONE SAVE writes the call, the outcome and the follow-up. */}
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
            <button
              type="button"
              onClick={saveCall}
              disabled={pending || !gotThrough}
              className="rounded-md bg-accent px-3.5 py-2 text-[13px] font-bold text-white transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-50"
            >
              {pending ? "Saving\u2026" : "Save the call"}
            </button>
            <span className="text-[12px] text-fg-muted">
              {!gotThrough
                ? "Pick what happened, then save."
                : followupDate
                  ? "Saves the call, the outcome and the follow-up task together."
                  : "Saves the call and the outcome."}
            </span>

            <label
              className={`ml-auto flex items-center gap-2 text-[12.5px] ${
                canAdvance ? "text-fg" : "cursor-not-allowed text-fg-subtle"
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
                <span className="text-fg-subtle">&rarr; {LIFECYCLE_LABEL[nextStage]}</span>
              )}
            </label>
          </div>
        </div>
      ) : (
        <div className="px-4 pb-3.5 pt-2">
          <button
            type="button"
            onClick={mode === "note" ? saveNote : saveTask}
            disabled={pending || !text.trim()}
            className="rounded-md bg-accent px-3.5 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-accent-hover disabled:opacity-55"
          >
            {pending ? "Saving…" : mode === "note" ? "Save note" : "Create task"}
          </button>
        </div>
      )}

      {error && (
        <p className="mx-4 mb-3 rounded-md border border-bad/30 bg-bad-bg px-2.5 py-1.5 text-[12px] font-semibold text-bad">
          {error}
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
function buildChips(detected: DetectedDate | null): { key: string; label: string; date: string }[] {
  const now = new Date();
  const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const plus = (days: number) => ymd(new Date(now.getTime() + days * 86_400_000));

  const chips = [
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
    return chips;
  }

  // Second position: after Tomorrow, where it is seen without hunting.
  return [chips[0], { key: "detected", label: detected.label, date: detected.date }, ...chips.slice(1)];
}
