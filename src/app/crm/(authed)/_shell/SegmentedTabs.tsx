"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The CRM's ONE tab row — a row of BUTTONS (Brent, 2026-08-25). Every tab is
 * the same size and shape: the selected one is filled brand red with white
 * text, the rest are outlined with a transparent fill. Hover darkens an
 * outlined tab's border and text.
 *
 * There is no track behind the row and no grey FILL on any tab in any state.
 * The border is a hairline outline, not a surface.
 *
 * NO GREY ANYWHERE. That is the specific, repeated instruction: the two
 * previous versions of this component (a light-track segmented control, then
 * an underline row) were both rejected for the grey they introduced. If a
 * change here ever reintroduces a grey surface in a tab row, it is wrong.
 *
 * The file is still named SegmentedTabs for its import path only — the
 * segmented look it was named for is gone. Renaming would touch every call
 * site for no behavioural gain; the name is historical, this comment is the
 * truth.
 *
 * ONE component, used everywhere, deliberately: before it, five tab rows each
 * hand-rolled the same pill-in-a-bar and had already drifted apart —
 * different paddings, different text sizes, different active colours (violet
 * in Admin, steel-blue in Operations), and one that silently became a
 * three-column grid on mobile. Restyling each row separately would have
 * recreated exactly that drift, which is why nesting is expressed as a `size`
 * prop rather than a second component.
 *
 * Serves both tab flavors the CRM uses: `href` renders a Next Link (route
 * tabs, where the panel is its own addressable URL) and `onSelect` renders a
 * button (client-state tabs, where every panel stays mounted). Exactly one of
 * the two per item.
 */
export type SegmentedTabItem = {
  /** Stable key; also the React key. */
  key: string;
  label: ReactNode;
  active: boolean;
  /** Route tabs. Mutually exclusive with onSelect. */
  href?: string;
  /** Client-state tabs. Mutually exclusive with href. */
  onSelect?: () => void;
  /**
   * A count that belongs to this tab ("OTR 38"). Pass the NUMBER, not markup
   * — the component renders it so every count in the CRM reads the same.
   *
   * ZERO IS RENDERED. On a filter row "BOL Center 0" is the answer to the
   * question the tab asks; hiding it would leave the reader unable to tell
   * "nothing here" from "this tab doesn't count anything". An ATTENTION count
   * is the exception — see countNeedsAttention — and a caller that wants a
   * zero hidden passes `undefined` rather than `0`.
   */
  count?: number;
  /**
   * Draw this tab's count in the brand red instead of muted grey. For a
   * count that genuinely needs chasing (an attention queue), never as
   * decoration — if every count is emphasised, none of them are.
   */
  countNeedsAttention?: boolean;
};

/**
 * Two sizes, ONE style. Where tabs nest, the outer row is the larger of the
 * two and the inner row the smaller — they differ by scale, not by shape,
 * so the CRM has exactly one tab idiom rather than two competing looks
 * (Brent, 2026-08-25: the underline variant this replaced read as
 * "inconsistent and not very user friendly").
 */
export type SegmentedTabSize = "sm" | "lg";

/**
 * The row itself. NO background, NO border, NO padding — it is a bare flex
 * container so the tabs sit directly on whatever surface the page provides.
 * Still hugs its content rather than stretching, and still scrolls rather
 * than wrapping if it ever runs out of room.
 */
const TRACK = "inline-flex w-fit max-w-full items-stretch overflow-x-auto";

/** ~6px between buttons at both sizes, so the borders read as separate
 * buttons rather than one joined strip. */
const TRACK_SIZE: Record<SegmentedTabSize, string> = {
  sm: "gap-1.5",
  lg: "gap-1.5",
};

/** `border` is on the BASE, not on either state: an outlined tab and a filled
 * one must occupy the same box, or the row would jump by 2px as the selection
 * moves. The active tab's border is simply its own red. */
const CHIP =
  "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[3px] border leading-tight transition-colors";

const CHIP_SIZE: Record<SegmentedTabSize, string> = {
  sm: "px-[15px] py-[7px] text-[13px]",
  lg: "px-[18px] py-[9px] text-[14px]",
};

/** Active: a filled brand-red button. */
const CHIP_ACTIVE = "border-[#c0272d] bg-[#c0272d] font-semibold text-white";

/** Inactive: an OUTLINED button — transparent fill, a visible hairline, and
 * dark-grey (not faint) text, so the row reads as a row of buttons rather
 * than as loose words. Hover darkens the border and the text; the fill stays
 * transparent, because no grey surface may appear in a tab row in any state. */
const CHIP_INACTIVE =
  "border-line bg-transparent font-medium text-fg-muted hover:border-fg-subtle hover:text-fg";

/** The count, inline and quiet — the same treatment on every row, so an
 * outer tab's count and a filter tab's count read as the same thing. */
function TabCount({
  value,
  active,
  attention,
}: {
  value: number;
  active: boolean;
  attention?: boolean;
}) {
  // An attention count of zero is nothing to chase, so it disappears; an
  // ordinary count of zero is information and stays.
  if (attention && !value) return null;
  // On the active tab the chip is already red, so an attention count can't be
  // red too — it reads as white at reduced opacity, against the fill.
  const tone = active
    ? "text-white/70"
    : attention
      ? "text-[#c0272d]"
      : "text-fg-subtle";
  return <span className={`font-mono text-[11.5px] font-medium tabular-nums ${tone}`}>{value}</span>;
}

export function SegmentedTabs({
  items,
  ariaLabel,
  className,
  size = "sm",
}: {
  items: SegmentedTabItem[];
  ariaLabel: string;
  /** Extra classes on the TRACK (e.g. a margin). Not for restyling it. */
  className?: string;
  /** "lg" for a section's top row, "sm" (default) for a row nested inside a
   * panel. See SegmentedTabSize. */
  size?: SegmentedTabSize;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`${TRACK} ${TRACK_SIZE[size]} ${className ?? ""}`}
    >
      {items.map((item) => {
        const chipClass = `${CHIP} ${CHIP_SIZE[size]} ${item.active ? CHIP_ACTIVE : CHIP_INACTIVE}`;
        const inner = (
          <>
            {item.label}
            {item.count !== undefined && (
              <TabCount value={item.count} active={item.active} attention={item.countNeedsAttention} />
            )}
          </>
        );

        return item.href ? (
          <Link
            key={item.key}
            href={item.href}
            prefetch={false}
            role="tab"
            aria-selected={item.active}
            className={chipClass}
          >
            {inner}
          </Link>
        ) : (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={item.active}
            onClick={item.onSelect}
            className={chipClass}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}

/*
 * The active tab's red is the literal #c0272d rather than a token: the brand
 * red is defined as `--v2-accent` in globals.css, which is scoped to the
 * tms-v2 themes and is NOT in scope inside `.crm-light`, so
 * `var(--v2-accent)` would resolve to nothing here and the fill would
 * silently disappear. lib/domain/reach/signature.ts hardcodes the same value
 * for the same reason. `--bad` is the CRM's red but it is the ERROR red
 * (#ad2a2a) and carries a meaning a selected tab does not.
 *
 * The old ActiveRule (a short red underline inside a white chip) is gone with
 * the chip it lived in — the whole tab is the red now.
 */
