import type { ButtonHTMLAttributes, ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";
import { initials as getInitials } from "../_lib/format";

/**
 * The prototype's design-system primitives. Every screen in /crm-design is
 * built ONLY from these — no page invents its own button color, card
 * shadow, or badge shape. This file (plus crm-design.css's tokens) IS the
 * "establish the design system first" deliverable; see DESIGN_DECISIONS.md
 * for the reasoning behind each choice.
 */

export const PAGE_WIDTH = "mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 sm:py-7";

/** Same vertical rhythm and horizontal padding as PAGE_WIDTH, but no
 * max-width/centering — for the rare screen whose whole point is using the
 * full viewport (currently just the BOL detail workspace's document/fields
 * split, where a centered 1400px box was squeezing the fields panel on any
 * wide monitor). Every other page stays on PAGE_WIDTH; this is deliberately
 * not the default. */
export const PAGE_WIDTH_FULL = "w-full px-4 py-5 sm:px-6 sm:py-7";

// ── Typography scale — five sizes, used consistently everywhere. Nothing
// in this prototype picks an arbitrary one-off text size. ──
export const TEXT = {
  pageTitle: "text-[20px] font-bold tracking-tight",
  sectionTitle: "text-[14px] font-bold tracking-tight",
  body: "text-[13.5px]",
  label: "text-[11px] font-semibold uppercase tracking-[0.08em]",
  micro: "text-[11.5px]",
};

// ── Buttons — ONE hierarchy, three weights, plus semantic danger/ghost.
// No component anywhere in /crm-design defines a button color outside this
// set (this directly answers the real CRM's drifted-red-button history and
// the audit's nav-color-noise finding: pick a rule once, reuse forever). ──
type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "admin";
type BtnSize = "sm" | "md";

const BTN_BASE =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--cd-radius-sm)] font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cd-accent)]";

const BTN_VARIANT: Record<BtnVariant, string> = {
  primary: "bg-[var(--cd-accent)] text-white hover:bg-[var(--cd-accent-hover)]",
  secondary:
    "bg-[var(--cd-surface)] text-[var(--cd-text)] border border-[var(--cd-border-strong)] hover:bg-[var(--cd-surface-2)]",
  ghost: "bg-transparent text-[var(--cd-text-muted)] hover:bg-[var(--cd-surface-2)] hover:text-[var(--cd-text)]",
  danger: "bg-[var(--cd-danger-soft)] text-[var(--cd-danger)] border border-transparent hover:bg-[var(--cd-danger)] hover:text-white",
  admin: "bg-[var(--cd-admin)] text-white hover:bg-[var(--cd-admin-hover)]",
};

