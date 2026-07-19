import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { StatusTag, type StatusTone } from "@/components/ui/StatusTag";
import { IntervalBar } from "./IntervalBar";
import {
  CATEGORY_SLUG,
  FRESHNESS_META,
  POSITION_LABEL,
  formatDate,
  isPosition,
  type Category,
  type Freshness,
  type MaintStatus,
} from "@/lib/dispatch/repair-log";
import type { RepairEntry, ReminderView } from "./types";

/**
 * Shared, presentational building blocks for the maintenance surfaces (home,
 * category, detail, set). Directive-less so both server and client parents can
 * use them.
 */

export const STATUS_TONE: Record<MaintStatus, StatusTone> = {
  overdue: "red",
  soon: "amber",
  ok: "green",
  baseline: "steel",
};
export const STATUS_LABEL: Record<MaintStatus, string> = {
  overdue: "Overdue",
  soon: "Due soon",
  ok: "OK",
  baseline: "No baseline",
};

export function reminderRemaining(r: ReminderView): {
  text: string;
  color: string;
} {
  if (r.milesRemaining == null) {
    return { text: "set baseline", color: "text-steel" };
  }
  const m = r.milesRemaining;
  if (m <= 0) {
    return { text: `${Math.abs(m).toLocaleString()} mi over`, color: "text-bad" };
  }
  return {
    text: `${m.toLocaleString()} mi left`,
    color: r.status === "soon" ? "text-warn" : "text-ok",
  };
}

// ── Odometer hero (money de-emphasized — no cost KPIs) ─────────────────────
export function OdometerHero({ currentOdo }: { currentOdo: number }) {
  return (
    // Clean card, same chrome as the trip cards and the load board's KPI
    // tiles (rounded-lg, border-line-strong, bg-card, e2). The reading still
    // leads the page — on size and weight alone, not on a black fill with an
    // accent rail.
    <div className="rounded-lg border border-line-strong bg-card p-5 shadow-e2">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">
        Current odometer
      </p>
      <p className="mt-1.5 font-mono text-[34px] font-bold leading-none tabular-nums text-ink sm:text-[40px]">
        {currentOdo.toLocaleString()}
        <span className="ml-1.5 text-[16px] font-semibold text-ink-3">
          mi
        </span>
      </p>
      <p className="mt-2 text-[11.5px] text-ink-2">
        Highest reading across all loads · 2018 Ram 2500 · 6.7L Cummins
      </p>
    </div>
  );
}

export function SectionLabel({
  title,
  count,
  inline = false,
}: {
  title: string;
  count?: number;
  inline?: boolean;
}) {
  return (
    <div className={inline ? "flex items-center gap-2" : "mb-2 flex items-center gap-2"}>
      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-ink-3">
        {title}
      </span>
      {count != null ? (
        <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
          · {count}
        </span>
      ) : null}
    </div>
  );
}

export function FreshnessBadge({ freshness }: { freshness: Freshness }) {
  const fm = FRESHNESS_META[freshness];
  return (
    <StatusTag tone={fm.tone} className="shrink-0">
      {fm.label}
    </StatusTag>
  );
}

const CATEGORY_BADGE: Record<
  "overdue" | "soon" | "aging",
  { tone: StatusTone; label: string }
> = {
  overdue: { tone: "red", label: "Overdue" },
  soon: { tone: "amber", label: "Due soon" },
  aging: { tone: "steel", label: "Aging" },
};

export function CategoryBadge({
  badge,
}: {
  badge: "overdue" | "soon" | "aging" | null;
}) {
  if (!badge) return null;
  const b = CATEGORY_BADGE[badge];
  return (
    <StatusTag tone={b.tone} className="shrink-0">
      {b.label}
    </StatusTag>
  );
}

// ── Reminder card (alert strips) ───────────────────────────────────────────
/**
 * A needs-attention service item, wearing the trip cards' chrome: white card on
 * a strong hairline with e2/e3 elevation, the part name leading and its status
 * pill holding the right edge, the part group + interval as meta chips, then one
 * inset stat module (Miles left · Interval · Last serviced) and the interval bar
 * as a footer. Presentational only — every number is the loader's computed
 * ReminderView, and Miles left reuses reminderRemaining's text and tone.
 */
