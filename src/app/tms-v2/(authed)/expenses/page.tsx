import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { ContextDrawer } from "@/components/tms-v2/ui/ContextDrawer";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { getRecurringExpenseById, getExpenseActivity, getMonthlyBillSchedule, listExpenseAccounts } from "@/lib/data/recurring-expenses";
import { ExpenseComposerProvider, ExpenseComposerToggleButton, ExpenseComposerFab, ExpenseComposerPanel } from "./ExpenseComposer";
import { ExpenseDrawerContent } from "./ExpenseDrawerContent";
import { MonthlyBillCalendar } from "./MonthlyBillCalendar";

// Money-affecting data, read fresh every visit — matches Today's pattern.
export const dynamic = "force-dynamic";

/**
 * Expenses, stripped to the recurring-bill calendar as its sole view per
 * Brent's explicit scope change (2026-08-08) — this page previously also
 * had a KPI strip, an "Upcoming Bills" list, and the full filterable ledger
 * (ExpensesListClient) with a one-time-expenses section. All of that code
 * still exists (UpcomingBills.tsx, ExpensesListClient.tsx, the getRecurring
 * ExpensesKpis()/listRecurringExpenses() data functions, every server
 * action) — it's just not rendered here anymore. Bill MANAGEMENT stays
 * reachable from the calendar itself: tap a scheduled bill to open the same
 * edit drawer (archive/restore/duplicate/skip-next/delete, all still wired),
 * and "+ Add bill" / the mobile FAB open the same add-expense composer.
 */

function buildHref(params: Record<string, string | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") usp.set(k, v);
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
  const selectedId = typeof sp.id === "string" ? sp.id : undefined;

  const now = new Date();
  const billsMonthMatch = typeof sp.billsMonth === "string" ? /^(\d{4})-(\d{2})$/.exec(sp.billsMonth) : null;
  const billsYear = billsMonthMatch ? Number(billsMonthMatch[1]) : now.getFullYear();
  const billsMonth = billsMonthMatch ? Number(billsMonthMatch[2]) - 1 : now.getMonth();
  const billsMonthParam = billsMonthMatch ? sp.billsMonth as string : undefined;

  const [accounts, selectedExpense, monthSchedule] = await Promise.all([
    listExpenseAccounts(),
    selectedId ? getRecurringExpenseById(selectedId) : Promise.resolve(null),
    getMonthlyBillSchedule(billsYear, billsMonth),
  ]);
  const activity = selectedId ? await getExpenseActivity(selectedId) : [];

  const closeHref = buildHref({ billsMonth: billsMonthParam });

  return (
    <ExpenseComposerProvider>
    <div className="flex h-full min-h-0 overflow-hidden gap-6">
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
    <PageScroll
      header={
        <>
          <PageHeader
            title="Expenses"
            description="What recurring money is leaving the business, and when."
            actions={
              <div className="hidden lg:block">
                <ExpenseComposerToggleButton />
              </div>
            }
          />

          <ExpenseComposerPanel accounts={accounts} />
        </>
      }
    >
      <MonthlyBillCalendar
        year={billsYear}
        month={billsMonth}
        schedule={monthSchedule}
        rowHref={(expenseId) => buildHref({ billsMonth: billsMonthParam, id: expenseId })}
      />
    </PageScroll>
    </div>

    <ExpenseComposerFab />

    {selectedExpense ? (
      <ContextDrawer title={selectedExpense.vendor || selectedExpense.name} closeHref={closeHref}>
        <ExpenseDrawerContent expense={selectedExpense} accounts={accounts} activity={activity} />
      </ContextDrawer>
    ) : null}
    </div>
    </ExpenseComposerProvider>
  );
}
