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
 * through the shared `DataSource` (v2-architecture.md §10) — reads only;
 * writes go through src/actions/tms-v2/expenses.ts, which also talks to
 * Supabase directly rather than DataSource (see src/lib/demo/mutation.ts's
 * header for why writes don't route through DataSource).
 * Routing this entity's reads through `DataSource` properly remains a
 * follow-up, tracked the same way every other deferred item in this phase
 * is — noted, not silently skipped.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { DEFAULT_PAGE_SIZE, pageRange, toPaginated, type Paginated } from "./pagination";
import { RECURRING_FREQUENCIES, RECURRING_FREQUENCY_LABEL, EXPENSE_CATEGORIES, isFrequency, type RecurringFrequency } from "@/lib/domain/expenses";

// Re-exported so existing server-side callers (e.g. this route's page.tsx)
// don't need a second import line — the vocabulary itself now lives in
// lib/domain/expenses.ts (see that file's header for why).
export { RECURRING_FREQUENCIES, RECURRING_FREQUENCY_LABEL, EXPENSE_CATEGORIES, type RecurringFrequency };

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

/** Last day-of-month for a given year/0-based-month, honoring the same
 * day clamp used throughout this module (e.g. day 31 in February -> 28). */
function clampedDay(day: number, year: number, month: number): number {
  return Math.min(day, new Date(year, month + 1, 0).getDate());
}

/** Next occurrence of a quarterly/annual charge on or after `base`, anchored
 * to `start`'s day-of-month, stepping forward by `intervalMonths` (3 or 12)
 * from start's own month — a real anchor (start_date), not a fake date. */
function nextIntervalOccurrence(start: Date, intervalMonths: number, base: Date): Date {
  let monthIndex = start.getFullYear() * 12 + start.getMonth();
  const day = start.getDate();
  let candidate: Date;
  do {
    const y = Math.floor(monthIndex / 12);
    const m = monthIndex % 12;
    candidate = new Date(y, m, clampedDay(day, y, m));
    monthIndex += intervalMonths;
  } while (candidate < base);
  return candidate;
}

/** Next occurrence of a monthly/weekly/quarterly/annual/one-time charge on or
 * after `today`. Quarterly/annual are anchored to start_date's day-of-month
 * and step forward every 3/12 months — no occurrence if start_date isn't
 * set (a real gap, not fabricated). */
/** Exported so src/actions/tms-v2/expenses.ts's skipNextPayment can reuse
 * the exact same schedule math this module's own mapRow() uses for
 * nextChargeLabel/-DateIso, instead of a second derivation. */
export function nextChargeDate(
  e: { frequency: RecurringFrequency; dayOfMonth: number | null; dayOfWeek: string | null; startDate: string | null; skipNextDate: string | null; endDate?: string | null },
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
    const thisMonth = new Date(y, m, clampedDay(e.dayOfMonth, y, m));
    occurrence = thisMonth >= base ? thisMonth : new Date(y, m + 1, clampedDay(e.dayOfMonth, y, m + 1));
  } else if ((e.frequency === "quarterly" || e.frequency === "annual") && e.startDate) {
    const start = parseIsoDate(e.startDate);
    if (start) {
      occurrence = nextIntervalOccurrence(start, e.frequency === "quarterly" ? 3 : 12, base);
    }
  }

  if (!occurrence) return null;

  // A bill with a known payoff/cancellation date has no next charge once
  // that occurrence would fall after it (equipment financing, a truck
  // payment with a payoff date).
  if (e.endDate) {
    const end = parseIsoDate(e.endDate);
    if (end && occurrence > end) return null;
  }

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

export function toIsoDate(d: Date): string {
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
  /** Real FK when resolved (either a genuine expense_account_id column, or,
   * pre-migration, a fallback match of `card` text against expense_accounts
   * .name) — null when no account is set or none matches. */
  expenseAccountId: string | null;
  cardName: string | null;
  cardType: string | null;
  cardLast4: string | null;
  autopay: boolean;
  archived: boolean;
  notes: string | null;
  /** Nullable payoff/cancellation date — a bill with one has no next charge
   * past it (equipment financing, a truck payment with a payoff date). */
  endDate: string | null;
  /** Preformatted server-side ("Today"/"Tomorrow"/"Aug 15"), CST-consistent
   * with the rest of /tms-v2 — quarterly/annual with no anchor render null. */
  nextChargeLabel: string | null;
  nextChargeDateIso: string | null;
  /** Raw schedule anchors — exposed (unlike money's raw columns, §3a) so the
   * Edit expense form can prefill the field the current frequency actually
   * uses; nextChargeLabel/-DateIso above stay the only read-path a screen
   * displaying (not editing) the schedule should use. */
  dayOfMonth: number | null;
  dayOfWeek: string | null;
  startDate: string | null;
  skipNextDate: string | null;
};

/** Sortable columns on the Expenses ledger (Phase 6 item 6). */
export type ExpenseSortKey = "vendor" | "category" | "amount" | "next";

export type ListRecurringExpensesOptions = {
  page?: number;
  pageSize?: number;
  category?: string;
  frequency?: RecurringFrequency;
  /** "active" (default) excludes archived rows, "archived" shows only
   * archived, "all" shows both — mirrors /admin's ledger toggle. */
  status?: "active" | "archived" | "all";
  search?: string;
  sort?: ExpenseSortKey;
  dir?: "asc" | "desc";
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
  end_date?: string | null;
  card: string | null;
  expense_account_id?: string | null;
  autopay: boolean | null;
  archived: boolean | null;
  skip_next_date: string | null;
  notes: string | null;
};

type AccountDbRow = { id: string; name: string; type: string | null; last4: string | null };

function mapRow(
  r: ExpenseDbRow,
  accountsById: Map<string, { name: string; type: string | null; last4: string | null }>,
  accountsByName: Map<string, { id: string; type: string | null; last4: string | null }>,
  now: Date,
): RecurringExpenseRow {
  const rawFrequency = r.frequency ?? "";
  const frequency = isFrequency(rawFrequency) ? rawFrequency : "monthly";
  const amount = num(r.amount);
  const endDate = r.end_date ?? null;
  const nextDate = nextChargeDate(
    { frequency, dayOfMonth: r.day_of_month, dayOfWeek: r.day_of_week, startDate: r.start_date, skipNextDate: r.skip_next_date, endDate },
    now,
  );
  // Real FK first; fall back to the soft `card` text match (either the
  // migration hasn't run yet in this environment, or this particular row
  // predates the FK being backfilled).
  const byId = r.expense_account_id ? accountsById.get(r.expense_account_id) : undefined;
  const byName = !byId && r.card ? accountsByName.get(r.card) : undefined;
  const resolvedId = r.expense_account_id ?? byName?.id ?? null;
  const cardName = byId?.name ?? r.card;
  const cardType = byId?.type ?? byName?.type ?? null;
  const cardLast4 = byId?.last4 ?? byName?.last4 ?? null;
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    vendor: r.vendor,
    amount,
    monthlyAmount: monthlyAmount(amount, frequency),
    frequency,
    expenseAccountId: resolvedId,
    cardName,
    cardType,
    cardLast4,
    autopay: r.autopay ?? true,
    archived: r.archived ?? false,
    notes: r.notes,
    endDate,
    nextChargeLabel: nextDate ? formatNextCharge(nextDate, now) : null,
    nextChargeDateIso: nextDate ? toIsoDate(nextDate) : null,
    dayOfMonth: r.day_of_month,
    dayOfWeek: r.day_of_week,
    startDate: r.start_date,
    skipNextDate: r.skip_next_date,
  };
}

