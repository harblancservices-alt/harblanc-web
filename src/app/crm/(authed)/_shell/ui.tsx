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
 * AI Agent, AI Review) reads identically. Deliberately styled to be
 * unmistakably heavier than the item rows/cards beneath it: bold + slightly
 * larger near-black title, a light `bg-inset` band tint, and a `line-strong`
 * bottom border — so the header visually "sits above" the list rather than
 * blending into it (rows use `font-semibold` at a smaller size, so the size +
 * weight jump alone reads as a hierarchy level, no color trick needed).
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
    <div className="flex items-center justify-between gap-3 rounded-t-2xl border-b border-line-strong bg-inset px-5 py-4">
      <div className="min-w-0">
        <h2 className="truncate text-[15.5px] font-bold tracking-tight text-fg">
          {title}
        </h2>
        {hint && (
          <p className="mt-0.5 truncate text-[12px] font-medium text-fg-subtle">
            {hint}
          </p>
        )}
      </div>
      {right}
    </div>
  );
}

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