const BTN_SIZE: Record<BtnSize, string> = {
  sm: "h-8 px-3 text-[12.5px]",
  md: "h-9.5 px-4 text-[13.5px]",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  children,
  ...rest
}: {
  variant?: BtnVariant;
  size?: BtnSize;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`${BTN_BASE} ${BTN_VARIANT[variant]} ${BTN_SIZE[size]} ${className ?? ""}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  variant = "secondary",
  size = "md",
  className,
  href,
  children,
}: {
  variant?: BtnVariant;
  size?: BtnSize;
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`${BTN_BASE} ${BTN_VARIANT[variant]} ${BTN_SIZE[size]} ${className ?? ""}`}>
      {children}
    </Link>
  );
}

// ── Cards ──
export function Card({ className, children, ...rest }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={`overflow-hidden rounded-[var(--cd-radius-md)] border border-[var(--cd-border)] bg-[var(--cd-surface)] shadow-[var(--cd-shadow)] ${className ?? ""}`}
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
  hint?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--cd-border)] bg-[var(--cd-surface-2)] px-4 py-2.5">
      <div className="min-w-0">
        <h2 className={`truncate ${TEXT.sectionTitle} text-[var(--cd-text)]`}>{title}</h2>
        {/* Card-head hints are counts/context a user actually reads ("12
            companies", "3 open tasks") — secondary tier, not decoration. */}
        {hint && <p className={`truncate ${TEXT.micro} text-[var(--cd-text-muted)]`}>{hint}</p>}
      </div>
      {right}
    </div>
  );
}

export const ZEBRA = "[&>*:nth-child(odd)]:bg-[var(--cd-surface)] [&>*:nth-child(even)]:bg-[var(--cd-surface-2)]";

/** Row/menu-item hover — one shared fill for every interactive row in the
 * prototype (table rows, list rows, dropdown items) so hover feedback reads
 * identically everywhere instead of some rows having none at all. */
export const ROW_HOVER = "transition-colors hover:bg-[var(--cd-surface-hover)]";

/** Column-header row for a raw `<table><thead><tr>` list — the tabular
 * equivalent of CardHead, same dark-on-light-gray bar treatment, secondary
 * (not tertiary) text since column headers are information a user reads on
 * every single row below them. Apply to the `<tr>` inside `<thead>`. */
export const LIST_HEAD_ROW =
  "border-b border-[var(--cd-border)] bg-[var(--cd-surface-2)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--cd-text-muted)]";

// ── Badges — status/role pills. Colors are pulled ONLY from the semantic
// token set (accent/success/warning/danger/admin/neutral) — never a
// one-off hex, so a badge's color always maps to a real meaning. ──
type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "admin";
// Every tone gets a tone-matched border (not just neutral) — on a card
// header or a zebra alt-row (both now a visible gray), a border-less soft-fill
// badge could otherwise sit at low contrast against its own background.
const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "bg-[var(--cd-surface-2)] text-[var(--cd-text-muted)] border border-[var(--cd-border-strong)]",
  accent: "bg-[var(--cd-accent-soft)] text-[var(--cd-accent)] border border-[var(--cd-accent)]/25",
  success: "bg-[var(--cd-success-soft)] text-[var(--cd-success)] border border-[var(--cd-success)]/25",
  warning: "bg-[var(--cd-warning-soft)] text-[var(--cd-warning)] border border-[var(--cd-warning)]/25",
  danger: "bg-[var(--cd-danger-soft)] text-[var(--cd-danger)] border border-[var(--cd-danger)]/25",
  admin: "bg-[var(--cd-admin-soft)] text-[var(--cd-admin)] border border-[var(--cd-admin)]/25",
};
export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide leading-none ${BADGE_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-[var(--cd-accent)] font-semibold text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {getInitials(name)}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumb,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {breadcrumb}
        <h1 className={`${TEXT.pageTitle} text-[var(--cd-text)]`}>{title}</h1>
        {subtitle && <p className={`mt-0.5 ${TEXT.body} text-[var(--cd-text-muted)]`}>{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className={`mb-1 flex flex-wrap items-center gap-1.5 ${TEXT.micro} text-[var(--cd-text-subtle)]`}>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {item.href ? (
            <Link href={item.href} className="hover:text-[var(--cd-accent)]">
              {item.label}
            </Link>
          ) : (
            <span className="text-[var(--cd-text-muted)]">{item.label}</span>
          )}
          {i < items.length - 1 && <span>/</span>}
        </span>
      ))}
    </nav>
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
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--cd-surface-2)] text-[var(--cd-text-subtle)]">
          {icon}
        </span>
      )}
      <div>
        <p className={`${TEXT.body} font-semibold text-[var(--cd-text)]`}>{title}</p>
        <p className={`mx-auto mt-1 max-w-sm ${TEXT.micro} leading-relaxed text-[var(--cd-text-muted)]`}>{body}</p>
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ title, body, onRetry }: { title: string; body: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--cd-danger-soft)] text-[var(--cd-danger)]">
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path d="M12 3.5 21.5 20h-19L12 3.5Z" strokeLinejoin="round" />
          <path d="M12 9.5v5M12 17.5h0" strokeLinecap="round" />
        </svg>
      </span>
      <div>
        <p className={`${TEXT.body} font-semibold text-[var(--cd-text)]`}>{title}</p>
        <p className={`mx-auto mt-1 max-w-sm ${TEXT.micro} leading-relaxed text-[var(--cd-text-muted)]`}>{body}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={`cd-skeleton ${className ?? "h-4 w-full"}`} />;
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Sunken fill (--cd-surface-2, not white) so an input visibly reads as
// "editable" against both the page canvas AND the white card it usually
// sits inside — a white-on-white input was one of the flattest spots in the
// original build. Border strengthened to match.
export const INPUT =
  "h-9.5 w-full rounded-[var(--cd-radius-sm)] border border-[var(--cd-border-strong)] bg-[var(--cd-surface-2)] px-3 text-[13.5px] text-[var(--cd-text)] outline-none transition-colors placeholder:text-[var(--cd-text-subtle)] focus:border-[var(--cd-accent)] focus:bg-[var(--cd-surface)] focus:ring-2 focus:ring-[var(--cd-accent-soft)]";

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      {/* Field labels are read every time — secondary tier, not the lowest
          one (the previous subtle/11px combination was the exact "tiny
          helper text nobody can read" pattern Brent flagged). */}
      <span className={`${TEXT.label} text-[var(--cd-text-muted)]`}>{label}</span>
      {children}
      {hint && <span className={`${TEXT.micro} text-[var(--cd-text-subtle)]`}>{hint}</span>}
    </label>
  );
}
