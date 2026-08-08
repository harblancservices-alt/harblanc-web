"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/domain/money";
import { markBillPaidThisCycle } from "@/actions/tms-v2/expenses";
import type { MutationResult } from "@/lib/demo/mutation";

/** How long the solid-green "Paid" state holds before the row collapses
 * away (it's genuinely done for this cycle — nothing left to look at). */
const FLASH_MS = 650;
const LEAVE_MS = 200;

const RING_SIZE = 44;
const RING_STROKE = 4;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
/** The ring's fill reference — "Coming up" only ever shows bills within
 * about a month out (ComingUpCard's own dayOfMonth-anchored filter), so a
 * fixed 31-day window reads as "how close is this to its own due date"
 * without needing each bill's actual cycle length. */
const RING_MAX_DAYS = 31;

function ringColor(days: number): string {
  if (days <= 3) return "var(--bad)";
  if (days <= 10) return "var(--warn)";
  return "var(--info)";
}

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

/** The countdown ring — days-until-due in the center, an SVG progress ring
 * that fills as the date nears (red ≤3 days, amber 4–10, blue beyond).
 * Doubles as the ONLY mark-paid control: tapping it is the sole way to pay
 * a coming-up bill (no swipe/slide gesture anywhere on this card — Brent
 * explicitly ruled that out after an earlier pass tried it). */
function CountdownRing({ daysUntil, paid, paying, onTap }: { daysUntil: number; paid: boolean; paying: boolean; onTap: () => void }) {
  if (paid) {
    return (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ok text-white">
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-5 w-5">
          <path
            fillRule="evenodd"
            d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.5 7.6a1 1 0 0 1-1.42.006l-3.5-3.5a1 1 0 1 1 1.414-1.414l2.79 2.79 6.796-6.886a1 1 0 0 1 1.414-.006z"
            clipRule="evenodd"
          />
        </svg>
      </span>
    );
  }

  const clampedDays = Math.max(0, Math.min(RING_MAX_DAYS, daysUntil));
  const pct = 1 - clampedDays / RING_MAX_DAYS;
  const color = ringColor(daysUntil);
  const dashOffset = RING_CIRCUMFERENCE * (1 - pct);

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={paying}
      aria-label={`Mark paid — ${daysUntil <= 0 ? "due today" : `due in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`}`}
      title="Tap to mark paid"
      className="relative flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-60"
    >
      <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} className="-rotate-90">
        <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} fill="none" strokeWidth={RING_STROKE} className="stroke-line-strong" />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          style={{ stroke: color, strokeDasharray: RING_CIRCUMFERENCE, strokeDashoffset: dashOffset, transition: "stroke-dashoffset 200ms ease-out" }}
        />
      </svg>
      <span className="absolute text-[13px] font-bold tabular-nums text-fg">{Math.max(0, daysUntil)}</span>
    </button>
  );
}

/**
 * One "Coming up" row (Brent's revised ask, 2026-08-08 — replaces the
 * swipe-to-pay pass from earlier the same day, fully removed): the
 * countdown ring on the right IS the mark-paid control — tap it, it flips
 * to a solid green check, the row reads "Paid · resets next cycle", then
 * collapses away. Persists via markBillPaidThisCycle
 * (actions/tms-v2/expenses.ts), which advances recurring_expenses
 * .skip_next_date onto today's occurrence — the same "not due again until
 * next cycle" mechanism skipNextPayment already used, so it naturally
 * reappears once its NEXT occurrence comes due. No swipe/touch handling of
 * any kind on this row anymore.
 */
export function ComingUpRow({
  id,
  name,
  amount,
  mon,
  day,
  daysUntil,
  href,
}: {
  id: string;
  name: string;
  amount: number;
  mon: string;
  day: string;
  daysUntil: number;
  href: string;
}) {
  const router = useRouter();
  const reduced = usePrefersReducedMotion();
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedHeight, setLockedHeight] = useState<number | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);

  async function commitPaid() {
    if (paying || paid) return;
    setPaying(true);
    setError(null);
    const result: MutationResult<{ paidThroughDate: string }> = await markBillPaidThisCycle(id);
    setPaying(false);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setPaid(true);
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

  if (removed) return null;

  return (
    <div className="border-b border-line last:border-b-0">
      <div
        ref={rowRef}
        className="overflow-hidden"
        style={
          leaving
            ? { height: 0, opacity: 0, transition: `height ${LEAVE_MS}ms ease-in, opacity 150ms ease-in` }
            : lockedHeight != null
              ? { height: lockedHeight }
              : undefined
        }
      >
        <div className="relative flex items-center gap-3 px-4 py-2.5">
          <Link href={href} className="absolute inset-0 z-0" aria-label={`Open ${name}`} onClick={(e) => (paying || paid ? e.preventDefault() : undefined)} />

          <span className="pointer-events-none flex w-12 shrink-0 flex-col items-center rounded-md py-1.5 text-white" style={{ backgroundColor: "#0d1117" }}>
            <span className="text-[9px] font-semibold uppercase leading-none tracking-wide">{mon}</span>
            <span className="mt-1 text-[15px] font-bold leading-none tabular-nums">{day}</span>
          </span>

          <span className="pointer-events-none min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium text-fg">{name}</span>
            {paid ? (
              <span className="mt-0.5 block text-[12px] font-semibold text-ok">Paid · resets next cycle</span>
            ) : (
              <span className="mt-0.5 block text-[12.5px] font-medium text-fg-muted">{formatMoney(amount)}</span>
            )}
          </span>

          <span className="relative z-10">
            <CountdownRing daysUntil={daysUntil} paid={paid} paying={paying} onTap={() => void commitPaid()} />
          </span>
        </div>
      </div>
      {error ? <p className="px-4 pb-2 text-[11.5px] font-medium text-bad">{error}</p> : null}
    </div>
  );
}
