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
