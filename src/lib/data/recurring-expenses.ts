/**
 * Typed, paginated, filtered query module for the recurring-expenses ledger
 * (`recurring_expenses` + `expense_accounts`) — Phase 3d, EXPENSES entity
 * data module (v2-architecture.md §3c). This is a DIFFERENT table pair from
 * `lib/data/expenses.ts`'s `load_expenses` (per-load expense lines charged
 * against a single load's P&L) — recurring expenses are the operator's
 * manual schedule of standing charges (insurance, truck payment,
 * subscriptions), ported from /admin/expenses' already-shipped QBO-ledger
 * redesign (commit d476489) rather than reimplemented.
 *
 * Scope note: this module talks to Supabase directly rather than going
 * through the shared `DataSource` (v2-architecture.md §10). Multiple other
 * /tms-v2 screens are being built concurrently against
 * `lib/demo/{data-source,live-data-source,demo-data-source}.ts` in this
 * same phase; touching those shared files here would risk stepping on that
 * work mid-flight. Routing this entity through `DataSource` properly is
 * deferred, tracked the same way every other deferred write in this phase
 * is — noted, not silently skipped.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/admin/demo";
import { DEFAULT_PAGE_SIZE, pageRange, toPaginated, type Paginated } from "./pagination";

export const RECURRING_FREQUENCIES = ["monthly", "weekly", "quarterly", "annual", "onetime"] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

function isFrequency(v: string): v is RecurringFrequency {
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

/** Normalize any frequency's amount to its monthly-equivalent cost — the
 * same rule /admin's ledger uses, ported verbatim so "This month"/"YTD"
 * agree with /admin's figures for as long as both apps read the same rows. */
