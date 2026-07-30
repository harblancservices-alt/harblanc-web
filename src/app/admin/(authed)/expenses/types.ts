export const FREQUENCIES = ["monthly", "annual", "quarterly", "weekly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export function isFrequency(v: string): v is Frequency {
  return (FREQUENCIES as readonly string[]).includes(v);
}

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  monthly: "Monthly",
  annual: "Annual",
  quarterly: "Quarterly",
  weekly: "Weekly",
};

/** Normalize any frequency's amount to its monthly-equivalent cost. */
export function monthlyAmount(amount: number, frequency: Frequency): number {
  switch (frequency) {
    case "annual":
      return amount / 12;
    case "quarterly":
      return amount / 3;
    case "weekly":
      return (amount * 52) / 12;
    case "monthly":
    default:
      return amount;
  }
}

export const CATEGORY_PRESETS = [
  "Truck Payment",
  "Trailer Payment",
  "Truck Insurance",
  "Trailer Insurance",
  "Cargo Insurance",
  "Liability Insurance",
  "Physical Damage Insurance",
  "Occupational/Health Insurance",
  "Fuel",
  "DEF",
  "Fuel Card Fees",
  "Tolls",
  "Parking",
  "Scales/Weigh",
  "Lumper Fees",
  "Maintenance & Repairs",
  "Tires",
  "Oil Changes",
  "Roadside/Towing",
  "ELD/Telematics",
  "Dispatch Software",
  "TMS/Software Subscriptions",
  "Load Board Subscriptions",
  "Factoring Fees",
  "IFTA",
  "IRP / Plates / Registration",
  "Permits & Licensing",
  "UCR",
  "Heavy Highway Use Tax (2290)",
  "Drug & Alcohol Consortium",
  "Accounting/Bookkeeping",
  "Legal/Professional",
  "Bank Fees",
  "Credit Card Fees",
  "Loan Payment",
  "Line of Credit",
  "Phone",
  "Internet",
  "Website/Hosting",
  "Email/Google Workspace",
  "Marketing/Advertising",
  "Office Supplies",
  "Postage/Shipping",
  "Rent/Warehouse",
  "Storage/Yard",
  "Utilities",
  "Uniforms/PPE",
  "Tools & Equipment",
  "Membership/Dues (e.g. OOIDA)",
  "Payroll/Contractor",
  "Estimated Taxes",
  "Retirement/Savings",
  "Owner Draw/Personal",
  "Subscriptions (other)",
  "Miscellaneous",
] as const;

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
  card: string | null;
  autopay: boolean;
  notes: string | null;
  monthlyAmount: number;
  /** Preformatted server-side ("Today" / "Tomorrow" / "Aug 15"), so the list
   *  can't drift by timezone or clock skew between server and client. Null
   *  for quarterly/annual, which have no stored anchor date to compute from,
   *  or when the day itself hasn't been set yet. */
  nextChargeLabel: string | null;
};

/** "the 15th" / "every Friday" / a fallback when nothing's set. */
export function chargeScheduleLabel(
  e: Pick<ExpenseItem, "frequency" | "dayOfMonth" | "dayOfWeek">,
): string {
  if (e.frequency === "weekly") {
    return e.dayOfWeek ? `Every ${e.dayOfWeek}` : "No day set";
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

/**
 * The next occurrence of a monthly or weekly charge, on or after `today`.
 * Quarterly/annual charges have no stored anchor date, so there's no honest
 * way to derive their next occurrence from day_of_month alone — null.
 */
export function nextChargeDate(
  e: Pick<ExpenseItem, "frequency" | "dayOfMonth" | "dayOfWeek">,
  today: Date,
): Date | null {
  const base = startOfDay(today);
  if (e.frequency === "weekly") {
    const targetDow = e.dayOfWeek ? WEEKDAY_INDEX[e.dayOfWeek] : undefined;
    if (targetDow == null) return null;
    const diff = (targetDow - base.getDay() + 7) % 7;
    const d = new Date(base);
    d.setDate(d.getDate() + diff);
    return d;
  }
  if (e.frequency === "monthly" && e.dayOfMonth != null) {
    const y = base.getFullYear();
    const m = base.getMonth();
    const clampedThis = Math.min(e.dayOfMonth, new Date(y, m + 1, 0).getDate());
    const thisMonth = new Date(y, m, clampedThis);
    if (thisMonth >= base) return thisMonth;
    const clampedNext = Math.min(e.dayOfMonth, new Date(y, m + 2, 0).getDate());
    return new Date(y, m + 1, clampedNext);
  }
  return null;
}

/** "Today" / "Tomorrow" / "Aug 15" — short label for a computed next-charge date. */
export function formatNextCharge(date: Date, today: Date): string {
  const base = startOfDay(today);
  const days = Math.round((date.getTime() - base.getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export type CategoryBreakdown = { label: string; total: number };
export type CardBreakdown = { label: string; total: number };

/** A user-named card/account (name only — no numbers). */
export type ExpenseAccount = { id: string; name: string };

export type ExpensesData = {
  expenses: ExpenseItem[];
  accounts: ExpenseAccount[];
  monthlyTotal: number;
  annualTotal: number;
  byCategory: CategoryBreakdown[];
  byCard: CardBreakdown[];
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
