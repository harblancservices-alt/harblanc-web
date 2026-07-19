/**
 * Dashboard alerts — the shared shape of the "Needs attention" panel.
 *
 * An alert is a live derivation, never a stored row: every group below is
 * recomputed from current data on each dashboard render, so an alert clears
 * itself the moment the owner fixes the underlying thing (attaches the BOL,
 * enters the odometer, marks the invoice paid, works the lead). Nothing needs
 * to be dismissed.
 *
 * The panel renders `AlertGroup[]` generically — adding a new signal means
 * pushing one more group from loadDashboard(), not editing the view.
 */

import type { StatusTone } from "@/components/ui/StatusTag";

/** Stable identity per group, used for React keys and the group icon. */
export type AlertGroupKey =
  | "maintenance"
  | "receivables"
  | "incomplete"
  | "applications"
  | "quotes";

/**
 * Stable, global identity for one alert — the key a dismissal is recorded
 * against in `dismissed_alerts`. Derived from the underlying row's id, so the
 * same real-world problem produces the same key on every render and a
 * dismissal keeps sticking across reloads.
 *
 * Deliberately NOT derived from the alert's wording or severity: an overdue
 * receivable that ages from 41d to 60d is the same alert, and re-showing it
 * because its label changed would defeat the dismissal.
 */
export function alertKey(kind: AlertGroupKey, id: string): string {
  return `${KEY_PREFIX[kind]}:${id}`;
}

/**
 * Maintenance dismissals are PER-OCCURRENCE, not permanent.
 *
 * "Ignore" on an overdue oil change means "I know, not right now" — it must
 * not mean "never warn me about engine oil again". So the key carries the
 * occurrence the owner actually dismissed:
 *
 *   - `lastOdo`, the reminder's last-service (anchor) odometer. Logging the
 *     service moves it, which mints a new key and lets the next cycle alert.
 *   - `status`, so an item dismissed while merely "due soon" comes back the
 *     moment it escalates to "overdue".
 *
 * Anything else still outstanding at the same anchor and severity keeps the
 * same key and stays hidden, which is the point.
 *
 * No schema change: dismissed_alerts.alert_key is a plain text primary key,
 * so a longer composite string just works.
 */
export function maintenanceAlertKey(
  reminderId: string,
  lastOdo: number | null,
  status: string,
): string {
  return alertKey("maintenance", `${reminderId}:${lastOdo ?? "none"}:${status}`);
}

const KEY_PREFIX: Record<AlertGroupKey, string> = {
  maintenance: "maintenance",
  receivables: "receivable",
  incomplete: "incomplete-load",
  applications: "application",
  quotes: "quote",
};

export type AlertItem = {
  /** Unique within its group (React key). */
  id: string;
  /**
   * Global dismissal key — `alertKey(group, rowId)`. Swiping this item writes
   * this string to `dismissed_alerts`; undo deletes it.
   */
  dismissKey: string;
  /** Leading line — the thing itself (service name, broker, load). */
  title: string;
  /** Secondary line: lane, load number, etc. Omitted when there's nothing to add. */
  subtitle?: string;
  /** Right-aligned figure — miles left, dollars owed, days out. */
  value?: string;
  /** Small pills describing the problem ("No BOL", "Overdue", "40d out"). */
  chips?: ReadonlyArray<{ label: string; tone: StatusTone }>;
  /** Tap-through target — always somewhere the owner can actually fix it. */
  href: string;
  /**
   * Quick action revealed by swiping the row RIGHT (and mirrored as a button
   * for mouse users). Where `href` opens the thing, this jumps straight to the
   * control that clears the alert — the load's document uploader, the odometer
   * entry, the log-a-service form.
   */
  action?: AlertQuickAction;
};

export type AlertQuickAction = {
  /** Short button label, e.g. "BOL", "Odometer", "Log Service". */
  label: string;
  href: string;
};

export type AlertGroup = {
  key: AlertGroupKey;
  /** Category header, e.g. "Maintenance". */
  label: string;
  /**
   * Group-level severity: red when something is genuinely late (overdue
   * service, 40d+ receivable), amber when it's a nudge (new lead, missing doc).
   */
  tone: StatusTone;
  items: ReadonlyArray<AlertItem>;
};

/** Badge total = every item across every group. */
export function totalAlerts(groups: ReadonlyArray<AlertGroup>): number {
  return groups.reduce((n, g) => n + g.items.length, 0);
}

/**
 * A load counts as INCOMPLETE once delivered if the owner never finished
 * filling it in. Two independent gaps, both of which block real work
 * downstream:
 *
 *   - Missing paperwork: no rate con (can't bill / prove the agreed rate) or
 *     no BOL (can't prove delivery). POD is deliberately NOT required here —
 *     it isn't part of the net calc and not every broker asks for one.
 *   - Missing odometer: the net-per-load math derives diesel from
 *     odo_assigned → odo_delivered, so a null/zero reading silently zeroes out
 *     that load's fuel cost and inflates its net.
 *
 * There is no delivered_at timestamp on loads, so there's no grace clock —
 * any delivered load carrying a gap is flagged immediately.
 */
export type IncompleteGap = "rate_con" | "bol" | "odometer";

export function incompleteGaps(load: {
  hasRateCon: boolean;
  hasBol: boolean;
  odoAssigned: number | null;
  odoLoaded: number | null;
  odoDelivered: number | null;
}): IncompleteGap[] {
  const gaps: IncompleteGap[] = [];
  if (!load.hasRateCon) gaps.push("rate_con");
  if (!load.hasBol) gaps.push("bol");
  // The net calc needs the trip's start and end; odo_loaded is informational.
  const missingOdo =
    !load.odoAssigned ||
    load.odoAssigned <= 0 ||
    !load.odoDelivered ||
    load.odoDelivered <= 0;
  if (missingOdo) gaps.push("odometer");
  return gaps;
}

export const GAP_LABEL: Record<IncompleteGap, string> = {
  rate_con: "No rate con",
  bol: "No BOL",
  odometer: "No odometer",
};

/**
 * Days a delivered load has been outstanding, from its DELIVERY date to today.
 * Both anchored to UTC midnight so it counts whole calendar days rather than
 * partial-day fractions — the same derivation the Receivables page uses, kept
 * here so the dashboard's aging and that page's aging can never drift apart.
 */
export function daysOutstanding(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00Z" : iso);
  if (Number.isNaN(d.getTime())) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const delivered = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.floor((today - delivered) / 86_400_000);
  return days >= 0 ? days : 0;
}

/** Past this many days outstanding, a receivable is late enough to alert on. */
export const RECEIVABLE_OVERDUE_DAYS = 40;
