"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logCall } from "../../../../calls/actions";
import { QUICK_OUTCOMES } from "../../../../calls/outcomes";
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
    router.refresh();
  }

  /** One click on an outcome = one saved call. */
  function saveCall(outcome: string) {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("outcome", outcome);
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
          onChange={(e) => setText(e.target.value)}
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
        <div className="px-4 pb-3.5 pt-2">
          <Micro className="block text-fg">How did it go? — one click saves</Micro>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {QUICK_OUTCOMES.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => saveCall(o.value)}
                disabled={pending}
                className="rounded-md bg-file-on px-3.5 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-file-on-hover disabled:opacity-55"
              >
                {o.short}
              </button>
            ))}

            <label
              className={`ml-2 flex items-center gap-2 text-[12.5px] ${
                canAdvance ? "text-fg" : "cursor-not-allowed text-fg-subtle"
              }`}
              title={
                canAdvance && nextStage
                  ? `Moves this company to ${LIFECYCLE_LABEL[nextStage]}`
                  : nextStage
                    ? `${LIFECYCLE_LABEL[nextStage]} needs a reason — use the stage strip`
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
                <span className="text-fg-subtle">→ {LIFECYCLE_LABEL[nextStage]}</span>
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
            className="rounded-md bg-file-on px-3.5 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-file-on-hover disabled:opacity-55"
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
