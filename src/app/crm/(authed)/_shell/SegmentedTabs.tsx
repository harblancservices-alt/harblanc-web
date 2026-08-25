"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The CRM's ONE segmented tab row — Brent's pick (option 2 of the tab-styles
 * sheet, 2026-08-25). The whole row sits in a light track; the active tab
 * lifts out of it as a white chip with a short red rule along its bottom
 * inside edge, so which tab is selected is obvious at a glance instead of
 * being carried by text weight alone.
 *
 * ONE component, used everywhere, deliberately: before this, five tab rows
 * each hand-rolled the same pill-in-a-bar and had already drifted apart —
 * different paddings, different text sizes, different active colors (violet
 * in Admin, steel-blue in Operations), and one that silently became a
 * three-column grid on mobile. Restyling each row separately would have
 * recreated exactly that drift.
 *
 * NESTING (from the same sheet's footnote): use this on the INNER row where
 * tabs sit inside tabs, and give the outer row a different shape — option 1
 * (underline) or option 4 (boxed) — so the two levels never look alike.
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
  /** Count pill or attention badge, rendered after the label. */
  badge?: ReactNode;
};

/** Track: hugs its content (never full-width), light fill, hairline, 4px. */
const TRACK =
  "inline-flex w-fit max-w-full items-stretch gap-0 overflow-x-auto rounded-[4px] border border-line bg-inset p-[3px]";

/** Every chip, active or not. `relative` anchors the active red rule. */
const CHIP =
  "relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[3px] px-[15px] py-[7px] text-[13px] leading-tight transition-colors";

/** Active: lifts to white, inset from the track by the track's own 3px pad. */
const CHIP_ACTIVE = "border border-line bg-card font-semibold text-fg";

/** Inactive: no fill at all — only the text darkens on hover, so the active
 * chip stays the loudest thing in the row. */
const CHIP_INACTIVE = "border border-transparent font-normal text-fg-muted hover:text-fg";

export function SegmentedTabs({
  items,
  ariaLabel,
  className,
}: {
  items: SegmentedTabItem[];
  ariaLabel: string;
  /** Extra classes on the TRACK (e.g. a margin). Not for restyling it. */
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={`${TRACK} ${className ?? ""}`}>
      {items.map((item) => {
        const chipClass = `${CHIP} ${item.active ? CHIP_ACTIVE : CHIP_INACTIVE}`;
        const inner = (
          <>
            {item.label}
            {item.badge}
            {item.active && <ActiveRule />}
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

/**
 * The 2px brand-red rule along the active chip's bottom inside edge.
 *
 * Literal #c0272d rather than a token: the brand red is defined as
 * `--v2-accent` in globals.css, which is scoped to the tms-v2 themes and is
 * NOT in scope inside `.crm-light`, so `var(--v2-accent)` would resolve to
 * nothing here and the rule would silently disappear. lib/domain/reach/
 * signature.ts hardcodes the same value for the same reason. `--bad` is the
 * CRM's red but it is the ERROR red (#ad2a2a) and carries a meaning this rule
 * does not have.
 *
 * Sits at bottom-[1px] so it reads as inside the chip's border rather than
 * replacing it, and inset horizontally so it's a short rule under the label,
 * not a full-width underline.
 */
function ActiveRule() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-[6px] bottom-[1px] h-[2px] rounded-full bg-[#c0272d]"
    />
  );
}
