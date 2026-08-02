import type { StatusTone } from "@/components/ui/StatusTag";

export const FREQUENCIES = ["monthly", "weekly", "quarterly", "annual", "onetime"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export function isFrequency(v: string): v is Frequency {
  return (FREQUENCIES as readonly string[]).includes(v);
}

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  monthly: "Monthly",
  weekly: "Weekly",
  quarterly: "Quarterly",
  annual: "Yearly",
  onetime: "One-Time",
};

/** Color-coded frequency badge — one of each StatusTag tone, so every
 *  cadence reads as a distinct color at a glance in the table. */
export const FREQUENCY_TONE: Record<Frequency, StatusTone> = {
  monthly: "steel",
  weekly: "green",
  quarterly: "amber",
  annual: "slate",
  onetime: "red",
};

/** Normalize any frequency's amount to its monthly-equivalent cost.
 *  One-time charges don't recur, so they contribute nothing to a steady
 *  monthly run-rate — they're counted separately, by calendar month, in the
 *  page's KPI math (see page.tsx). */
export function monthlyAmount(amount: number, frequency: Frequency): number {
  switch (frequency) {
    case "annual":
      return amount / 12;
    case "quarterly":
      return amount / 3;
    case "weekly":
      return (amount * 52) / 12;
    case "onetime":
      return 0;
    case "monthly":
    default:
      return amount;
  }
}

/** Fixed category set for filtering/reporting — every expense's category
 *  picks from this list going forward. Older rows saved under the previous
 *  freeform preset list (e.g. "Truck Insurance", "Fuel Card Fees") keep
 *  their stored text; the edit form surfaces them as a legacy option
 *  instead of silently discarding them. */
export const CATEGORIES = [
  "Office",
  "Software",
  "Fuel",
  "Insurance",
  "Equipment",
  "Payroll",
  "Utilities",
  "Marketing",
  "Travel",
  "Taxes",
  "Maintenance",
  "Miscellaneous",
] as const;
export type Category = (typeof CATEGORIES)[number];

export function isCategory(v: string): v is Category {
  return (CATEGORIES as readonly string[]).includes(v);
}

export const PAYMENT_METHOD_TYPES = [
  "Credit Card",
  "Debit Card",
  "Bank Account",
  "ACH",
  "Other",
] as const;
export type PaymentMethodType = (typeof PAYMENT_METHOD_TYPES)[number];

export function isPaymentMethodType(v: string): v is PaymentMethodType {
  return (PAYMENT_METHOD_TYPES as readonly string[]).includes(v);
}

export const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export function isDayOfWeek(v: string): v is DayOfWeek {
  return (DAYS_OF_WEEK as readonly string[]).includes(v);
}

export type ExpenseItem = {
  id: string;
  name: string;
  category: string | null;
  vendor: string | null;
  amount: number;
  frequency: Frequency;
  dayOfMonth: number | null;
  dayOfWeek: string | null;
  /** ISO "YYYY-MM-DD". Anchor date for one-time charges; optional metadata
   *  (shown in the detail panel) for every other cadence. */
  startDate: string | null;
  card: string | null;
  autopay: boolean;
  notes: string | null;
  archived: boolean;
  tags: string[];
  /** Set by "Skip Next Payment" — the ISO date of the occurrence to skip.
   *  Once that date is in the past it's naturally ignored by
   *  nextChargeDate(), so nothing needs to clear it back out. */
  skipNextDate: string | null;
  monthlyAmount: number;
  /** Preformatted server-side ("Today" / "Tomorrow" / "Aug 15"), so the list
   *  can't drift by timezone or clock skew between server and client. Null
   *  for quarterly/annual, which have no stored anchor date to compute from,
   *  or when the day itself hasn't been set yet. */
  nextChargeLabel: string | null;
  /** Same occurrence as nextChargeLabel, as an ISO date — lets the client
   *  filter by a date range without re-deriving the schedule math. */
  nextChargeDateIso: string | null;
};