export function ReminderCard({
  reminder,
  onServiceNow,
  showCategory = false,
}: {
  reminder: ReminderView;
  onServiceNow: () => void;
  showCategory?: boolean;
}) {
  const rem = reminderRemaining(reminder);
  return (
    <div className="overflow-hidden rounded-lg border border-line-strong bg-card p-3 shadow-e2 transition-shadow hover:shadow-e3">
      {/* Identity — part name leads, status pill holds the right edge. */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 truncate text-[15px] font-semibold leading-tight text-fg">
          {reminder.label}
        </h3>
        <StatusTag tone={STATUS_TONE[reminder.status]} className="shrink-0">
          {STATUS_LABEL[reminder.status]}
        </StatusTag>
      </div>

      {/* Meta chips — what the item is and how often it comes due. The category
          stays a link (steel, the chip tone this system uses for IDs and
          nav) so the card still reaches its category page. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="rounded border border-line-strong bg-inset px-1.5 py-0.5 font-mono text-[11px] font-semibold text-fg shadow-e1">
          {reminder.partGroup}
        </span>
        <span className="rounded border border-line-strong bg-inset px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-fg shadow-e1">
          every {reminder.interval.toLocaleString()} mi
        </span>
        {showCategory ? (
          <Link
            href={`/admin/maintenance/category/${CATEGORY_SLUG[reminder.category]}`}
            className="rounded border border-steel/40 bg-steel-bg px-1.5 py-0.5 font-mono text-[11px] font-bold text-steel shadow-e1 hover:underline"
          >
            {reminder.category}
          </Link>
        ) : null}
      </div>

      {/* Stat module — one inset panel, equal cells on hairline dividers. */}
      <div className="mt-2 grid grid-cols-3 overflow-hidden rounded-md border border-line-strong bg-inset shadow-e1">
        <MaintStat
          label="Miles left"
          value={rem.text}
          valueColor={rem.color}
          strong
        />
        <MaintStat
          label="Interval"
          value={`${reminder.interval.toLocaleString()} mi`}
          divider
        />
        <MaintStat
          label="Last serviced"
          value={
            reminder.lastOdo != null
              ? `${reminder.lastOdo.toLocaleString()} mi`
              : "—"
          }
          divider
        />
      </div>

      {/* Footer — the interval bar, drawing how far through the interval the
          truck is. Same bar this page already used, now the card's base line. */}
      <div className="mt-2 flex items-center gap-2">
        <IntervalBar
          pct={reminder.pct}
          status={reminder.status}
          className="h-1.5 flex-1"
        />
        <Button
          type="button"
          onClick={onServiceNow}
          variant="navigate"
          size="sm"
          className="shrink-0"
        >
          Service now
        </Button>
      </div>
    </div>
  );
}

/**
 * One cell of the reminder card's stat module. `divider` draws the separator as
 * an explicit left border rather than a `divide-x-*` utility — this Tailwind
 * build emits the divide COLOR but not the divide WIDTH, so divide-x renders
 * nothing.
 */
function MaintStat({
  label,
  value,
  valueColor = "text-fg",
  strong = false,
  divider = false,
}: {
  label: string;
  value: string;
  valueColor?: string;
  strong?: boolean;
  divider?: boolean;
}) {
  return (
    <div
      className={
        "min-w-0 px-2.5 py-1.5 " + (divider ? "border-l border-line-strong" : "")
      }
    >
      <div className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-fg-subtle">
        {label}
      </div>
      <div
        className={
          "mt-0.5 truncate font-bold leading-tight tabular-nums " +
          (strong ? "text-[15px] " : "text-[13px] ") +
          valueColor
        }
      >
        {value}
      </div>
    </div>
  );
}

// ── Repair row (log lists + global search) ─────────────────────────────────
export function RepairRow({
  entry,
  showCategory = false,
}: {
  entry: RepairEntry;
  showCategory?: boolean;
}) {
  const pos = isPosition(entry.position) ? entry.position : null;
  return (
    <Link
      href={`/admin/maintenance/${entry.id}`}
      className="block rounded-lg border border-line-strong bg-card p-3 shadow-e2 transition-shadow hover:shadow-e3 active:bg-inset"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 truncate text-[14px] font-semibold text-fg">
          {entry.description}
        </h3>
        {entry.receiptCount > 0 ? (
          <span className="shrink-0 text-[13px] text-fg-subtle" title="Has a receipt">
            📎
          </span>
        ) : null}
      </div>
      {/* Date + odometer are facts, not a warning — amber is reserved for
          due-soon, so this reads muted ink. */}
      <p className="mt-0.5 font-mono text-[11px] font-semibold tabular-nums text-ink-3">
        {formatDate(entry.date) ?? "—"}
        {entry.odometer != null ? ` · ${entry.odometer.toLocaleString()} mi` : ""}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {showCategory ? (
          <span className="inline-flex items-center rounded-full bg-slate-bg px-2 py-[2px] font-mono text-[10px] font-semibold text-slate">
            {entry.category}
          </span>
        ) : null}
        {entry.freshness ? <FreshnessBadge freshness={entry.freshness} /> : null}
        {entry.hasReminder ? (
          <Indicator className="bg-steel-bg text-steel">↻ Recurring</Indicator>
        ) : null}
        {pos ? (
          <Indicator className="bg-slate-bg text-slate">
            {POSITION_LABEL[pos]}
          </Indicator>
        ) : null}
        {entry.relatedCount > 0 ? (
          <Indicator className="bg-elevated text-fg-muted">
            ⛓ {entry.relatedCount}
          </Indicator>
        ) : null}
      </div>
    </Link>
  );
}

function Indicator({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-[2px] font-mono text-[10px] font-semibold " +
        className
      }
    >
      {children}
    </span>
  );
}

