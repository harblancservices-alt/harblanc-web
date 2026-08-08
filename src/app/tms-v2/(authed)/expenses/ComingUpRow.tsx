"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Money } from "@/components/tms-v2/ui/Money";
import { markBillPaidThisCycle } from "@/actions/tms-v2/expenses";
import type { MutationResult } from "@/lib/demo/mutation";

/** How far the row must travel, either direction, before release commits
 * "mark paid" — same threshold/tap-slop/collapse shape as admin's
 * AlertsPanel.tsx swipe-to-dismiss (src/app/admin/(authed)/AlertsPanel.tsx),
 * simplified to one action in either direction instead of two opposing
 * ones. */
const PAY_THRESHOLD_PX = 72;
const DRAG_MAX_PX = 120;
const TAP_SLOP_PX = 8;
/** How long the green "Paid" flash holds before the row collapses away. */
const FLASH_MS = 650;
const LEAVE_MS = 200;

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/**
 * One "Coming up" row — swipe left OR right past the threshold (or tap the
 * checkmark, the non-touch fallback) marks this cycle's charge paid: a green
 * flash, then the row collapses away. Persists via
 * markBillPaidThisCycle (actions/tms-v2/expenses.ts), which advances
 * recurring_expenses.skip_next_date onto today's occurrence — the same
 * "not due again until next cycle" mechanism skipNextPayment already used,
 * so it naturally reappears once its NEXT occurrence comes due. No new
 * column needed.
 */
export function ComingUpRow({
  id,
  name,
  amount,
  mon,
  day,
  href,
}: {
  id: string;
  name: string;
  amount: number;
  mon: string;
  day: string;
  href: string;
}) {
  const router = useRouter();
  const reduced = usePrefersReducedMotion();
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedHeight, setLockedHeight] = useState<number | null>(null);

  const startX = useRef(0);
  const dxRef = useRef(0);
  const startDx = useRef(0);
  const swiped = useRef(false);
  const rowRef = useRef<HTMLDivElement | null>(null);

  function moveTo(next: number) {
    dxRef.current = next;
    setDx(next);
  }

  async function commitPaid() {
    if (paying || paid) return;
    setPaying(true);
    setError(null);
    const result: MutationResult<{ paidThroughDate: string }> = await markBillPaidThisCycle(id);
    setPaying(false);
    if (!result.ok) {
      setError(result.reason);
      moveTo(0);
      return;
    }
    setPaid(true);
    moveTo(0);
    setLockedHeight(rowRef.current?.offsetHeight ?? 0);
    const hold = reduced ? 0 : FLASH_MS;
    window.setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => setLeaving(true)));
      window.setTimeout(() => {
        setRemoved(true);
        router.refresh();
      }, LEAVE_MS);
    }, hold);
  }

  function onTouchStart(e: React.TouchEvent) {
    if (paid || paying) return;
    const t = e.touches[0];
    if (!t) return;
    startX.current = t.clientX;
    startDx.current = dxRef.current;
    swiped.current = false;
    setDragging(true);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (paid || paying) return;
    const t = e.touches[0];
    if (!t) return;
    const delta = t.clientX - startX.current;
    if (Math.abs(delta) > TAP_SLOP_PX) swiped.current = true;
    moveTo(Math.max(-DRAG_MAX_PX, Math.min(DRAG_MAX_PX, startDx.current + delta)));
  }

  function onTouchEnd() {
    if (paid || paying) return;
    setDragging(false);
    if (Math.abs(dxRef.current) >= PAY_THRESHOLD_PX) {
      void commitPaid();
      return;
    }
    moveTo(0);
  }

  if (removed) return null;

  const transition = dragging || reduced ? "none" : "transform 180ms ease-out";
  const showGreen = paid || Math.abs(dx) > TAP_SLOP_PX;

  return (
    <div className="border-b border-line last:border-b-0">
      <div
        ref={rowRef}
        className="relative overflow-hidden"
        style={
          leaving
            ? { height: 0, opacity: 0, transition: `height ${LEAVE_MS}ms ease-in, opacity 150ms ease-in` }
            : lockedHeight != null
              ? { height: lockedHeight }
              : undefined
        }
      >
        {showGreen ? (
          <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-ok text-white">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4">
              <path
                fillRule="evenodd"
                d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.5 7.6a1 1 0 0 1-1.42.006l-3.5-3.5a1 1 0 1 1 1.414-1.414l2.79 2.79 6.796-6.886a1 1 0 0 1 1.414-.006z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-[12px] font-bold uppercase tracking-wide">{paid ? "Paid" : "Release to mark paid"}</span>
          </div>
        ) : null}

        <div
          className="relative flex touch-pan-y items-center gap-3 bg-card px-4 py-2.5"
          style={leaving ? undefined : { transform: `translateX(${dx}px)`, transition }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <Link
            href={href}
            className="absolute inset-0 z-0"
            aria-label={`Open ${name}`}
            onClick={(e) => {
              if (swiped.current || dxRef.current !== 0 || paying || paid) {
                e.preventDefault();
                swiped.current = false;
                moveTo(0);
              }
            }}
          />

          <span
            className="pointer-events-none flex w-12 shrink-0 flex-col items-center rounded-md py-1.5 text-white"
            style={{ backgroundColor: "#0d1117" }}
          >
            <span className="text-[9px] font-semibold uppercase leading-none tracking-wide">{mon}</span>
            <span className="mt-1 text-[15px] font-bold leading-none tabular-nums">{day}</span>
          </span>
          <span className="pointer-events-none min-w-0 flex-1 truncate text-[14px] font-medium text-fg">{name}</span>
          <Money value={amount} tone="none" className="pointer-events-none shrink-0 text-[14px] font-semibold" />

          {/* Non-touch fallback — always a real button, same convention as
              AlertsPanel's swipe actions. */}
          <button
            type="button"
            onClick={() => void commitPaid()}
            disabled={paying || paid}
            aria-label={`Mark ${name} paid`}
            title="Mark paid"
            className="relative z-10 shrink-0 rounded-full border border-line-strong bg-card p-1.5 text-fg-muted transition-colors hover:border-ok hover:bg-ok-bg hover:text-ok disabled:opacity-50"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-3.5 w-3.5">
              <path
                fillRule="evenodd"
                d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.5 7.6a1 1 0 0 1-1.42.006l-3.5-3.5a1 1 0 1 1 1.414-1.414l2.79 2.79 6.796-6.886a1 1 0 0 1 1.414-.006z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>
      {error ? <p className="px-4 pb-2 text-[11.5px] font-medium text-bad">{error}</p> : null}
    </div>
  );
}