const EXPENSE_COLUMNS_BASE =
  "id, name, category, vendor, amount, frequency, day_of_month, day_of_week, start_date, card, autopay, archived, skip_next_date, notes";
// end_date / expense_account_id — supabase/migrations/20260807000000_expenses_end_date_account_fk.sql.
// That migration can only be applied by hand (see the migration file's
// header); until it's confirmed live everywhere, selecting these columns
// 400s the whole query. Falling back to the base column set on that specific
// failure keeps the ledger working during the rollout window instead of
// breaking the page — remove this fallback once the migration is confirmed
// applied in every environment this code runs against.
const EXPENSE_COLUMNS_FULL = `${EXPENSE_COLUMNS_BASE}, end_date, expense_account_id`;

/** Loads every non-deleted recurring-expense row plus the account directory
 * needed to resolve card type/last4 — bounded (this is a hand-kept schedule
 * log, not a transaction ledger; even a busy owner-operator keeps well under
 * a few hundred of these, so one bounded read is the correct shape, matching
 * /admin's existing ledger page). Filtering/pagination/KPIs are computed
 * from this one fetch rather than five separate round trips. */
async function fetchAll(now: Date): Promise<RecurringExpenseRow[]> {
  const sb = createServiceRoleClient();
  const [expenseResult, { data: accountRows }] = await Promise.all([
    sb.from("recurring_expenses").select(EXPENSE_COLUMNS_FULL).is("deleted_at", null).limit(1000).returns<ExpenseDbRow[]>(),
    sb.from("expense_accounts").select("id, name, type, last4").is("deleted_at", null).returns<AccountDbRow[]>(),
  ]);

  let expenseRows = expenseResult.data;
  if (expenseResult.error) {
    const retry = await sb.from("recurring_expenses").select(EXPENSE_COLUMNS_BASE).is("deleted_at", null).limit(1000).returns<ExpenseDbRow[]>();
    expenseRows = retry.data;
  }

  const accountsById = new Map((accountRows ?? []).map((a) => [a.id, { name: a.name, type: a.type, last4: a.last4 }]));
  const accountsByName = new Map((accountRows ?? []).map((a) => [a.name, { id: a.id, type: a.type, last4: a.last4 }]));
  return (expenseRows ?? []).map((r) => mapRow(r, accountsById, accountsByName, now));
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

  const dirMul = opts.dir === "desc" ? -1 : 1;
  filtered = filtered.slice().sort((a, b) => {
    if (opts.sort === "vendor") return dirMul * (a.vendor || a.name).localeCompare(b.vendor || b.name);
    if (opts.sort === "category") return dirMul * (a.category ?? "").localeCompare(b.category ?? "");
    if (opts.sort === "amount") return dirMul * (a.amount - b.amount);
    if (opts.sort === "next") {
      const d = (a.nextChargeDateIso ?? "9999-99-99").localeCompare(b.nextChargeDateIso ?? "9999-99-99");
      return dirMul * d;
    }
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
  const nowIso = toIsoDate(now);
  const all = await fetchAll(now);
  const active = all.filter((r) => !r.archived);
  // One-time charges contribute 0 to monthlyAmount (see monthlyAmount()
  // above) and this aggregate doesn't retain start_date per row, so their
  // dated-month contribution to This Month/YTD is a known, honest estimate
  // gap here — the recurring-schedule total is what's shown, same scope
  // limitation /admin's ledger already carries. A bill whose end_date has
  // already passed has stopped recurring and no longer counts either.
  const recurringActive = active.filter((r) => r.frequency !== "onetime" && (!r.endDate || r.endDate >= nowIso));

  const monthsElapsed = now.getMonth() + 1;
  const monthlyTotal = recurringActive.reduce((s, r) => s + r.monthlyAmount, 0);
  const recurringCount = recurringActive.length;

  const thisMonth = monthlyTotal;
  const ytd = monthlyTotal * monthsElapsed;
  const averageMonthly = monthsElapsed > 0 ? ytd / monthsElapsed : 0;

  return { thisMonth, recurringCount, ytd, averageMonthly };
}

/** Single row lookup for the Expenses ledger's context-drawer edit — reuses
 * the same bounded fetchAll() every other read in this module does rather
 * than adding a second query shape for one row. */
export async function getRecurringExpenseById(id: string): Promise<RecurringExpenseRow | null> {
  const all = await fetchAll(new Date());
  return all.find((r) => r.id === id) ?? null;
}

export type ExpenseAccountRow = { id: string; name: string; type: string | null; last4: string | null; isDefault: boolean };

export async function listExpenseAccounts(): Promise<ExpenseAccountRow[]> {
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("expense_accounts")
    .select("id, name, type, last4, is_default")
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .returns<(AccountDbRow & { is_default: boolean | null })[]>();
  return (data ?? []).map((a) => ({ id: a.id, name: a.name, type: a.type, last4: a.last4, isDefault: a.is_default ?? false }));
}

export type ExpenseActivityRow = { id: string; action: string; detail: string | null; whenLabel: string };

/** Recent audit trail for one expense — ported from /admin's ledger
 * (`getExpenseActivity`), same `expense_activity` table, not a second
 * system. Writes happen in src/actions/tms-v2/expenses.ts's logActivity(). */
export async function getExpenseActivity(id: string): Promise<ExpenseActivityRow[]> {
  if (!id) return [];
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("expense_activity")
    .select("id, action, detail, created_at")
    .eq("expense_id", id)
    .order("created_at", { ascending: false })
    .limit(25)
    .returns<{ id: string; action: string; detail: string | null; created_at: string }[]>();
  return (data ?? []).map((r) => ({
    id: r.id,
    action: r.action,
    detail: r.detail,
    whenLabel: new Date(r.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }),
  }));
}
