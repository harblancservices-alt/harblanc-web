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
    <div className="relative overflow-hidden rounded-lg bg-graphite p-5 pl-6 shadow-e2">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] rounded-l-lg bg-accent"
      />
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-on-dark-dim">
        Current odometer
      </p>
      <p className="mt-1.5 font-mono text-[34px] font-bold leading-none tabular-nums text-white sm:text-[40px]">
        {currentOdo.toLocaleString()}
        <span className="ml-1.5 text-[16px] font-semibold text-on-dark-dim">
          mi
        </span>
      </p>
      <p className="mt-2 text-[11.5px] text-on-dark-dim">
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
  const overdue = reminder.status === "overdue";
  return (
    <div
      className={
        "rounded-md border bg-card p-3 shadow-e1 " +
        (overdue
          ? "border-line border-l-[3px] border-l-bad shadow-e2"
          : "border-line")
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <StatusTag tone={STATUS_TONE[reminder.status]} className="shrink-0">
            {STATUS_LABEL[reminder.status]}
          </StatusTag>
          <h3 className="truncate text-[14px] font-semibold text-fg">
            {reminder.label}
          </h3>
        </div>
        <span
          className={
            "shrink-0 whitespace-nowrap text-[13px] font-bold tabular-nums " +
            rem.color
          }
        >
          {rem.text}
        </span>
      </div>
      <p className="mt-1 font-mono text-[10.5px] tabular-nums text-fg-subtle">
        Every {reminder.interval.toLocaleString()} mi
        {reminder.lastOdo != null
          ? ` · last ${reminder.lastOdo.toLocaleString()} mi`
          : " · no baseline yet"}
        {reminder.nextDue != null
          ? ` · due ${reminder.nextDue.toLocaleString()} mi`
          : ""}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <IntervalBar
          pct={reminder.pct}
          status={reminder.status}
          className="h-1.5 flex-1"
        />
        {showCategory ? (
          <Link
            href={`/admin/maintenance/category/${CATEGORY_SLUG[reminder.category]}`}
            className="shrink-0 rounded-full bg-slate-bg px-2 py-[3px] font-mono text-[10px] font-semibold text-slate hover:underline"
          >
            {reminder.category}
          </Link>
        ) : null}
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
      className="block rounded-md border border-line bg-card p-3 shadow-e1 transition-colors hover:border-line-strong hover:bg-inset"
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
      <p className="mt-0.5 font-mono text-[11px] font-semibold tabular-nums text-warn">
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
    case "Preventative": // oil drop
      return (
        <svg {...common} aria-hidden>
          <path d="M12 4c3 4 5 6.2 5 8.5a5 5 0 0 1-10 0C7 10.2 9 8 12 4z" />
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
