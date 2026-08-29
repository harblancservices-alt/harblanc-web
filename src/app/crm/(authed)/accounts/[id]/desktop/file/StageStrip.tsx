"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
 *
 * ── THE CARET IS NOW A REAL MENU ──────────────────────────────────────
 *
 * The active cell used to draw a ▼ and carry `disabled`, so it was the one
 * cell on the strip that promised a dropdown and then refused to be clicked.
 * Brent's call was to keep the arrow and build the menu behind it rather
 * than delete the arrow.
 *
 * So this is an ADDITION, not a replacement. Clicking any OTHER cell still
 * moves the company straight to that stage, exactly as before. Clicking the
 * current cell now opens a list of all ten, which is the same move by a
 * different route — useful when the target stage is at the far end of a
 * 1500px row and you would rather read a list than aim.
 *
 * Both routes go through the same pick(), so Lost and Disqualified still
 * open StageReasonDialog from the menu just as they do from the strip. There
 * is no second path to a terminal stage and no second copy of that rule.
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close on an outside click or Escape. Both handlers are callbacks, not
  // effect bodies — the effect itself only subscribes.
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

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
    setMenuOpen(false);
    if (stage === active || pending) return;
    setError(null);
    if (stageNeedsReason(stage)) {
      setReasonFor(stage);
      return;
    }
    commit(stage);
  }

  return (
    <div className="border-b border-line-strong bg-card">
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
            <div
              key={stage}
              // The wrapper carries flex-1 so the cells stay equal fractions
              // exactly as before; only the active one needs `relative`, but
              // every cell is wrapped the same way so the row has no special
              // case in its layout.
              className="relative flex min-w-0 flex-1"
              ref={isActive ? menuRef : undefined}
            >
            <button
              type="button"
              onClick={() => (isActive ? setMenuOpen((v) => !v) : pick(stage))}
              disabled={pending}
              aria-current={isActive ? "step" : undefined}
              aria-haspopup={isActive ? "menu" : undefined}
              aria-expanded={isActive ? menuOpen : undefined}
              title={
                isActive
                  ? `Currently ${LIFECYCLE_LABEL[stage]} — open the full stage list`
                  : `Move to ${LIFECYCLE_LABEL[stage]}`
              }
              className={`w-full min-w-0 border-l border-line px-3 py-2.5 text-left transition-colors ${
                isActive
                  ? "bg-accent"
                  : "bg-card hover:bg-inset disabled:cursor-default"
              }`}
            >
              <span
                className={`block truncate text-[10px] crm-num ${
                  /* The step number on the ACTIVE stage: white/75 over the
                     accent fill is 3.91:1, under the 4.5 a number this
                     small needs. Full white is 5.63:1. The inactive ones
                     ride --fg-subtle, which moved in the same pass. */
                  isActive ? "text-white" : terminal ? "text-fg-subtle" : "text-fg-subtle"
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
                {isActive && (
                  <span
                    aria-hidden
                    className={`shrink-0 text-[9px] transition-transform ${menuOpen ? "rotate-180" : ""}`}
                  >
                    ▼
                  </span>
                )}
                {isBusy && <span className="shrink-0 text-[10px] font-normal">…</span>}
              </span>
            </button>

            {/* ── The menu the caret always promised ──────────────────
                Anchored to its own cell. Cells past the halfway mark
                open right-aligned, because a 260px menu hanging off
                DISQUALIFIED (the last of ten) would leave the viewport. */}
            {isActive && menuOpen && (
              <div
                role="menu"
                aria-label="Move to stage"
                className={`absolute top-full z-30 mt-1 w-[260px] overflow-hidden rounded-md border border-line-strong bg-card shadow-e3 ${
                  i >= SELECTABLE_LIFECYCLE_STAGES.length / 2 ? "right-0" : "left-0"
                }`}
              >
                <div className="border-b border-line px-3 py-2">
                  <Micro className="block text-fg-muted">Move to stage</Micro>
                </div>
                {SELECTABLE_LIFECYCLE_STAGES.map((s, si) => {
                  const isCurrent = s === active;
                  const needsReason = stageNeedsReason(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      role="menuitem"
                      onClick={() => pick(s)}
                      disabled={pending || isCurrent}
                      className={`flex w-full items-center gap-2.5 border-t border-line px-3 py-2 text-left first:border-t-0 transition-colors ${
                        isCurrent
                          ? "cursor-default bg-inset"
                          : "hover:bg-inset disabled:opacity-60"
                      }`}
                    >
                      <span className="w-[18px] shrink-0 text-[10px] text-fg-subtle crm-num">
                        {String(si + 1).padStart(2, "0")}
                      </span>
                      <span
                        className={`min-w-0 flex-1 truncate text-[12.5px] font-bold ${
                          needsReason && !isCurrent ? "text-fg-subtle" : "text-fg"
                        }`}
                      >
                        {LIFECYCLE_LABEL[s]}
                      </span>
                      {isCurrent && (
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.08em] text-accent">
                          current
                        </span>
                      )}
                      {/* Same warning the strip carries, for the same
                          reason — the reason gate is the one stage rule
                          this app enforces, so it is stated wherever a
                          terminal stage can be chosen. */}
                      {!isCurrent && needsReason && (
                        <span className="shrink-0 text-[10px] text-fg-subtle">needs reason</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            </div>
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
