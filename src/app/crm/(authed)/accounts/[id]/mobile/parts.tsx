import type { ReactNode } from "react";
import { IconChevronDown } from "../../../_shell/icons";
import { M_CAP, M_CARD_FLAT, M_H3, M_SQ } from "./ui";

/**
 * Small structural pieces shared across the mobile company profile. All
 * Server Components — nothing here holds state, and the only props are
 * plain values or already-built ReactNodes, so any of them can host a
 * client component (or an async Server Component like ShipmentsTab) as
 * children without a boundary problem.
 */

/** The uppercase caption sitting ABOVE a card, with an optional right-hand
 * action (an "+ Add …" trigger, a "See all ›" link). */
export function SectionHead({
  label,
  count,
  action,
}: {
  label: string;
  /** Rendered as "· 3" after the label, in the caption's own weight. */
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2.5 px-0.5 pt-1">
      <span className={M_CAP}>
        {label}
        {typeof count === "number" && count > 0 && <span className="text-fg"> · {count}</span>}
      </span>
      {action}
    </div>
  );
}

/** A heading INSIDE a card — a tinted icon square + uppercase label, the
 * same idiom CommoditiesCard already uses, with an optional right action. */
export function CardHeading({
  icon,
  tint,
  label,
  action,
}: {
  icon: ReactNode;
  /** e.g. "bg-ok-bg text-ok" — tokens only. */
  tint: string;
  label: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-[13px] pt-[11px]">
      <div className="flex min-w-0 items-center gap-2">
        <span className={`${M_SQ} ${tint}`}>{icon}</span>
        <h3 className={M_H3}>{label}</h3>
      </div>
      {action}
    </div>
  );
}

/**
 * A collapsible "More" section.
 *
 * Plain `<details>/<summary>` on purpose: it needs no JavaScript, stays a
 * Server Component, and therefore can host the async Server Components this
 * profile already renders (ShipmentsTab, CompanyProfileSection) as children
 * without wrapping them in a client boundary. The workspace TABS the old
 * mobile layout used kept every panel mounted-but-hidden, which meant a
 * phone paid to render Shipments, Documents and Notes on every single
 * profile view; `<details>` renders the same real components, just folded.
 */
export function MobileAccordion({
  label,
  count,
  icon,
  children,
  defaultOpen = false,
}: {
  label: string;
  count?: number;
  icon: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className={M_CARD_FLAT} open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-[13px] py-[13px] text-[13.5px] font-extrabold tracking-[-0.005em] text-fg [&::-webkit-details-marker]:hidden">
        <span className={`${M_SQ} h-[29px] w-[29px] rounded-lg bg-accent/10 text-accent`}>{icon}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {typeof count === "number" && count > 0 && (
          <span className="crm-num shrink-0 rounded-full border border-line bg-inset px-2 py-0.5 text-[11px] font-extrabold text-fg-muted">
            {count}
          </span>
        )}
        <span className="shrink-0 text-fg-muted">
          <IconChevronDown width={15} height={15} />
        </span>
      </summary>
      <div className="border-t border-line">{children}</div>
    </details>
  );
}
