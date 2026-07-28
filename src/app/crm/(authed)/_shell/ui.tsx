import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * CRM page-content primitives. Premium chrome (graphite masthead, rounded-2xl
 * white cards on shadow-e2) mirroring the app's Performance dashboard, resolved
 * against the `.crm-light` theme scope so surfaces stay theme-correct. Colored
 * numerals/labels only ever sit on FIXED surfaces (graphite masthead, tinted
 * pills), never on a themed card — the design system's core rule.
 */

export function PageShell({
  eyebrow,
  title,
  subtitle,
  actions,
  fluid,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Skip the max-w-6xl reading-width cap and use the full content column —
   * for views (like the Pipeline board) that want the available viewport
   * width on desktop rather than a fixed-width page. */
  fluid?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`px-4 py-4 sm:px-6 sm:py-6 ${fluid ? "w-full" : "mx-auto max-w-6xl"}`}
    >
      <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-graphite px-5 py-5 shadow-e2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-on-dark-dim">
              {eyebrow}
            </p>
          )}
          <h1 className="text-[24px] font-bold leading-tight tracking-tight text-white sm:text-[28px]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-[13px] text-on-dark-dim">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
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
      className={`overflow-hidden rounded-2xl border border-line bg-card shadow-e2 ${className ?? ""}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHead({
  title,
  hint,
  right,
}: {
  title: string;
  hint?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
      <div className="min-w-0">
        <h2 className="text-[14px] font-semibold text-fg">{title}</h2>
        {hint && <p className="mt-0.5 text-[12px] text-fg-subtle">{hint}</p>}
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
    <div className="rounded-2xl border border-line bg-card p-4 shadow-e2">
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
