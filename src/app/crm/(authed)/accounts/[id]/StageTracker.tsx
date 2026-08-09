"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateLifecycleStatus, updateProspectLevel } from "../actions";
import {
  SELECTABLE_LIFECYCLE_STAGES,
  LIFECYCLE_LABEL,
  normalizeStage,
  type LifecycleStage,
} from "../lifecycle";
import { IconCheck } from "../../_shell/icons";

/** The arrow's point/notch depth in px — same value feeds the clip-path and
 * the negative margin that nests each segment's notch into the previous
 * segment's point, so the row reads as one continuous chevron chain. Kept
 * small so the (now 7-segment) bar reads as thin rather than chunky. */
const NOTCH = 10;

function clipPath(isFirst: boolean, isLast: boolean): string {
  const tip = `calc(100% - ${NOTCH}px) 0, 100% 50%, calc(100% - ${NOTCH}px) 100%`;
  const notch = `${NOTCH}px 50%`;
  if (isFirst && isLast) return "polygon(0 0, 100% 0, 100% 100%, 0 100%)";
  if (isFirst) return `polygon(0 0, ${tip}, 0 100%)`;
  if (isLast) return `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${notch})`;
  return `polygon(0 0, ${tip}, 0 100%, ${notch})`;
}

/**
 * The company profile's stage tracker — a thin horizontal chevron pipeline.
 * Clicking any chevron sets the company straight to that stage, writing
 * through updateLifecycleStatus (still logs the transition to the timeline).
 * Chevron shape comes from CSS clip-path, so it already satisfies "square
 * except buttons" without any rounded-* class.
 *
 * 2026-08-09 rebuild: 7 stages (was 5), completed fill changed from green to
 * a muted grey (bg-slate — "done", not "won"; green is reserved elsewhere),
 * current stays the CRM's operational blue (#2563eb), upcoming is a light
 * outline chip instead of a solid grey fill. The Prospect chevron grows a
 * 1–10 level-meter panel underneath it (only rendered while Prospect is the
 * current stage) — see ProspectLevelMeter below. A legacy stage (inactive/
 * lost — a company that dropped OUT of the funnel) shows a plain notice
 * instead of highlighting any chevron as current, since none of the 7
 * pipeline stages actually match.
 */
export function StageTracker({
  accountId,
  current,
  prospectLevel,
}: {
  accountId: string;
  current: string;
  /** Current crm_accounts.prospect_level, or null if unset/unreadable (e.g.
   * the column isn't live yet) — the meter just starts empty either way. */
  prospectLevel?: number | null;
}) {
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
  const prospectIndex = (SELECTABLE_LIFECYCLE_STAGES as readonly LifecycleStage[]).indexOf("prospect");
  const showLevelMeter = !isLegacy && active === "prospect";

  return (
    <div className="w-full">
      {isLegacy && (
        <p className="mb-2 text-[12px] font-semibold text-warn">
          Legacy stage: {LIFECYCLE_LABEL[active]} — pick a stage below to move into the pipeline.
        </p>
      )}

      <div className="relative flex w-full overflow-x-auto">
        {SELECTABLE_LIFECYCLE_STAGES.map((stage, i) => {
          const done = !isLegacy && i < activeIndex;
          const isCurrent = !isLegacy && i === activeIndex;
          const isBusy = busyStage === stage;
          const fill = done
            ? "bg-slate text-white hover:bg-slate/90"
            : isCurrent
              ? "bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
              : "border border-line-strong bg-card text-fg-muted hover:bg-inset";

          return (
            <button
              key={stage}
              type="button"
              onClick={() => setStage(stage)}
              disabled={pending}
              aria-current={isCurrent ? "step" : undefined}
              className={`flex h-8 min-w-[96px] flex-1 shrink-0 items-center justify-center gap-1 whitespace-nowrap px-3 text-[11px] font-semibold transition-colors disabled:opacity-70 ${fill}`}
              style={{
                clipPath: clipPath(i === 0, i === SELECTABLE_LIFECYCLE_STAGES.length - 1),
                marginLeft: i === 0 ? 0 : -NOTCH,
                zIndex: i,
              }}
            >
              {done && <IconCheck width={12} height={12} />}
              {isBusy ? "…" : LIFECYCLE_LABEL[stage]}
            </button>
          );
        })}
      </div>

      {showLevelMeter && (
        <ProspectLevelMeter
          accountId={accountId}
          level={prospectLevel ?? null}
          centerPct={((prospectIndex + 0.5) / total) * 100}
        />
      )}

      {!isLegacy && (
        <p className="mt-1.5 text-[12px] text-fg-subtle">
          Stage {stageNum} of {total} · {toClose} to close · {pct}%
        </p>
      )}
      {error && <p className="mt-1.5 text-[12px] text-bad">{error}</p>}
    </div>
  );
}

/** The Prospect stage's 1–10 level meter — ten tappable pips (filled up to
 * the chosen level, like a signal-strength readout) visually attached under
 * the Prospect chevron via a centered connector, writing straight through
 * updateProspectLevel on click. Only ever rendered while Prospect is the
 * current stage (see StageTracker above). */
function ProspectLevelMeter({
  accountId,
  level,
  centerPct,
}: {
  accountId: string;
  level: number | null;
  centerPct: number;
}) {
  const [value, setValue] = useState(level);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function setLevel(next: number) {
    if (pending) return;
    const prev = value;
    const applied = next === prev ? null : next; // tap the active pip again to clear
    setValue(applied);
    setError(null);
    startTransition(async () => {
      const res = await updateProspectLevel(accountId, applied);
      if (res.ok) router.refresh();
      else {
        setValue(prev);
        setError(res.error);
      }
    });
  }

  return (
    <div className="relative mt-2 flex justify-center">
      <div
        className="absolute -top-2 h-2 w-px bg-line-strong"
        style={{ left: `${centerPct}%` }}
        aria-hidden
      />
      <div className="flex flex-col items-center gap-1.5 border border-line-strong bg-inset px-3 py-2">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
          Prospect level {value ? `· ${value}/10` : ""}
        </p>
        <div className="flex items-center gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((pip) => (
            <button
              key={pip}
              type="button"
              onClick={() => setLevel(pip)}
              disabled={pending}
              aria-label={`Set prospect level to ${pip}`}
              aria-pressed={value !== null && pip <= value}
              className={`h-5 w-3 shrink-0 transition-colors disabled:opacity-60 ${
                value !== null && pip <= value
                  ? "bg-[#2563eb] hover:bg-[#1d4ed8]"
                  : "border border-line-strong bg-card hover:bg-line-strong"
              }`}
            />
          ))}
        </div>
        {error && <p className="text-[11px] text-bad">{error}</p>}
      </div>
    </div>
  );
}
