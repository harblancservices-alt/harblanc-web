"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateLifecycleStatus } from "../actions";
import {
  SELECTABLE_LIFECYCLE_STAGES,
  LIFECYCLE_LABEL,
  normalizeStage,
  type LifecycleStage,
} from "../lifecycle";
import { IconCheck } from "../../_shell/icons";

/** The arrow's point/notch depth in px — same value feeds the clip-path and
 * the negative margin that nests each segment's notch into the previous
 * segment's point, so the row reads as one continuous chevron chain. */
const NOTCH = 14;

function clipPath(isFirst: boolean, isLast: boolean): string {
  const tip = `calc(100% - ${NOTCH}px) 0, 100% 50%, calc(100% - ${NOTCH}px) 100%`;
  const notch = `${NOTCH}px 50%`;
  if (isFirst && isLast) return "polygon(0 0, 100% 0, 100% 100%, 0 100%)";
  if (isFirst) return `polygon(0 0, ${tip}, 0 100%)`;
  if (isLast) return `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${notch})`;
  return `polygon(0 0, ${tip}, 0 100%, ${notch})`;
}

/**
 * The company profile's stage tracker — Option A, a horizontal chevron
 * pipeline (Brent's approved mock), REPLACING the old plain lifecycle pill
 * row in the top title bar entirely (see page.tsx). Completed stages fill
 * green with a check, the CURRENT stage is blue (2563eb, the same BTN_ACTION
 * blue as the CRM's other operational accents — Brent's 2026-08-08
 * correction retired the red this used to be), upcoming stages are gray. There's
 * no separate "Advance" control — clicking any chevron sets the company
 * straight to that stage, writing through the same updateLifecycleStatus
 * action the old pill row used (still logs the transition to the timeline).
 * Chevron shape comes from CSS clip-path (an angular cut, not a rounded
 * corner), so it already satisfies "square except buttons" without any
 * rounded-* class. A legacy stage (qualified/inactive/lost, dropped from
 * the active funnel at various points) shows a plain notice instead of
 * highlighting any chevron as current — none of the 5 pipeline stages
 * actually match, so pretending one does would be dishonest.
 */
export function StageTracker({ accountId, current }: { accountId: string; current: string }) {
  const active = normalizeStage(current);
  const activeIndex = (SELECTABLE_LIFECYCLE_STAGES as readonly LifecycleStage[]).indexOf(active);
  const isLegacy = activeIndex === -1;
  const [pending, startTransition] = useTransition();
  const [busyStage, setBusyStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function setStage(stage: LifecycleStage) {
    if (stage === active || pending) return;
    setBusyStage(stage);
    setError(null);
    startTransition(async () => {
      const res = await updateLifecycleStatus(accountId, stage);
      setBusyStage(null);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  const total = SELECTABLE_LIFECYCLE_STAGES.length;
  const stageNum = activeIndex + 1;
  const toClose = total - stageNum;
  const pct = Math.round((activeIndex / (total - 1)) * 100);

  return (
    <div className="w-full">
      {isLegacy && (
        <p className="mb-2 text-[12px] font-semibold text-warn">
          Legacy stage: {LIFECYCLE_LABEL[active]} — pick a stage below to move into the pipeline.
        </p>
      )}

      <div className="flex w-full overflow-x-auto">
        {SELECTABLE_LIFECYCLE_STAGES.map((stage, i) => {
          const done = !isLegacy && i < activeIndex;
          const isCurrent = !isLegacy && i === activeIndex;
          const isBusy = busyStage === stage;
          const fill = done
            ? "bg-ok text-white hover:bg-ok/90"
            : isCurrent
              ? "bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
              : "bg-inset text-fg-muted hover:bg-line-strong";

          return (
            <button
              key={stage}
              type="button"
              onClick={() => setStage(stage)}
              disabled={pending}
              aria-current={isCurrent ? "step" : undefined}
              className={`flex h-11 min-w-[112px] flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap px-4 text-[12.5px] font-semibold transition-colors disabled:opacity-70 ${fill}`}
              style={{
                clipPath: clipPath(i === 0, i === SELECTABLE_LIFECYCLE_STAGES.length - 1),
                marginLeft: i === 0 ? 0 : -NOTCH,
                zIndex: i,
              }}
            >
              {done && <IconCheck width={14} height={14} />}
              {isBusy ? "…" : LIFECYCLE_LABEL[stage]}
            </button>
          );
        })}
      </div>

      {!isLegacy && (
        <p className="mt-1.5 text-[12px] text-fg-subtle">
          Stage {stageNum} of {total} · {toClose} to close · {pct}%
        </p>
      )}
      {error && <p className="mt-1.5 text-[12px] text-bad">{error}</p>}
    </div>
  );
}
