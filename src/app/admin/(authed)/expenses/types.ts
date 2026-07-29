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
  "Insurance",
  "Truck Payment",
  "Fuel",
  "Software/Subscriptions",
  "Phone",
  "Permits/Licensing",
  "Office",
  "Other",
] as const;

export type ExpenseItem = {
  id: string;
  name: string;
  category: string | null;
  vendor: string | null;
  amount: number;
  frequency: Frequency;
  dayOfMonth: number | null;
  card: string | null;
  autopay: boolean;
  notes: string | null;
  monthlyAmount: number;
};

export type CategoryBreakdown = { label: string; total: number };
export type CardBreakdown = { label: string; total: number };

export type ExpensesData = {
  expenses: ExpenseItem[];
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
