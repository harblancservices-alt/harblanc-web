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
 * open StageReasonDialog from the menu just as they do from the strip.
 *
 * THIS USED TO CLAIM there was no second path to a terminal stage. There
 * was: CompanyDialog's Lifecycle select posts every one of the ten stages
 * to updateAccount, which had no reason gate at all, and six companies went
 * Lost through it with no reason recorded. accounts/actions.ts now refuses
 * that move and points back here. This really is the only door now.
 */
export function StageStrip({
  accountId,
  current,
  lossReason = null,
}: {
  accountId: string;
  current: string;
  /**
   * crm_accounts.stage_loss_reason — why this company is Lost or
   * Disqualified, drawn directly under the strip that says it is.
   *
   * THE WHOLE POINT OF COLLECTING IT. This column was added on 26 Aug, the
   * dialog demanded a reason before it would let you commit, the action
   * saved it correctly — and NOTHING IN THE APP EVER READ IT BACK. Brent
   * asked why deals die and the answer was in the database the whole time
   * with no surface on it.
   */
  lossReason?: string | null;
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
        {/* THE "STAGE / click to move" CAPTION CELL IS GONE (Brent,
            2026-08-29). It spent 112px of a ten-cell row explaining what
            the row obviously is, and those 112px now go to the stages
            themselves — each cell is flex-1, so removing the fixed block
            widens all ten evenly. */}
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
              /* TEXT AREA ONLY. The cell keeps flex-1 for its width and
                 loses 4px of vertical padding to pay for the larger type,
                 so the strip's height moves by 1px. Brent was explicit that
                 this is the text, not the button.
                 text-left -> text-center, as asked. */
              className={`w-full min-w-0 border-l border-line px-3 py-2 text-center transition-colors ${
                isActive
                  ? "bg-accent"
                  : "bg-card hover:bg-inset disabled:cursor-default"
              }`}
            >
              <span
                /* 10px -> 11.5px. He called these out by name as light
                   grey and small; the colour moved in the last pass, this
                   is the size. */
                className={`block truncate text-[11.5px] crm-num ${
                  /* The step number on the ACTIVE stage: white/75 over the
                     accent fill is 3.91:1, under the 4.5 a number this
                     small needs. Full white is 5.63:1. The inactive ones
                     ride --fg-subtle, which moved in the same pass. */
                  /* BLACK, both here and on the label below (Brent, asked
                     explicitly — "not dark grey, black"). --fg is #14161c.
                     The active cell keeps white because it sits on the
                     accent fill. */
                  isActive ? "text-white" : "text-fg"
                }`}
              >
                {num}
                {isActive && " · CURRENT"}
                {!isActive && terminal && " · needs reason"}
              </span>
              <span
                /* 12.5px -> 15px, and centred within the cell. */
                className={`mt-1 flex items-center justify-center gap-1 truncate text-[15px] font-extrabold uppercase tracking-[0.01em] ${
                  isActive ? "text-white" : "text-fg"
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

      {/* WHY, immediately under the stage that raises the question.
          Full width, on the red ground the terminal stages already use, and
          impossible to miss on a company you have opened to ask exactly
          this. It renders only when a reason exists: a company that went
          Lost before the reason gate was built has nothing to show, and an
          empty "Reason: —" row would advertise the gap on every one of the
          six rather than the fact. */}
      {stageNeedsReason(active) && lossReason && (
        <div className="flex items-baseline gap-2.5 border-t border-bad/30 bg-bad-bg px-4 py-2">
          <Micro className="shrink-0 text-bad">Why</Micro>
          <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-bad">
            {lossReason}
          </p>
        </div>
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
