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
import { Modal } from "../../_shell/Modal";

/** The arrow's point/notch depth in px — same value feeds the clip-path and
 * the negative margin that nests each segment's notch into the previous
 * segment's point, so the row reads as one continuous chevron chain. */
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
 * through updateLifecycleStatus (logs the transition to the timeline and
 * fires that stage's entry automation — see lib/crm/stageAutomation.ts).
 *
 * 2026-08-22 rebuild (CRM_URGENCY_AUDIT.md): down to 6 real stages, each one
 * an independently-storable value — no more silent "Quoted writes
 * active_customer" rewrite, so no more confirm-modal gate in front of it
 * either; every chevron behaves identically now. The Prospect 1–10 level
 * meter is gone (confirmed fully inert — zero reads anywhere outside its own
 * write path; see the audit). `onStageChange` replaces the old
 * `onGraduatedToActiveCustomer` — StageTrackerSection uses it to detect
 * "just reached Active Customer" generically instead of that being a
 * special case baked in here.
 */
export function StageTracker({
  accountId,
  current,
  onStageChange,
  variant = "chevron",
}: {
  accountId: string;
  current: string;
  /** Fires right after a stage write succeeds, with the stage just written —
   * lets the parent react to specific transitions (e.g. offering an
   * Onboarding task on reaching Active Customer) from a component that stays
   * mounted across the transition. See StageTrackerSection.tsx. */
  onStageChange?: (stage: LifecycleStage) => void;
  /** "chevron" is the original filled chevron chain. "strip" is the desktop
   * company-profile redesign's pipeline bar (2026-08-22): the same six
   * stages, same click-to-set handler, same `updateLifecycleStatus` write —
   * just drawn as a label over a 4px progress bar per the design handoff.
   * "compact" is the MOBILE profile rebuild (2026-08-23): the six chevrons
   * need 622px, which is why the phone bar scrolled sideways under your
   * thumb and showed three stages at a time — so on a phone the chain
   * becomes a six-segment progress bar plus a bottom-sheet picker, where
   * every stage gets a full-width tap target instead of a 112px sliver.
   * Purely a rendering switch; no behavior differs between the three. */
  variant?: "chevron" | "strip" | "compact";
}) {
  const active = normalizeStage(current);
  const activeIndex = (SELECTABLE_LIFECYCLE_STAGES as readonly LifecycleStage[]).indexOf(active);
  const [pending, startTransition] = useTransition();
  const [busyStage, setBusyStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const router = useRouter();

  function setStage(stage: LifecycleStage) {
    if (stage === active || pending) return;
    setBusyStage(stage);
    setError(null);
    startTransition(async () => {
      const res = await updateLifecycleStatus(accountId, stage);
      setBusyStage(null);
      if (res.ok) {
        setSheetOpen(false);
        onStageChange?.(stage);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  const total = SELECTABLE_LIFECYCLE_STAGES.length;
  const stageNum = activeIndex + 1;
  const toClose = total - stageNum;
  const pct = Math.round((activeIndex / (total - 1)) * 100);

  if (variant === "compact") {
    const nextStage = SELECTABLE_LIFECYCLE_STAGES[activeIndex + 1] ?? null;
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

        <div aria-hidden className="mt-2 grid grid-cols-6 gap-[3px]">
          {SELECTABLE_LIFECYCLE_STAGES.map((stage, i) => (
            <span
              key={stage}
              className={`h-1.5 rounded-sm ${
                i < activeIndex ? "bg-accent/45" : i === activeIndex ? "bg-accent" : "bg-line"
              }`}
            />
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2.5">
          <span className="min-w-0 truncate text-[11.5px] font-bold text-fg-muted">
            {nextStage ? `Next up: ${LIFECYCLE_LABEL[nextStage]}` : "Final stage"}
          </span>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="shrink-0 whitespace-nowrap text-[12.5px] font-extrabold text-accent transition-colors hover:text-accent-hover"
          >
            Change stage ›
          </button>
        </div>

        {error && <p className="mt-1.5 text-[12px] font-semibold text-bad">{error}</p>}

        <Modal open={sheetOpen} onClose={() => setSheetOpen(false)} title="Pipeline stage" busy={pending}>
          <div className="flex flex-col gap-1.5 p-4">
            {SELECTABLE_LIFECYCLE_STAGES.map((stage, i) => {
              const done = i < activeIndex;
              const isCurrent = i === activeIndex;
              const isBusy = busyStage === stage;
              const tone = isCurrent
                ? "border-accent bg-accent/[0.07] text-accent shadow-e1"
                : stage === "lost"
                  ? "border-bad/35 bg-card text-bad hover:bg-bad/5"
                  : done
                    ? "border-line-strong bg-card text-fg-muted hover:bg-inset"
                    : "border-line-strong bg-card text-fg hover:bg-inset";
              const badge = isCurrent
                ? "border-accent bg-accent text-white"
                : done
                  ? "border-ok/40 bg-ok-bg text-ok"
                  : stage === "lost"
                    ? "border-bad/35 bg-bad-bg text-bad"
                    : "border-line-strong bg-inset text-fg-muted";
              return (
                <button
                  key={stage}
                  type="button"
                  onClick={() => setStage(stage)}
                  disabled={pending}
                  aria-current={isCurrent ? "step" : undefined}
                  className={`flex items-center gap-[11px] rounded-[11px] border px-3 py-3 text-left text-[14.5px] font-extrabold tracking-[-0.01em] transition-colors disabled:opacity-60 ${tone}`}
                >
                  <span
                    className={`flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full border text-[11px] font-extrabold ${badge}`}
                  >
                    {done ? <IconCheck width={12} height={12} /> : i + 1}
                  </span>
                  <span className="min-w-0 truncate">{isBusy ? "…" : LIFECYCLE_LABEL[stage]}</span>
                </button>
              );
            })}
            {error && <p className="mt-1 text-[12.5px] font-semibold text-bad">{error}</p>}
          </div>
        </Modal>
      </div>
    );
  }

  if (variant === "strip") {
    return (
      <div className="w-full">
        <div className="flex items-center gap-4">
          <div className="flex min-w-0 flex-1 gap-1">
            {SELECTABLE_LIFECYCLE_STAGES.map((stage, i) => {
              const done = i < activeIndex;
              const isCurrent = i === activeIndex;
              const isBusy = busyStage === stage;
              return (
                <button
                  key={stage}
                  type="button"
                  onClick={() => setStage(stage)}
                  disabled={pending}
                  aria-current={isCurrent ? "step" : undefined}
                  className="group flex min-w-0 flex-1 flex-col gap-1.5 text-left disabled:opacity-70"
                >
                  <span
                    className={`truncate text-[11px] ${isCurrent ? "font-bold text-fg" : "font-medium text-fg-muted"}`}
                  >
                    {isBusy ? "…" : LIFECYCLE_LABEL[stage]}
                  </span>
                  <span
                    aria-hidden
                    className={`h-1 rounded-sm transition-colors ${
                      done ? "bg-accent/45" : isCurrent ? "bg-accent" : "bg-line group-hover:bg-line-strong"
                    }`}
                  />
                </button>
              );
            })}
          </div>
          <span className="shrink-0 whitespace-nowrap text-[12px] text-fg-muted">
            Stage {stageNum} of {total} · <b className="text-fg">{pct}%</b>
          </span>
        </div>
        {error && <p className="mt-1.5 text-[12px] text-bad">{error}</p>}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="relative flex w-full overflow-x-auto">
        {SELECTABLE_LIFECYCLE_STAGES.map((stage, i) => {
          const done = i < activeIndex;
          const isCurrent = i === activeIndex;
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
              className={`flex h-8 min-w-[96px] flex-1 shrink-0 items-center justify-center gap-1 whitespace-nowrap px-3 text-[11px] font-semibold transition-colors disabled:opacity-70 max-lg:h-11 max-lg:min-w-[112px] max-lg:text-[12px] ${fill}`}
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

      <p className="mt-1.5 text-[12px] text-fg-subtle">
        Stage {stageNum} of {total} · {toClose} to close · {pct}%
      </p>
      {error && <p className="mt-1.5 text-[12px] text-bad">{error}</p>}
    </div>
  );
}
