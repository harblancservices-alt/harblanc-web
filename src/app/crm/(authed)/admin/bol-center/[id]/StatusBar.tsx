"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNeedsReview, clearNeedsReview, markProcessed, ignoreBol, reopenBol, type BolStatus } from "../actions";
import { DEPTH_SUCCESS, DEPTH_WARNING, DEPTH_DANGER, DEPTH_NEUTRAL } from "./buttonDepth";

/**
 * Real terminal/triage actions, not stage-flipping — each one performs the
 * exact thing its label says (see actions.ts's header comment for why
 * "ready" is computed automatically elsewhere and never a manual button
 * here).
 */
export function StatusBar({ bolId, status }: { bolId: string; status: BolStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  const btnClass = (cls: string) => `inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors ${cls}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "ignored" ? (
        <button type="button" disabled={pending} onClick={() => run(() => reopenBol(bolId))} className={btnClass(DEPTH_NEUTRAL)}>
          Reopen
        </button>
      ) : (
        <>
          {status === "needs_review" ? (
            <button type="button" disabled={pending} onClick={() => run(() => clearNeedsReview(bolId))} className={btnClass(DEPTH_NEUTRAL)}>
              Clear Flag
            </button>
          ) : (
            <button type="button" disabled={pending} onClick={() => run(() => markNeedsReview(bolId))} className={btnClass(DEPTH_WARNING)}>
              Needs Review
            </button>
          )}
          {status !== "processed" && (
            <button type="button" disabled={pending} onClick={() => run(() => markProcessed(bolId))} className={btnClass(DEPTH_SUCCESS)}>
              Mark BOL Processed
            </button>
          )}
          <button type="button" disabled={pending} onClick={() => run(() => ignoreBol(bolId))} className={btnClass(DEPTH_DANGER)}>
            Ignore
          </button>
        </>
      )}
    </div>
  );
}