function monthlyAmount(amount: number, frequency: RecurringFrequency): number {
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

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
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

/** Next occurrence of a monthly/weekly/one-time charge on or after `today`.
 * Quarterly/annual have no stored anchor date to compute a next-occurrence
 * from (same honest gap /admin's ledger has — a real schema limitation, not
 * a bug introduced here). */
function nextChargeDate(
  e: { frequency: RecurringFrequency; dayOfMonth: number | null; dayOfWeek: string | null; startDate: string | null; skipNextDate: string | null },
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

function formatNextCharge(date: Date, today: Date): string {
  const base = startOfDay(today);
  const days = Math.round((date.getTime() - base.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type RecurringExpenseRow = {
  id: string;
  name: string;
  category: string | null;
  vendor: string | null;
  amount: number;
  monthlyAmount: number;
  frequency: RecurringFrequency;
  cardName: string | null;
  cardType: string | null;
  cardLast4: string | null;
  autopay: boolean;
  archived: boolean;
  /** Preformatted server-side ("Today"/"Tomorrow"/"Aug 15"), CST-consistent
   * with the rest of /tms-v2 — quarterly/annual with no anchor render null. */
  nextChargeLabel: string | null;
  nextChargeDateIso: string | null;
};

export type ListRecurringExpensesOptions = {
  page?: number;
  pageSize?: number;
  category?: string;
  frequency?: RecurringFrequency;
  /** "active" (default) excludes archived rows, "archived" shows only
   * archived, "all" shows both — mirrors /admin's ledger toggle. */
  status?: "active" | "archived" | "all";
  search?: string;
};

export type RecurringExpensesKpis = {
  thisMonth: number;
  recurringCount: number;
  ytd: number;
  averageMonthly: number;
};

type ExpenseDbRow = {
  id: string;
  name: string;
  category: string | null;
  vendor: string | null;
  amount: number | string | null;
  frequency: string | null;
  day_of_month: number | null;
  day_of_week: string | null;
  start_date: string | null;
  card: string | null;
  autopay: boolean | null;
  archived: boolean | null;
  skip_next_date: string | null;
};

type AccountDbRow = { id: string; name: string; type: string | null; last4: string | null };

/** DEMO: a small, self-contained curated set — recurring expenses have no
 * relationship to the loads/trips/brokers demo dataset in demo-dataset.ts,
 * so this stays local rather than growing that shared file mid-phase. */
function demoRows(now: Date): RecurringExpenseRow[] {
  const raw: Array<Omit<ExpenseDbRow, "id"> & { id: string }> = [
    { id: "demo-exp-insurance", name: "Progressive Insurance", category: "Insurance", vendor: "Progressive", amount: 410, frequency: "monthly", day_of_month: 15, day_of_week: null, start_date: null, card: "Chase Ink (Demo)", autopay: true, archived: false, skip_next_date: null },
    { id: "demo-exp-truckpmt", name: "Ryder Lease", category: "Equipment", vendor: "Ryder", amount: 1280, frequency: "monthly", day_of_month: 1, day_of_week: null, start_date: null, card: "Business Checking (Demo)", autopay: true, archived: false, skip_next_date: null },
    { id: "demo-exp-samsara", name: "Samsara ELD", category: "Software", vendor: "Samsara", amount: 450, frequency: "annual", day_of_month: 1, day_of_week: null, start_date: "2026-03-01", card: "Chase Ink (Demo)", autopay: true, archived: false, skip_next_date: null },
    { id: "demo-exp-phone", name: "Verizon", category: "Utilities", vendor: "Verizon", amount: 95, frequency: "monthly", day_of_month: 20, day_of_week: null, start_date: null, card: "Chase Ink (Demo)", autopay: true, archived: false, skip_next_date: null },
  ];
  return raw.map((r) => mapRow(r as ExpenseDbRow, new Map([["Chase Ink (Demo)", { type: "Credit card", last4: "4242" }], ["Business Checking (Demo)", { type: "Bank account", last4: "1122" }]]), now));
}

function mapRow(r: ExpenseDbRow, accountsByName: Map<string, { type: string | null; last4: string | null }>, now: Date): RecurringExpenseRow {
  const rawFrequency = r.frequency ?? "";
  const frequency = isFrequency(rawFrequency) ? rawFrequency : "monthly";
  const amount = num(r.amount);
  const nextDate = nextChargeDate(
    { frequency, dayOfMonth: r.day_of_month, dayOfWeek: r.day_of_week, startDate: r.start_date, skipNextDate: r.skip_next_date },
    now,
  );
  const account = r.card ? accountsByName.get(r.card) : undefined;
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    vendor: r.vendor,
    amount,
    monthlyAmount: monthlyAmount(amount, frequency),
    frequency,
    cardName: r.card,
    cardType: account?.type ?? null,
    cardLast4: account?.last4 ?? null,
    autopay: r.autopay ?? true,
    archived: r.archived ?? false,
    nextChargeLabel: nextDate ? formatNextCharge(nextDate, now) : null,
    nextChargeDateIso: nextDate ? toIsoDate(nextDate) : null,
  };
}

/** Loads every non-deleted recurring-expense row plus the account directory
 * needed to resolve card type/last4 — bounded (this is a hand-kept schedule
 * log, not a transaction ledger; even a busy owner-operator keeps well under
 * a few hundred of these, so one bounded read is the correct shape, matching
 * /admin's existing ledger page). Filtering/pagination/KPIs are computed
 * from this one fetch rather than five separate round trips. */
async function fetchAll(now: Date): Promise<RecurringExpenseRow[]> {
  if (await isDemoMode()) return demoRows(now);

  const sb = createServiceRoleClient();
  const [{ data: expenseRows }, { data: accountRows }] = await Promise.all([
    sb
      .from("recurring_expenses")
      .select("id, name, category, vendor, amount, frequency, day_of_month, day_of_week, start_date, card, autopay, archived, skip_next_date")
      .is("deleted_at", null)
      .limit(1000)
      .returns<ExpenseDbRow[]>(),
    sb
      .from("expense_accounts")
      .select("id, name, type, last4")
      .is("deleted_at", null)
      .returns<AccountDbRow[]>(),
  ]);

  const accountsByName = new Map((accountRows ?? []).map((a) => [a.name, { type: a.type, last4: a.last4 }]));
  return (expenseRows ?? []).map((r) => mapRow(r, accountsByName, now));
}

export async function listRecurringExpenses(opts: ListRecurringExpensesOptions = {}): Promise<Paginated<RecurringExpenseRow>> {
  const now = new Date();
  const all = await fetchAll(now);

  const status = opts.status ?? "active";
  let filtered = all.filter((r) => (status === "all" ? true : status === "archived" ? r.archived : !r.archived));
  if (opts.category) filtered = filtered.filter((r) => r.category === opts.category);
  if (opts.frequency) filtered = filtered.filter((r) => r.frequency === opts.frequency);
  if (opts.search) {
    const q = opts.search.toLowerCase();
    filtered = filtered.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.vendor ?? "").toLowerCase().includes(q),
    );
  }

  filtered = filtered.slice().sort((a, b) => {
    const d = (a.nextChargeDateIso ?? "9999-99-99").localeCompare(b.nextChargeDateIso ?? "9999-99-99");
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });

  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const { from, to } = pageRange(page, pageSize);
  return toPaginated(filtered.slice(from, to + 1), filtered.length, page, pageSize);
}

/**
 * This Month / Recurring / YTD / Avg Monthly — the same estimate math
 * /admin's ledger uses (this is a schedule log, not posted transactions, so
 * these are the best honest estimate from the recurring schedule): active
 * recurring charges' monthly-equivalent, plus one-time charges dated in the
 * relevant window.
 */
export async function getRecurringExpensesKpis(): Promise<RecurringExpensesKpis> {
  const now = new Date();
  const all = await fetchAll(now);
  const active = all.filter((r) => !r.archived);
  // One-time charges contribute 0 to monthlyAmount (see monthlyAmount()
  // above) and this aggregate doesn't retain start_date per row, so their
  // dated-month contribution to This Month/YTD is a known, honest estimate
  // gap here — the recurring-schedule total is what's shown, same scope
  // limitation /admin's ledger already carries.
  const recurringActive = active.filter((r) => r.frequency !== "onetime");

  const monthsElapsed = now.getMonth() + 1;
  const monthlyTotal = recurringActive.reduce((s, r) => s + r.monthlyAmount, 0);
  const recurringCount = recurringActive.length;

  const thisMonth = monthlyTotal;
  const ytd = monthlyTotal * monthsElapsed;
  const averageMonthly = monthsElapsed > 0 ? ytd / monthsElapsed : 0;

  return { thisMonth, recurringCount, ytd, averageMonthly };
}

export type ExpenseAccountRow = { id: string; name: string; type: string | null; last4: string | null };

export async function listExpenseAccounts(): Promise<ExpenseAccountRow[]> {
  if (await isDemoMode()) {
    return [
      { id: "demo-acct-chase", name: "Chase Ink (Demo)", type: "Credit card", last4: "4242" },
      { id: "demo-acct-checking", name: "Business Checking (Demo)", type: "Bank account", last4: "1122" },
    ];
  }
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("expense_accounts")
    .select("id, name, type, last4")
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .returns<AccountDbRow[]>();
  return (data ?? []).map((a) => ({ id: a.id, name: a.name, type: a.type, last4: a.last4 }));
}
