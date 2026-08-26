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
import { StageReasonDialog } from "../StageReasonDialog";

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
  const router = useRouter();

  function commit(stage: LifecycleStage, why?: string) {
    setBusyStage(stage);
    setError(null);
    startTransition(async () => {
      const res = await updateLifecycleStatus(accountId, stage, why);
      setBusyStage(null);
      if (res.ok) {
        setReasonFor(null);
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
      setReasonFor(stage);
      return;
    }
    commit(stage);
  }


  return (
    <div className="w-full">
      {/* NO "Stage 3 of 10 · 22%" READOUT (Brent, 2026-08-26: cut). A funnel
          position is not a percentage of anything — Dormant is stage 8 of 10
          and is not 78% of a sale — and the number sat next to ten buttons
          that already say where the company is. */}
      <div className="flex items-baseline gap-2.5">
        <span className="min-w-0 truncate text-[15px] font-extrabold tracking-[-0.01em] text-fg">
          {LIFECYCLE_LABEL[active]}
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

      {/* The prompt itself is shared with the pipeline board — see
          accounts/StageReasonDialog.tsx. Same wording, same rules, one copy. */}
      <StageReasonDialog
        stage={reasonFor}
        pending={pending}
        error={error}
        onCancel={() => setReasonFor(null)}
        onConfirm={(why) => {
          if (reasonFor) commit(reasonFor, why);
        }}
      />
    </div>
  );
}
