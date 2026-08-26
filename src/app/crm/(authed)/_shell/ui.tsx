import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";

/**
 * CRM page-content primitives — white cards on shadow-e2, resolved
 * against the `.crm-light` theme scope so surfaces stay theme-correct.
 * Softly rounded corners are the CRM-wide rule (2026-08-09, Brent's call —
 * gentle 8px on cards/panels/tiles, 6px on form controls) — Card/StatTile/
 * etc. below carry `rounded-lg`; CardHead relies on Card's `overflow-hidden`
 * to clip its top corners rather than rounding itself. BTN_PRIMARY/BTN_EDIT/
 * etc. further down are still meant to be rendered with a rounded-* class at
 * the call site, unchanged.
 */

/** Shared page-content width, used by PageShell and the couple of detail
 * pages (company profile, member activity) that build their own header
 * instead of going through PageShell — so every /crm page uses the same
 * available width next to the sidebar rather than a narrow reading column. */
export const PAGE_CONTAINER = "mx-auto w-full max-w-[1600px] px-4 py-4 sm:px-6 sm:py-6";

export function PageShell({
  title,
  subtitle,
  back,
  actions,
  children,
}: {
  /** Page heading, every breakpoint. Matches /crm-design's `PageHeader`
   * (2026-08-20): title + subtitle sit together on the left, actions on the
   * right, all in ONE row — was a separate title line above a second
   * back/actions row. Omit to render nothing, exactly like before this prop
   * existed. */
  title?: string;
  /** One subtitle line under the title (e.g. a count or a scope note —
   * "42 companies in your org.", "Showing only companies assigned to you."),
   * matching crm-design's `PageHeader` subtitle slot. */
  subtitle?: ReactNode;
  /** An inline BackButton (or similar) — rendered as its own row above the
   * title, crm-design's `breadcrumb` slot equivalent. */
  back?: ReactNode;
  /** Per-page action controls (Add company, Add task, ...), rendered on the
   * same row as the title, right-aligned. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={PAGE_CONTAINER}>
      {back && <div className="mb-2">{back}</div>}
      {(title || actions) && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h1 className="truncate text-[20px] font-bold tracking-tight text-fg">{title}</h1>}
            {subtitle && <p className="mt-0.5 text-[13px] text-fg-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
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
      className={`overflow-hidden rounded-lg border border-line-strong bg-card shadow-e2 ${className ?? ""}`}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * The header band for a Card/section — the ONE place this hierarchy level is
 * styled, so every CRM page (dashboard, Companies, Tasks, Settings,
 * AI Agent, AI Review, Admin) reads identically.
 *
 * 2026-08-20: rebuilt to match /crm-design's CardHead exactly (Brent's
 * explicit, forceful direction — the real CRM must visually BECOME the
 * approved prototype, not land on "close enough"). A light `bg-inset`
 * band (crm-design's `--cd-surface-2`) with near-black `text-fg` lettering
 * — NOT the previous solid dark-graphite `bg-bar`/white-text treatment.
 * That dark-bar version was a deliberate, approved CRM-only choice at the
 * time it shipped, but it's exactly the kind of "doesn't look like the
 * prototype" divergence this migration exists to remove — every card
 * header, table header, and section band in /crm-design is this light
 * gray-blue tone, never a black bar. Raw `<table>` column-header rows use
 * the matching `LIST_HEAD_ROW` class below so the two ways a CRM list
 * renders (Card+CardHead, or a `<thead>`) read as one consistent style.
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
    <div className="flex items-center justify-between gap-3 border-b border-line bg-inset px-4 py-2.5">
      <div className="min-w-0">
        <h2 className="truncate text-[14px] font-bold tracking-tight text-fg">
          {title}
        </h2>
        {hint && (
          <p className="truncate text-[11.5px] font-medium text-fg-muted">
            {hint}
          </p>
        )}
      </div>
      {right}
    </div>
  );
}

/** Column-header row for a raw `<table><thead><tr>` list (Contacts,
 * Companies, …) — the tabular equivalent of CardHead, same light
 * `bg-inset`/`text-fg-muted` treatment (crm-design's LIST_HEAD_ROW,
 * 2026-08-20) so every CRM list header reads identically whether it's a
 * card section or a real table. Apply to the `<tr>` inside `<thead>`; each
 * `<th>` keeps its own padding — use `px-5 py-2` to match CardHead's slim
 * height. */
export const LIST_HEAD_ROW =
  "border-b border-line bg-inset text-[11px] font-bold uppercase tracking-[0.08em] text-fg-muted";

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
 *   BTN_PRIMARY — filled steel-blue (var(--accent)). Save / Add / Create /
 *                 Search / primary CTA.
 *   BTN_SUCCESS — filled green.  Done / Complete / approve.
 *   BTN_ACTION  — filled 2563eb. Operational actions — Log call, Add person,
 *                 Add task, Note, Email, and the per-contact card actions.
 *                 Brent's explicit call: these read as "do something now"
 *                 across the whole CRM, distinct from both BTN_PRIMARY's
 *                 steel-blue and BTN_DANGER's red (an actual destructive
 *                 Delete/Discard/Remove). Was BTN_RED/dc2626 — Brent's
 *                 2026-08-08 correction retired every red operational
 *                 button in favor of this blue; the STAGE tracker's
 *                 current-stage chevron matches (see StageTracker.tsx).
 *                 Destructive actions (BTN_DANGER) are unchanged — that's a
 *                 different semantic category, not a "primary/action" button.
 *   BTN_EDIT    — blue outline.  Edit / Open / View / secondary navigate.
 *   BTN_WARNING — amber outline. Reschedule / snooze / date changes.
 *   BTN_DANGER  — red outline.   Delete / Discard / Remove / Reject.
 *   BTN_NEUTRAL — neutral outline. Cancel / dismiss / Clear filters.
 */
export const BTN_PRIMARY =
  "border border-accent bg-accent text-white hover:bg-accent-hover disabled:opacity-60";
export const BTN_SUCCESS =
  "border border-ok bg-ok text-white hover:bg-ok/90 disabled:opacity-60";
export const BTN_ACTION =
  "border border-[#2563eb] bg-[#2563eb] text-white hover:bg-[#1d4ed8] disabled:opacity-60";
export const BTN_EDIT =
  "border border-accent/40 bg-card text-accent hover:bg-accent/10 disabled:opacity-60";
export const BTN_WARNING =
  "border border-warn/40 bg-card text-warn hover:bg-warn/10 disabled:opacity-60";
export const BTN_DANGER =
  "border border-bad/30 bg-bad-bg text-bad hover:bg-bad/10 disabled:opacity-60";
export const BTN_NEUTRAL =
  "border border-fg-subtle bg-card text-fg-muted hover:bg-inset hover:text-fg disabled:opacity-60";

/**
 * DEPTH_* — the "tactile" button treatment. Same semantic colors as each
 * BTN_* counterpart above, plus a soft elevation shadow (the real shadow-e1
 * token) combined with an inset bottom-edge line for solid buttons, or a
 * doubled border-line-strong + a semantic-color ring for outline buttons.
 * Every value referenced (--shadow-e1, --accent-hover, --line-strong,
 * --accent/--ok/--warn/--bad) is an existing `.crm-light` token — nothing new.
 *
 * Originally page-scoped to the BOL detail page's visual-hierarchy pass
 * (Brent, approved 2026-08-21); promoted here unchanged when the task card's
 * Style-C rebuild adopted the same treatment, so the two can't drift.
 * (bol-center/[id]/buttonDepth.ts re-exported these until that page was
 * retired on 2026-08-26; this is now the only definition.)
 *
 * Each constant is a single, fully self-contained class string — never
 * composed on top of a BTN_* import — so there's no risk of two utilities
 * fighting over the same CSS property (border-width, box-shadow) depending
 * on Tailwind's generated stylesheet order.
 *
 * DEPTH_SUCCESS's bottom edge uses --line-strong (neutral), not a darker
 * green: `.crm-light` defines --ok/--ok-bg only, no darker "ok-hover" token
 * exists anywhere in globals.css (unlike --accent/--accent-hover).
 *
 * Disabled states use opacity-60 and drop the shadow — never a faint grey
 * swap, so a pending button stays legible.
 */
export const DEPTH_PRIMARY =
  "border border-accent bg-accent text-white shadow-[var(--shadow-e1),inset_0_-2px_0_0_var(--accent-hover)] hover:bg-accent-hover disabled:opacity-60 disabled:shadow-none";

export const DEPTH_SUCCESS =
  "border border-ok bg-ok text-white shadow-[var(--shadow-e1),inset_0_-2px_0_0_var(--line-strong)] hover:bg-ok/90 disabled:opacity-60 disabled:shadow-none";

export const DEPTH_EDIT =
  "border-2 border-line-strong bg-card text-accent ring-1 ring-accent/30 shadow-e1 hover:bg-accent/10 disabled:opacity-60";

export const DEPTH_WARNING =
  "border-2 border-line-strong bg-card text-warn ring-1 ring-warn/30 shadow-e1 hover:bg-warn/10 disabled:opacity-60";

export const DEPTH_DANGER =
  "border-2 border-line-strong bg-bad-bg text-bad ring-1 ring-bad/30 shadow-e1 hover:bg-bad/10 disabled:opacity-60";

export const DEPTH_NEUTRAL =
  "border-2 border-line-strong bg-card text-fg-muted ring-1 ring-fg-subtle/20 shadow-e1 hover:bg-inset hover:text-fg disabled:opacity-60";

/**
 * Status/role pill — matches /crm-design's Badge exactly (2026-08-20 full
 * visual migration): `rounded-full`, 11px bold uppercase, a tone-matched
 * soft fill + a tone-matched border at 45% opacity (not the sharp-cornered,
 * borderless chips hand-rolled per usage across the CRM before this pass).
 * Colors pull only from the semantic token set — never a one-off hex — so
 * every badge in the app maps to a real, learnable meaning. Use this for
 * every new status/role pill; existing hand-rolled ones are being migrated
 * to it screen by screen.
 */
const BADGE_TONE = {
  neutral: "bg-inset text-fg-muted border border-line-strong",
  accent: "bg-accent/10 text-accent border border-accent/45",
  success: "bg-ok-bg text-ok border border-ok/45",
  warning: "bg-warn-bg text-warn border border-warn/45",
  danger: "bg-bad-bg text-bad border border-bad/45",
  admin: "bg-admin-soft text-admin border border-admin/45",
} as const;
export type BadgeTone = keyof typeof BADGE_TONE;
export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide leading-none ${BADGE_TONE[tone]}`}
    >
      {children}
    </span>
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
    <div className="rounded-lg border border-line-strong bg-card p-4 shadow-e2">
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
      className="group flex w-full flex-col items-start rounded-lg border border-line-strong bg-card p-4 text-left shadow-e2 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-e3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <div className="flex w-full items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
          {label}
        </p>
        {icon && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-white">
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
      className="group flex flex-col items-start rounded-lg border border-line-strong bg-card p-4 text-left shadow-e2 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-e3"
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
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-inset text-fg-subtle">
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
