/**
 * Recurring-expense vocabulary — pure, zero I/O (v2-architecture.md §3),
 * split out of lib/data/recurring-expenses.ts so client components (the
 * Add/Edit expense form) can import the frequency/
 * category constants without pulling in that data module's server-only
 * Supabase/cookies imports into the client bundle. lib/data/recurring-
 * expenses.ts re-exports these for existing server-side callers.
 */

export const RECURRING_FREQUENCIES = ["monthly", "weekly", "quarterly", "annual", "onetime"] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export function isFrequency(v: string): v is RecurringFrequency {
  return (RECURRING_FREQUENCIES as readonly string[]).includes(v);
}

export const RECURRING_FREQUENCY_LABEL: Record<RecurringFrequency, string> = {
  monthly: "Monthly",
  weekly: "Weekly",
  quarterly: "Quarterly",
  annual: "Yearly",
  onetime: "One-time",
};

export const EXPENSE_CATEGORIES = [
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
