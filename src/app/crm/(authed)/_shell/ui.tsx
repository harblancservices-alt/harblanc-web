import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * CRM page-content primitives — rounded-2xl white cards on shadow-e2,
 * resolved against the `.crm-light` theme scope so surfaces stay
 * theme-correct.
 */

/** Shared page-content width, used by PageShell and the couple of detail
 * pages (company profile, member activity) that build their own header
 * instead of going through PageShell — so every /crm page uses the same
 * available width next to the sidebar rather than a narrow reading column. */
export const PAGE_CONTAINER = "mx-auto w-full max-w-[1600px] px-4 py-4 sm:px-6 sm:py-6";

export function PageShell({
  back,
  actions,
  children,
}: {
  /** An inline BackButton (or similar), rendered top-left. */
  back?: ReactNode;
  /** Per-page action controls (Add company, Add task, ...), rendered top-right. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={PAGE_CONTAINER}>
      {(back || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">{back}</div>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </div>
      )}
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function Card({
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-line-strong bg-card shadow-e2 ${className ?? ""}`}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * The header band for a Card/section — the ONE place this hierarchy level is
 * styled, so every CRM page (dashboard, Companies, Tasks, Settings,
 * AI Agent, AI Review) reads identically. A solid graphite `bg-bar` bar with
 * white `text-bar-fg` lettering — the same dark chrome token the sidebar
 * uses — so the header unmistakably "sits above" the list beneath it rather
 * than blending into it. Raw `<table>` column-header rows use the matching
 * `LIST_HEAD_ROW` class below so the two ways a CRM list renders (Card+
 * CardHead, or a `<thead>`) read as one consistent style.
 */
export function CardHead({
  title,
  hint,
  right,
}: {
  title: string;
  hint?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-t-2xl border-b border-graphite-line bg-bar px-5 py-4">
      <div className="min-w-0">
        <h2 className="truncate text-[15.5px] font-bold tracking-tight text-bar-fg">
          {title}
        </h2>
        {hint && (
          <p className="mt-0.5 truncate text-[12px] font-medium text-bar-fg/70">
            {hint}
          </p>
        )}
      </div>
      {right}
    </div>
  );
}

/** Column-header row for a raw `<table><thead><tr>` list (Contacts,
 * Companies, …) — the tabular equivalent of CardHead, same `bg-bar` /
 * `text-bar-fg` dark treatment so every CRM list header reads identically
 * whether it's a card section or a real table. Apply to the `<tr>` inside
 * `<thead>`; each `<th>` keeps its own padding. */
export const LIST_HEAD_ROW =
  "bg-bar text-[11px] font-semibold uppercase tracking-[0.1em] text-bar-fg";

/**
 * Zebra-striped rows for a CRM record list — alternating `bg-card` (white)
 * and `bg-inset` (light gray) surfaces under a dark CardHead/LIST_HEAD_ROW,
 * so each row/card reads clearly against its neighbors going down the list.
 * Apply to the DIRECT PARENT of the repeating rows (`<tbody>`, `<ul>`, or a
 * card grid `<div>`) — an `:nth-child` selector on every child, so it works
 * regardless of whether each row is a `<tr>`, `<li>`, or a self-styled card
 * `<div>` (the `nth-child(even)` rule's two-class specificity beats a card's
 * own single `bg-card` class, so it always wins without !important).
 */
export const ZEBRA_ROWS =
  "[&>*:nth-child(odd)]:bg-card [&>*:nth-child(even)]:bg-inset";

export function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-line-strong bg-card p-4 shadow-e2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
        {label}
      </p>
      <p className="mt-1.5 font-mono text-[28px] font-semibold tabular-nums leading-none text-fg">
        {value}
      </p>
      {sub && <p className="mt-1.5 text-[12px] text-fg-muted">{sub}</p>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon && (
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-inset text-fg-subtle">
          {icon}
        </span>
      )}
      <div>
        <p className="text-[15px] font-semibold text-fg">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-fg-muted">
          {body}
        </p>
      </div>
      {action}
    </div>
  );
}