/** "the 15th" / "every Friday" / a fallback when nothing's set. */
export function chargeScheduleLabel(
  e: Pick<ExpenseItem, "frequency" | "dayOfMonth" | "dayOfWeek" | "startDate">,
): string {
  if (e.frequency === "onetime") {
    return e.startDate ? `Once on ${formatIsoDateShort(e.startDate)}` : "No date set";
  }
  if (e.frequency === "weekly") {
    return e.dayOfWeek ? `Every ${e.dayOfWeek}` : "No day set";
  }
  if (e.frequency === "quarterly" || e.frequency === "annual") {
    return e.dayOfMonth != null
      ? `Charges on the ${ordinal(e.dayOfMonth)}`
      : "No charge date set";
  }
  return e.dayOfMonth != null
    ? `Charges on the ${ordinal(e.dayOfMonth)}`
    : "No charge date set";
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * The next occurrence of a monthly/weekly/one-time charge, on or after
 * `today`. Quarterly/annual charges have no stored anchor date, so there's
 * no honest way to derive their next occurrence from day_of_month alone —
 * null, same as before.
 *
 * When the computed occurrence matches `skipNextDate`, the charge one cycle
 * later is returned instead — "Skip Next Payment" acts for exactly one
 * occurrence and stops mattering once that date has passed.
 */
export function nextChargeDate(
  e: Pick<ExpenseItem, "frequency" | "dayOfMonth" | "dayOfWeek" | "startDate" | "skipNextDate">,
  today: Date,
): Date | null {
  const base = startOfDay(today);

  if (e.frequency === "onetime") {
    if (!e.startDate) return null;
    const d = parseIsoDate(e.startDate);
    if (!d || d < base) return null;
    return d;
  }

  let occurrence: Date | null = null;

  if (e.frequency === "weekly") {
    const targetDow = e.dayOfWeek ? WEEKDAY_INDEX[e.dayOfWeek] : undefined;
    if (targetDow != null) {
      const diff = (targetDow - base.getDay() + 7) % 7;
      occurrence = new Date(base);
      occurrence.setDate(occurrence.getDate() + diff);
    }
  } else if (e.frequency === "monthly" && e.dayOfMonth != null) {
    const y = base.getFullYear();
    const m = base.getMonth();
    const clampedThis = Math.min(e.dayOfMonth, new Date(y, m + 1, 0).getDate());
    const thisMonth = new Date(y, m, clampedThis);
    if (thisMonth >= base) {
      occurrence = thisMonth;
    } else {
      const clampedNext = Math.min(e.dayOfMonth, new Date(y, m + 2, 0).getDate());
      occurrence = new Date(y, m + 1, clampedNext);
    }
  }

  if (!occurrence) return null;

  if (e.skipNextDate) {
    const skip = parseIsoDate(e.skipNextDate);
    if (skip && skip.getTime() === occurrence.getTime()) {
      return nextChargeDate(
        { ...e, skipNextDate: null },
        new Date(occurrence.getFullYear(), occurrence.getMonth(), occurrence.getDate() + 1),
      );
    }
  }

  return occurrence;
}

/** "Today" / "Tomorrow" / "Aug 15" — short label for a computed next-charge date. */
export function formatNextCharge(date: Date, today: Date): string {
  const base = startOfDay(today);
  const days = Math.round((date.getTime() - base.getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatIsoDateShort(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** A card/account entry — nickname-only identity plus light descriptive
 *  metadata. No card numbers stored, ever; `last4` is the most identifying
 *  data this table is allowed to hold. monthlySpend/chargeCount are
 *  aggregated server-side from the linked recurring_expenses, not stored. */
export type ExpenseAccount = {
  id: string;
  name: string;
  type: string | null;
  last4: string | null;
  isDefault: boolean;
  monthlySpend: number;
  chargeCount: number;
};

export type ExpenseActivity = {
  id: string;
  action: string;
  detail: string | null;
  /** Preformatted server-side, same rationale as nextChargeLabel. */
  whenLabel: string;
};

export type ExpensesKpis = {
  thisMonth: number;
  recurringCount: number;
  ytd: number;
  averageMonthly: number;
};

export type ExpensesData = {
  expenses: ExpenseItem[];
  accounts: ExpenseAccount[];
  kpis: ExpensesKpis;
};

/** "5" → "5th", "1" → "1st", "22" → "22nd". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
