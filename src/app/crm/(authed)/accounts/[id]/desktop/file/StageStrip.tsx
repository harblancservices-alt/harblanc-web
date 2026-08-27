"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateLifecycleStatus } from "../../../actions";
import {
  SELECTABLE_LIFECYCLE_STAGES,
  LIFECYCLE_LABEL,
  normalizeStage,
  stageNeedsReason,
  type LifecycleStage,
} from "../../../lifecycle";
import { StageReasonDialog } from "../../../StageReasonDialog";
import { Micro } from "./chrome";

/**
 * The stage strip — ten numbered cells in one full-width row, click to move.
 *
 * This is the design's own treatment and it replaces the wrapping button set
 * StageTracker draws. Two things make it work at this width where the old
 * pipeline board could not: the cells are equal fractions of the row rather
 * than content-sized, and the label sits UNDER its number instead of beside
 * it, so a cell only has to be as wide as "DISQUALIFIED".
 *
 * NO SIDEWAYS TEXT and no collapsing of empty stages — Brent ruled on both
 * for the pipeline board and the same ruling applies here. All ten always
 * render, in funnel order.
 *
 * LOST AND DISQUALIFIED ARE VISIBLY DIFFERENT before you click them: their
 * labels are muted and they carry a "needs reason" note. That note is the
 * only stage rule this app actually enforces, so it is the only one drawn.
 * Both still prompt — the dialog opens, and nothing is written unless a
 * reason is given. The server re-checks, because a UI gate is not
 * enforcement.
 */
export function StageStrip({
  accountId,
  current,
}: {
  accountId: string;
  current: string;
}) {
  const active = normalizeStage(current);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasonFor, setReasonFor] = useState<LifecycleStage | null>(null);

  function commit(stage: LifecycleStage, why?: string) {
    setBusy(stage);
    setError(null);
    startTransition(async () => {
      const res = await updateLifecycleStatus(accountId, stage, why);
      setBusy(null);
      if (res.ok) {
        setReasonFor(null);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function pick(stage: LifecycleStage) {
    if (stage === active || pending) return;
    setError(null);
    if (stageNeedsReason(stage)) {
      setReasonFor(stage);
      return;
    }
    commit(stage);
  }

  return (
    <div className="border-b border-graphite bg-card">
      <div className="flex items-stretch">
        {/* The row's own label, not a cell — it is what the ten cells are. */}
        <div className="w-[112px] shrink-0 px-4 py-2.5">
          <Micro className="block text-fg">Stage</Micro>
          <span className="mt-1 block text-[11px] text-fg-subtle">click to move</span>
        </div>

        {SELECTABLE_LIFECYCLE_STAGES.map((stage, i) => {
          const isActive = stage === active;
          const terminal = stageNeedsReason(stage);
          const isBusy = busy === stage;
          const num = String(i + 1).padStart(2, "0");

          return (
            <button
              key={stage}
              type="button"
              onClick={() => pick(stage)}
              disabled={pending || isActive}
              aria-current={isActive ? "step" : undefined}
              title={isActive ? `Currently ${LIFECYCLE_LABEL[stage]}` : `Move to ${LIFECYCLE_LABEL[stage]}`}
              className={`min-w-0 flex-1 border-l border-line px-3 py-2.5 text-left transition-colors ${
                isActive
                  ? "bg-accent"
                  : "bg-card hover:bg-inset disabled:cursor-default"
              }`}
            >
              <span
                className={`block truncate text-[10px] crm-num ${
                  isActive ? "text-white/75" : terminal ? "text-fg-subtle" : "text-fg-subtle"
                }`}
              >
                {num}
                {isActive && " · CURRENT"}
                {!isActive && terminal && " · needs reason"}
              </span>
              <span
                className={`mt-1 flex items-center gap-1 truncate text-[12.5px] font-extrabold uppercase tracking-[0.01em] ${
                  isActive ? "text-white" : terminal ? "text-fg-subtle" : "text-fg"
                }`}
              >
                <span className="truncate">{LIFECYCLE_LABEL[stage]}</span>
                {isActive && <span aria-hidden className="shrink-0 text-[9px]">▼</span>}
                {isBusy && <span className="shrink-0 text-[10px] font-normal">…</span>}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <p className="border-t border-bad/30 bg-bad-bg px-4 py-1.5 text-[12px] font-semibold text-bad">
          {error}
        </p>
      )}

      <StageReasonDialog
        stage={reasonFor}
        pending={pending}
        error={error}
        onCancel={() => {
          setReasonFor(null);
          setError(null);
        }}
        onConfirm={(reason) => reasonFor && commit(reasonFor, reason)}
      />
    </div>
  );
}