// ── Category icons — small, monochrome, currentColor ───────────────────────
export function CategoryIcon({
  category,
  className = "h-[18px] w-[18px]",
}: {
  category: Category;
  className?: string;
}) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (category) {
    case "Steering & Suspension": // coil spring
      return (
        <svg {...common} aria-hidden>
          <path d="M8 5h8l-8 3.2h8l-8 3.2h8l-8 3.2h8" />
          <path d="M8 18.5h8" />
        </svg>
      );
    case "Drivetrain": // driveshaft with U-joints
      return (
        <svg {...common} aria-hidden>
          <path d="M8 12h8" />
          <circle cx="6" cy="12" r="2.4" />
          <circle cx="18" cy="12" r="2.4" />
        </svg>
      );
    case "Engine Bay": // engine block
      return (
        <svg {...common} aria-hidden>
          <path d="M4 10h9v8H4z" />
          <path d="M13 12h4v4h-4" />
          <path d="M7 10V7h4v3" />
        </svg>
      );
    case "Brakes": // disc + caliper
      return (
        <svg {...common} aria-hidden>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "Tires & Wheels": // wheel + spokes
      return (
        <svg {...common} aria-hidden>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="2.2" />
          <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" />
        </svg>
      );
    case "Trailer": // box on wheels
      return (
        <svg {...common} aria-hidden>
          <path d="M3 7h16v7H3z" />
          <path d="M19 10h2" />
          <circle cx="8" cy="17" r="1.7" />
          <circle cx="15" cy="17" r="1.7" />
        </svg>
      );
    default: // wrench
      return (
        <svg {...common} aria-hidden>
          <path d="M15.5 5.2a3.6 3.6 0 0 0-4.7 4.6l-5.4 5.4a1.7 1.7 0 0 0 2.4 2.4l5.4-5.4a3.6 3.6 0 0 0 4.6-4.7l-2.2 2.2-2-.3-.3-2z" />
        </svg>
      );
  }
}

/** The Preventative lens icon — a shield-check (stay-ahead). Inherits color. */
export function PreventativeIcon({
  className = "h-[18px] w-[18px]",
}: {
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3.2 5 6v5.5c0 4.2 2.9 7 7 9.3 4.1-2.3 7-5.1 7-9.3V6z" />
      <path d="M9 12l2 2 4-4.2" />
    </svg>
  );
}
