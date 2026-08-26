"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateLifecycleStatus } from "../actions";
import {
  SELECTABLE_LIFECYCLE_STAGES,
  LIFECYCLE_LABEL,
  normalizeStage,
  stageNeedsReason,
  type LifecycleStage,
} from "../lifecycle";
import { Modal } from "../../_shell/Modal";
import { SubmitButton, FormError } from "../../_shell/form";

/**
 * The company profile's stage control — ten buttons, the current one
 * selected. Clicking one sets the company straight to that stage, writing
 * through updateLifecycleStatus (which logs the transition, stamps
 * stage_changed_at, and fires that stage's entry automation).
 *
 * WHY THIS IS NOW BUTTONS AND NOT A CHEVRON CHAIN (2026-08-26). The old
 * control drew the funnel as a continuous chevron pipeline, with three
 * variants to cope with how little room that needs: "chevron" (the original
 * card), "strip" (a label over a 4px bar for desktop) and "compact" (a
 * six-segment bar plus a bottom-sheet picker, built because six chevrons
 * needed 622px and scrolled sideways under your thumb on a phone).
 *
 * Ten stages kills that approach outright. Ten chevrons want over 1000px,
 * and the mobile sheet was already a workaround for six. So the chain
 * becomes a WRAPPING set of buttons: every stage gets a real, full-size tap
 * target, the row reflows to whatever width it is given, and the same
 * component serves desktop and mobile with no variant switch at all. The
 * funnel ORDER is still visible — the buttons are laid out in it, and the
 * progress bar above still reads left to right — it is simply no longer
 * drawn as interlocking arrows.
 *
 * All three variants and the bottom sheet went with it. `variant` is kept in
 * the signature as an accepted-and-ignored prop so the two call sites did not
 * have to change in the same commit; it no longer selects anything.
 *
 * LOST AND DISQUALIFIED PROMPT FIRST. Both are terminal and both are a
 * judgement, so neither commits until a reason is given — the dialog opens,
 * and the stage does not change if you close it. The server re-checks.
 */
export function StageTracker({
  accountId,
  current,
  onStageChange,
}: {
  accountId: string;
  current: string;
  /** Fires right after a stage write succeeds, with the stage just written —
   * lets the parent react to specific transitions (e.g. offering an
   * Onboarding task on reaching Active) from a component that stays mounted
   * across the transition. See StageTrackerSection.tsx. */
  onStageChange?: (stage: LifecycleStage) => void;
  /** Accepted and ignored — see the note above. */
  variant?: "chevron" | "strip" | "compact";
}) {
  const active = normalizeStage(current);
  const activeIndex = (SELECTABLE_LIFECYCLE_STAGES as readonly LifecycleStage[]).indexOf(active);
  const [pending, startTransition] = useTransition();
  const [busyStage, setBusyStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The stage waiting on a reason. Non-null means the dialog is open, and
   * nothing has been written yet. */
  const [reasonFor, setReasonFor] = useState<LifecycleStage | null>(null);
  const [reason, setReason] = useState("");
  const router = useRouter();

  function commit(stage: LifecycleStage, why?: string) {
    setBusyStage(stage);
    setError(null);
    startTransition(async () => {
      const res = await updateLifecycleStatus(accountId, stage, why);
      setBusyStage(null);
      if (res.ok) {
        setReasonFor(null);
        setReason("");
        onStageChange?.(stage);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function pick(stage: LifecycleStage) {
    if (stage === active || pending) return;
    setError(null);
    // The gate is here, BEFORE any write. Closing the dialog leaves the
    // company exactly where it was.
    if (stageNeedsReason(stage)) {
      setReason("");
      setReasonFor(stage);
      return;
    }
    commit(stage);
  }

  const total = SELECTABLE_LIFECYCLE_STAGES.length;
  const stageNum = activeIndex + 1;
  const pct = Math.round((activeIndex / (total - 1)) * 100);

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between gap-2.5">
        <span className="min-w-0 truncate text-[15px] font-extrabold tracking-[-0.01em] text-fg">
          {LIFECYCLE_LABEL[active]}
        </span>
        <span className="crm-num shrink-0 whitespace-nowrap text-[11.5px] font-bold text-fg-muted">
          Stage {stageNum} of {total} · {pct}%
        </span>
      </div>

      {/* Segment count comes from the vocabulary, not a hardcoded grid class
          — the old control had `grid-cols-6` baked in, which is exactly the
          kind of thing that silently mis-renders when the vocabulary grows. */}
      <div
        aria-hidden
        className="mt-2 flex gap-[3px]"
      >
        {SELECTABLE_LIFECYCLE_STAGES.map((stage, i) => (
          <span
            key={stage}
            className={`h-[4px] flex-1 rounded-full ${i <= activeIndex ? "bg-accent" : "bg-line-strong"}`}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {SELECTABLE_LIFECYCLE_STAGES.map((stage) => {
          const isActive = stage === active;
          const isBusy = busyStage === stage;
          const terminal = stageNeedsReason(stage);
          return (
            <button
              key={stage}
              type="button"
              onClick={() => pick(stage)}
              disabled={pending || isActive}
              aria-pressed={isActive}
              className={`rounded-md border px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors disabled:cursor-default ${
                isActive
                  ? terminal
                    ? "border-bad bg-bad text-white"
                    : "border-accent bg-accent text-white"
                  : terminal
                    ? "border-line-strong bg-card text-bad hover:border-bad hover:bg-bad-bg"
                    : "border-line-strong bg-card text-fg-muted hover:border-accent hover:bg-accent-bg hover:text-accent"
              }`}
            >
              {isBusy ? "…" : LIFECYCLE_LABEL[stage]}
            </button>
          );
        })}
      </div>

      {error && <p className="mt-2 text-[12px] font-semibold text-bad">{error}</p>}

      <Modal
        open={reasonFor !== null}
        onClose={() => setReasonFor(null)}
        busy={pending}
        title={reasonFor ? `Why ${LIFECYCLE_LABEL[reasonFor]}?` : ""}
      >
        <FormError message={error} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (reasonFor && reason.trim()) commit(reasonFor, reason);
          }}
          className="flex flex-col gap-2"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
              Reason
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
              required
              placeholder={
                reasonFor === "disqualified"
                  ? "What ruled them out? Wrong freight, no authority, out of area…"
                  : "What happened? Went with someone else, price, no response…"
              }
              className="w-full resize-none rounded-md border border-line-strong bg-inset p-2.5 text-[13px] text-fg outline-none focus:border-accent focus:bg-card focus:ring-2 focus:ring-accent/20"
            />
          </label>
          <p className="text-[11.5px] text-fg-subtle">
            {reasonFor === "disqualified"
              ? "Disqualified means we ruled them out. It never resurfaces for win-back."
              : "Lost means they went elsewhere. It comes back as a win-back candidate later."}
          </p>
          {/* The textarea's `required` plus the submit guard above are what
              enforce a non-empty reason; SubmitButton has no disabled prop
              and does not need one. */}
          <SubmitButton pending={pending}>
            {reasonFor ? `Mark ${LIFECYCLE_LABEL[reasonFor]}` : "Save"}
          </SubmitButton>
        </form>
      </Modal>
    </div>
  );
}
