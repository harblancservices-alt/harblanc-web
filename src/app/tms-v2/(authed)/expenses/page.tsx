import Link from "next/link";
import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { KpiTile } from "@/components/tms-v2/ui/KpiTile";
import { Money } from "@/components/tms-v2/ui/Money";
import { ContextDrawer } from "@/components/tms-v2/ui/ContextDrawer";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import {
  listRecurringExpenses,
  getRecurringExpensesKpis,
  getRecurringExpenseById,
  listExpenseAccounts,
  EXPENSE_CATEGORIES,
  RECURRING_FREQUENCIES,
  RECURRING_FREQUENCY_LABEL,
  type RecurringFrequency,
  type ExpenseSortKey,
} from "@/lib/data/recurring-expenses";
import { ExpenseComposerProvider, ExpenseComposerToggleButton, ExpenseComposerPanel } from "./ExpenseComposer";
import { ExpenseDrawerContent } from "./ExpenseDrawerContent";
import { ExpensesListClient } from "./ExpensesListClient";
import { ExportExpensesCsvButton } from "./ExportExpensesCsvButton";
import { ImportExpensesButton } from "./ImportExpensesButton";
import { SavedViews } from "../_components/SavedViews";

// Money-affecting data, read fresh every visit — matches Today's pattern.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
// Bounded export-fetch cap — every filtered row, not just the displayed
// page (fetchAll() itself is already bounded to 1000, see
// lib/data/recurring-expenses.ts — this just avoids re-paginating on top).
const EXPORT_FETCH_SIZE = 1000;

const SORT_KEYS: ExpenseSortKey[] = ["vendor", "category", "amount", "next"];
function isExpenseSortKey(v: string | undefined): v is ExpenseSortKey {
  return !!v && (SORT_KEYS as string[]).includes(v);
}

function buildHref(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== "all") usp.set(k, String(v));
  }
  const qs = usp.toString();
  return qs ? `/tms-v2/expenses?${qs}` : "/tms-v2/expenses";
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const category = typeof sp.category === "string" ? sp.category : undefined;
  const frequency = typeof sp.frequency === "string" && (RECURRING_FREQUENCIES as readonly string[]).includes(sp.frequency)
    ? (sp.frequency as RecurringFrequency)
    : undefined;
  const status = sp.status === "archived" ? "archived" : sp.status === "all" ? "all" : "active";
  const search = typeof sp.q === "string" ? sp.q : undefined;
  const page = typeof sp.page === "string" ? Math.max(1, Number(sp.page) || 1) : 1;
  const selectedId = typeof sp.id === "string" ? sp.id : undefined;
  const sort = isExpenseSortKey(typeof sp.sort === "string" ? sp.sort : undefined) ? (sp.sort as ExpenseSortKey) : undefined;
  const dir = sp.dir === "asc" ? "asc" : "desc";

  const [kpis, list, accounts, selectedExpense, exportList] = await Promise.all([
    getRecurringExpensesKpis(),
    listRecurringExpenses({ page, pageSize: PAGE_SIZE, category, frequency, status, search, sort, dir }),
    listExpenseAccounts(),
    selectedId ? getRecurringExpenseById(selectedId) : Promise.resolve(null),
    listRecurringExpenses({ page: 1, pageSize: EXPORT_FETCH_SIZE, category, frequency, status, search, sort, dir }),
  ]);

  const baseParams = { category, frequency, status, q: search, page: page > 1 ? page : undefined, sort, dir: sort ? dir : undefined };
  const accountNames = accounts.map((a) => a.name);
  const closeHref = buildHref(baseParams);

  return (
    <ExpenseComposerProvider>
    <div className="flex h-full min-h-0 overflow-hidden gap-6">
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
    <PageScroll
      header={
        <>
          <PageHeader
            title="Expenses"
            description="Manual log of recurring charges — insurance, truck payment, subscriptions."
            actions={
              <div className="flex items-center gap-2">
                <ImportExpensesButton />
                <ExportExpensesCsvButton rows={exportList.rows} />
                <ExpenseComposerToggleButton />
              </div>
            }
          />

          <ExpenseComposerPanel accountNames={accountNames} />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiTile label="This month" value={<Money value={kpis.thisMonth} tone="none" />} />
            <KpiTile label="Recurring" value={String(kpis.recurringCount)} />
            <KpiTile label="YTD" value={<Money value={kpis.ytd} tone="none" />} />
            <KpiTile label="Avg monthly" value={<Money value={kpis.averageMonthly} tone="none" />} />
          </div>

          <form className="flex flex-wrap items-center gap-2" method="GET">
            <input
              type="text"
              name="q"
              defaultValue={search ?? ""}
              placeholder="Search vendor or name"
              className="h-9 w-48 rounded-md border border-line-strong bg-card px-2.5 text-[14px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
            />
            <select name="category" defaultValue={category ?? ""} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none">
              <option value="">All categories</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select name="frequency" defaultValue={frequency ?? ""} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none">
              <option value="">All frequencies</option>
              {RECURRING_FREQUENCIES.map((f) => (
                <option key={f} value={f}>{RECURRING_FREQUENCY_LABEL[f]}</option>
              ))}
            </select>
            <select name="status" defaultValue={status} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none">
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All statuses</option>
            </select>
            <button type="submit" className="h-9 rounded-md border border-line-strong bg-card px-3 text-[13px] font-medium text-fg hover:bg-elevated">
              Apply
            </button>
            {category || frequency || search || status !== "active" ? (
              <Link href="/tms-v2/expenses" className="text-[13px] text-fg-muted underline">
                Clear
              </Link>
            ) : null}
          </form>

          <SavedViews storageKey="tms-v2:saved-filters:expenses" />
        </>
      }
    >
      <ExpensesListClient rows={list.rows} accountNames={accountNames} baseParams={baseParams} />

      <div className="mt-4 flex items-center justify-between text-[13px] text-fg-muted">
        <span>
          {list.totalCount} expense{list.totalCount === 1 ? "" : "s"} · page {page}
        </span>
        <div className="flex gap-3">
          {page > 1 ? (
            <Link href={buildHref({ ...baseParams, page: page - 1 })} className="underline">
              ← Prev
            </Link>
          ) : null}
          {list.hasMore ? (
            <Link href={buildHref({ ...baseParams, page: page + 1 })} className="underline">
              Next →
            </Link>
          ) : null}
        </div>
      </div>
    </PageScroll>
    </div>

    {selectedExpense ? (
      <ContextDrawer title={selectedExpense.vendor || selectedExpense.name} closeHref={closeHref}>
        <ExpenseDrawerContent expense={selectedExpense} />
      </ContextDrawer>
    ) : null}
    </div>
    </ExpenseComposerProvider>
  );
}
