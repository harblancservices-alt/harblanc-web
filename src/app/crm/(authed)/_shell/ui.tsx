import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";

/**
 * CRM page-content primitives — square white cards on shadow-e2, resolved
 * against the `.crm-light` theme scope so surfaces stay theme-correct.
 * Square corners are the CRM-wide rule everywhere EXCEPT buttons (Brent's
 * explicit call) — Card/CardHead/StatTile/etc. below carry no rounded-*
 * class; BTN_PRIMARY/BTN_EDIT/etc. further down are still meant to be
 * rendered with a rounded-* class at the call site, unchanged.
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
      className={`overflow-hidden border border-line-strong bg-card shadow-e2 ${className ?? ""}`}
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
 * than blending into it. Deliberately slim (a title bar, not a banner) — the
 * owner's call after the original py-4/15.5px treatment ate too much vertical
 * space stacked across a page of cards. Raw `<table>` column-header rows use
 * the matching `LIST_HEAD_ROW` class below so the two ways a CRM list renders
 * (Card+CardHead, or a `<thead>`) read as one consistent style; any hand-built
 * dark bar elsewhere in the CRM (e.g. the calendar day modal) should match
 * this exact padding/type scale rather than drifting its own.
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
    <div className="flex items-center justify-between gap-3 border-b border-graphite-line bg-bar px-4 py-2.5">
      <div className="min-w-0">
        <h2 className="truncate text-[13.5px] font-bold tracking-tight text-bar-fg">
          {title}
        </h2>
        {hint && (
          <p className="truncate text-[11px] font-medium text-bar-fg/70">
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
 * `<thead>`; each `<th>` keeps its own padding — use `px-5 py-2` to match
 * CardHead's slim height. */
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

/**
 * Semantic button color standard — CRM-wide.
 *
 * Color-only fragments (border + background + text + hover + disabled) meant
 * to replace the border/bg/text/hover portion of a button's className, while
 * the call site keeps its own sizing (rounded-*, px/py, text size, font
 * weight, `transition-colors`). Established because task-card and dialog
 * buttons had drifted to a single faint-gray "does everything" look
 * regardless of what the button actually did — buttons should carry meaning.
 *
 *   BTN_PRIMARY — filled blue.   Save / Add / Create / Search / primary CTA.
 *   BTN_SUCCESS — filled green.  Done / Complete / Release to team / approve.
 *   BTN_RED     — filled dc2626. Operational actions — Log call, Add person,
 *                 Add task, Note, Email, and the per-contact card actions.
 *                 Brent's explicit call: these read as "do something now"
 *                 across the whole CRM, distinct from BTN_DANGER's lighter
 *                 red (an actual destructive Delete/Discard/Remove).
 *   BTN_EDIT    — blue outline.  Edit / Open / View / secondary navigate.
 *   BTN_WARNING — amber outline. Reschedule / snooze / date changes.
 *   BTN_DANGER  — red outline.   Delete / Discard / Remove / Reject.
 *   BTN_NEUTRAL — neutral outline. Cancel / dismiss / Clear filters.
 */
export const BTN_PRIMARY =
  "border border-accent bg-accent text-white hover:bg-accent-hover disabled:opacity-60";
export const BTN_SUCCESS =
  "border border-ok bg-ok text-white hover:bg-ok/90 disabled:opacity-60";
export const BTN_RED =
  "border border-[#dc2626] bg-[#dc2626] text-white hover:bg-[#b91c1c] disabled:opacity-60";
export const BTN_EDIT =
  "border border-accent/40 bg-card text-accent hover:bg-accent/10 disabled:opacity-60";
export const BTN_WARNING =
  "border border-warn/40 bg-card text-warn hover:bg-warn/10 disabled:opacity-60";
export const BTN_DANGER =
  "border border-bad/30 bg-bad-bg text-bad hover:bg-bad/10 disabled:opacity-60";
export const BTN_NEUTRAL =
  "border border-fg-subtle bg-card text-fg-muted hover:bg-inset hover:text-fg disabled:opacity-60";

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
    <div className="border border-line-strong bg-card p-4 shadow-e2">
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

/**
 * A KPI tile that doubles as a quick-action button — same visual weight as
 * StatTile (rounded-2xl card, mono value) plus a small icon chip and a "Quick
 * …" cta that appears on hover/focus, so it reads as tappable rather than a
 * plain readout. Only ever rendered from inside a Client Component (the icon
 * chip's hover state and `onClick` require one) — see QuickActions.tsx.
 */
export function StatButton({
  label,
  value,
  cta,
  icon,
  onClick,
}: {
  label: string;
  value: string;
  /** Short verb phrase shown on hover, e.g. "Quick add". */
  cta: string;
  icon?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full flex-col items-start border border-line-strong bg-card p-4 text-left shadow-e2 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-e3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <div className="flex w-full items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
          {label}
        </p>
        {icon && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-white">
            {icon}
          </span>
        )}
      </div>
      <p className="mt-1.5 font-mono text-[28px] font-semibold tabular-nums leading-none text-fg">
        {value}
      </p>
      <span className="mt-1.5 text-[11.5px] font-semibold text-accent opacity-0 transition-opacity group-hover:opacity-100">
        {cta} →
      </span>
    </button>
  );
}

/** A KPI tile that's just a link (no dialog) — the "Customers" card, which
 * only ever routes to /crm/customers rather than opening a quick-add flow. */
export function StatLinkTile({
  href,
  label,
  value,
}: {
  href: string;
  label: string;
  value: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="group flex flex-col items-start border border-line-strong bg-card p-4 text-left shadow-e2 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-e3"
    >
      <div className="flex w-full items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
          {label}
        </p>
        <span className="text-fg-subtle transition-colors group-hover:text-accent">
          →
        </span>
      </div>
      <p className="mt-1.5 font-mono text-[28px] font-semibold tabular-nums leading-none text-fg">
        {value}
      </p>
    </Link>
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
        <span className="flex h-12 w-12 items-center justify-center bg-inset text-fg-subtle">
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
