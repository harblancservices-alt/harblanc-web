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

/**
 * The lifecycle stepper — the pickable stages as a clickable row so the rep
 * can move the company forward (or back) in one tap. The active stage is
 * filled with the brand accent; the rest are quiet outlines. Each click writes
 * through updateLifecycleStatus (which logs the transition to the timeline).
 *
 * Only SELECTABLE_LIFECYCLE_STAGES render as clickable pills — "contacted"/
 * "qualified"/"inactive"/"lost" were dropped from the funnel. A company still
 * sitting on one of those legacy stages isn't silently hidden or reset: its
 * real stage renders as an extra, non-interactive pill so the current state
 * stays honest, and clicking any selectable pill moves it into the new funnel.
 */
export function LifecycleControl({
  accountId,
  current,
}: {
  accountId: string;
  current: string;
}) {
  const active = normalizeStage(current);
  const isLegacy = !(SELECTABLE_LIFECYCLE_STAGES as readonly LifecycleStage[]).includes(active);
  const [pending, startTransition] = useTransition();
  const [busyStage, setBusyStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function setStage(stage: string) {
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

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {isLegacy && (
          <span
            className="rounded-full border border-warn/40 bg-warn-bg px-3 py-1.5 text-[12.5px] font-semibold text-warn"
            title="Legacy stage — pick one below to move it into the current funnel"
          >
            {LIFECYCLE_LABEL[active]} (legacy)
          </span>
        )}
        {SELECTABLE_LIFECYCLE_STAGES.map((stage) => {
          const isActive = stage === active;
          const isBusy = busyStage === stage;
          return (
            <button
              key={stage}
              type="button"
              onClick={() => setStage(stage)}
              disabled={pending}
              aria-pressed={isActive}
              className={[
                "rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60",
                isActive
                  ? "border-accent bg-accent text-white"
                  : "border-line-strong bg-card text-fg-muted hover:bg-inset hover:text-fg",
              ].join(" ")}
            >
              {isBusy ? "…" : LIFECYCLE_LABEL[stage]}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1.5 text-[12px] text-bad">{error}</p>}
    </div>
  );
}
