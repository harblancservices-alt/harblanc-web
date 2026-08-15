import { ContextDrawer } from "@/components/tms-v2/ui/ContextDrawer";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { getRecurringExpenseById, getExpenseActivity, listExpenseAccounts, listRecurringExpenses } from "@/lib/data/recurring-expenses";
import { ExpenseComposerProvider, ExpenseComposerFab, ExpenseComposerPanel } from "./ExpenseComposer";
import { ExpenseDrawerContent } from "./ExpenseDrawerContent";
import { FixedMonthlyHeaderCard } from "./FixedMonthlyHeaderCard";
import { ComingUpCard } from "./ComingUpCard";
import { AllBillsCard } from "./AllBillsCard";
import { ExpensesDesktopToolbar } from "./ExpensesDesktopToolbar";
import { ExpensesDesktopHeaderBand } from "./ExpensesDesktopHeaderBand";
import { ExpensesDesktopTable } from "./ExpensesDesktopTable";

// Money-affecting data, read fresh every visit — matches Today's pattern.
export const dynamic = "force-dynamic";

/**
 * Expenses — redesigned from a month/year recurring-bill CALENDAR to a
 * clean list (Brent's explicit approval, 2026-08-08, replacing the
 * calendar this page shipped with the same day): a dark FIXED MONTHLY
 * header card (every active recurring bill normalized to its
 * monthly-equivalent, lib/data/recurring-expenses.ts's monthlyAmount()),
 * a "Coming up" strip of the next day-of-month-anchored bills, and "All
 * recurring bills" — every active bill including the $0 ones the old
 * calendar silently hid. No month/year picker, no KPI strip beyond the
 * header card, single continuous scroll. Bill MANAGEMENT stays reachable
 * the same way it was on the calendar: tap a row to open the same edit
 * drawer (archive/restore/duplicate/skip-next/delete, all still wired),
 * "+ Add bill" / the mobile FAB open the same add-expense composer.
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

  const [accounts, selectedExpense, billsPage] = await Promise.all([
    listExpenseAccounts(),
    selectedId ? getRecurringExpenseById(selectedId) : Promise.resolve(null),
    listRecurringExpenses({ status: "active", pageSize: 1000 }),
  ]);
  const activity = selectedId ? await getExpenseActivity(selectedId) : [];

  // Recurring bills only — one-time charges (frequency "onetime") aren't a
  // fixed monthly obligation and have no place in this schedule view.
  const bills = billsPage.rows.filter((r) => r.frequency !== "onetime");

  const closeHref = buildHref({});
  const rowHref = (id: string) => buildHref({ id });

  return (
    <ExpenseComposerProvider>
    <div className="flex h-full min-h-0 overflow-hidden gap-6">
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
    <PageScroll
      header={
        <>
          <div className="hidden lg:block">
            <ExpensesDesktopToolbar />
          </div>

          <ExpenseComposerPanel accounts={accounts} />
        </>
      }
    >
      {/* MOBILE — unchanged: fixed-monthly card, Coming up countdown ring,
          All recurring bills list. */}
      <div className="flex flex-col gap-4 lg:hidden">
        <FixedMonthlyHeaderCard rows={bills} />
        <ComingUpCard rows={bills} rowHref={rowHref} />
        <AllBillsCard rows={bills} rowHref={rowHref} />
      </div>

      {/* DESKTOP — new, per Brent's approved mockup. */}
      <div className="hidden flex-col gap-4 lg:flex">
        <ExpensesDesktopHeaderBand rows={bills} />
        <ExpensesDesktopTable rows={bills} accounts={accounts} />
      </div>
    </PageScroll>
    </div>

    <ExpenseComposerFab />

    {selectedExpense ? (
      <ContextDrawer title={selectedExpense.vendor || selectedExpense.name} closeHref={closeHref}>
        <ExpenseDrawerContent expense={selectedExpense} accounts={accounts} activity={activity} closeHref={closeHref} />
      </ContextDrawer>
    ) : null}
    </div>
    </ExpenseComposerProvider>
  );
}
