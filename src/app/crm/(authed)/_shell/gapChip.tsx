"use client";

import type { ReactNode } from "react";

/**
 * GAPS TO FILL — the ONE presentation, wherever a gap appears.
 *
 * Brent picked structure A (company first, each gap a chip you type into in
 * place) and said it was "the treatment for the whole gaps area wherever it
 * appears". It then appeared in exactly one place. The company file — the
 * biggest gaps surface in the app — drew its own numbered "1. 2." list with
 * inputs pushed to the far right, so the same idea had two looks depending
 * on which screen you were on.
 *
 * This module is the treatment, and nothing else. It deliberately does NOT
 * abstract over the two derivations behind it:
 *
 *   completeness.ts  3 kinds, across every company you own (Dashboard, Tasks)
 *   fileGaps.ts      5 kinds, this company only (adds carrier, freight spend)
 *
 * Those differ for a real reason — the company file knows things a rollup
 * across four hundred companies does not — and forcing them into one
 * function would have meant either dropping two kinds or querying two
 * columns the rollup has no use for. What was actually broken was that they
 * LOOKED different, and that is what this fixes.
 *
 * ── THE TWO RULES ─────────────────────────────────────────────────────
 *
 * ORDER   blocking sorts first (each caller applies this to its own list).
 * MARKER  the blocking chip is red; optional chips stay outlined blue.
 *
 * "Blocking" is not a stage gate and nothing here claims it is — no badge
 * reads "BLOCKS QUALIFIED", because nothing in this app refuses a stage
 * change for a missing field. What is true is that you cannot make first
 * contact with a company that has nobody on file.
 */

const CHIP = "rounded-md border px-2.5 py-1 text-[12px] font-semibold transition-colors";

/** Optional: worth filling, nothing is stuck without it. */
export const GAP_CHIP_OPTIONAL = `${CHIP} border-accent/45 bg-card text-accent hover:border-accent hover:bg-accent-bg`;

/** Blocking: red, the same way red means late on a task. One chip differs,
 * not a whole second tier. */
export const GAP_CHIP_BLOCKING = `${CHIP} border-bad/50 bg-bad-bg text-bad hover:border-bad`;

export function gapChipClass(blocking: boolean): string {
  return blocking ? GAP_CHIP_BLOCKING : GAP_CHIP_OPTIONAL;
}

/** A gap that has not been opened yet. */
export function GapChip({
  label,
  title,
  blocking,
  onClick,
}: {
  label: string;
  /** Why this is worth asking — the hover explanation. */
  title: string;
  blocking: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} title={title} className={gapChipClass(blocking)}>
      {label}
    </button>
  );
}

/**
 * The chip having become the field. Typing happens in the chip's own place
 * rather than in a panel somewhere else, which is the whole point of A.
 */
export function GapChipInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  ariaLabel,
  pending,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  placeholder: string;
  ariaLabel: string;
  pending: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="inline-flex items-center gap-1"
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        // Abandoning an empty box just closes it; abandoning a half-typed
        // one keeps what you typed, because losing it to a stray click is
        // worse than a box that stayed open.
        onBlur={() => {
          if (!value.trim()) onCancel();
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={pending}
        className="w-[210px] rounded-md border border-accent bg-card px-2.5 py-1 text-[12px] text-fg outline-none placeholder:text-fg-subtle focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={pending || !value.trim()}
        className="rounded-md bg-accent px-2.5 py-1 text-[12px] font-bold text-white disabled:opacity-50"
      >
        {pending ? "…" : "Save"}
      </button>
    </form>
  );
}

/** The row a set of chips sits in. */
export function GapChipRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5">{children}</div>;
}
