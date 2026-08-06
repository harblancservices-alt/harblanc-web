import Link from "next/link";
import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { KpiTile } from "@/components/tms-v2/ui/KpiTile";
import { Money } from "@/components/tms-v2/ui/Money";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { DataList, type DataListColumn } from "@/components/tms-v2/ui/DataList";
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
  type RecurringExpenseRow,
  type RecurringFrequency,
} from "@/lib/data/recurring-expenses";
import { expenseGaps, EXPENSE_GAP_LABEL } from "@/lib/dispatch/alerts";
import { ExpenseComposerProvider, ExpenseComposerToggleButton, ExpenseComposerPanel } from "./ExpenseComposer";
import { ExpenseDrawerContent } from "./ExpenseDrawerContent";
import { ExpenseRowActions } from "./ExpenseRowActions";

// Money-affecting data, read fresh every visit — matches Today's pattern.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

function buildColumns(accountNames: string[]): DataListColumn<RecurringExpenseRow>[] {
  const accountNameSet = new Set(accountNames);

  function gapsFor(r: RecurringExpenseRow) {
    return expenseGaps(
      {
        amount: r.amount,
        frequency: r.frequency,
        dayOfMonth: r.dayOfMonth,
        dayOfWeek: r.dayOfWeek,
        startDate: r.startDate,
        card: r.cardName,
        category: r.category,
      },
      accountNameSet,
    );
  }

  return [
  {
    key: "vendor",
    header: "Vendor",
    render: (r) => {
      const gaps = gapsFor(r);
      return (
        <div className="flex items-start gap-2">
          {gaps.length > 0 ? (
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-warn"
              title={`Incomplete: ${gaps.map((g) => EXPENSE_GAP_LABEL[g]).join(", ")}`}
              aria-label={`Incomplete: ${gaps.map((g) => EXPENSE_GAP_LABEL[g]).join(", ")}`}
            />
          ) : null}
          <div>
            <div className="font-medium text-fg">{r.vendor || r.name}</div>
            {r.vendor && r.vendor !== r.name ? <div className="text-[12px] text-fg-muted">{r.name}</div> : null}
          </div>
        </div>
      );
    },
  },
  { key: "category", header: "Category", render: (r) => r.category ?? "—" },
  {
    key: "card",
    header: "Card",
    render: (r) =>
      r.cardName ? (
        <span>
          {r.cardName}
          {r.cardLast4 ? <span className="text-fg-muted"> ····{r.cardLast4}</span> : null}
        </span>
      ) : (
        "—"
      ),
    hideOnMobile: true,
  },
  { key: "frequency", header: "Frequency", render: (r) => RECURRING_FREQUENCY_LABEL[r.frequency] },
  { key: "next", header: "Next charge", render: (r) => r.nextChargeLabel ?? "—" },
  { key: "status", header: "Status", render: (r) => (r.archived ? "Archived" : "Active"), hideOnMobile: true },
  // Neutral ink by default (v2-design.md's money-is-language rule) — every
  // row here is an expense, so coloring every amount red said nothing; the
  // amber dot on Vendor is now what actually carries "needs a look".
  { key: "amount", header: "Amount", render: (r) => <Money value={r.amount} tone="none" />, align: "right" },
  {
    key: "actions",
    header: "",
    render: (r) => <ExpenseRowActions expense={r} />,
    align: "right",
  },
  ];
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

  const [kpis, list, accounts, selectedExpense] = await Promise.all([
    getRecurringExpensesKpis(),
    listRecurringExpenses({ page, pageSize: PAGE_SIZE, category, frequency, status, search }),
    listExpenseAccounts(),
    selectedId ? getRecurringExpenseById(selectedId) : Promise.resolve(null),
  ]);

  const baseParams = { category, frequency, status, q: search, page: page > 1 ? page : undefined };
  const accountNames = accounts.map((a) => a.name);
  const columns = buildColumns(accountNames);

  function rowHref(id: string): string {
    return buildHref({ ...baseParams, id });
  }
  const closeHref = buildHref(baseParams);

  return (
    <ExpenseComposerProvider>
    <div className="flex h-full min-h-0 items-start gap-6">
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
    <PageScroll
      header={
        <>
          <PageHeader
            title="Expenses"
            description="Manual log of recurring charges — insurance, truck payment, subscriptions."
            actions={<ExpenseComposerToggleButton />}
          />

          <ExpenseComposerPanel accountNames={accountNames} />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiTile label="This month" value={<Money value={kpis.thisMonth} tone="none" />} />
            <KpiTile label="Recurring" value={String(kpis.recurringCount)} />
            <KpiTile label="YTD" value={<Money value={kpis.ytd} tone="none" />} />
            <KpiTile label="Avg monthly" value={<Money value={kpis.averageMonthly} tone="none" />} />
          </div>

          <form className="flex flex-wrap items-end gap-3" method="GET">
            <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
              Search
              <input
                type="text"
                name="q"
                defaultValue={search ?? ""}
                placeholder="Vendor or name…"
                className="h-9 w-48 rounded-md border border-line-strong bg-card px-2.5 text-[14px] text-fg"
              />
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
              Category
              <select name="category" defaultValue={category ?? ""} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[14px] text-fg">
                <option value="">All</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
              Frequency
              <select name="frequency" defaultValue={frequency ?? ""} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[14px] text-fg">
                <option value="">All</option>
                {RECURRING_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>{RECURRING_FREQUENCY_LABEL[f]}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
              Status
              <select name="status" defaultValue={status} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[14px] text-fg">
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="all">All</option>
              </select>
            </label>
            <button type="submit" className="h-9 rounded-md border border-line-strong bg-card px-3 text-[13px] font-medium text-fg hover:bg-elevated">
              Apply
            </button>
            {category || frequency || search || status !== "active" ? (
              <Link href="/tms-v2/expenses" className="text-[13px] text-fg-muted underline">
                Clear filters
              </Link>
            ) : null}
          </form>
        </>
      }
    >
      <DataList
        columns={columns}
        rows={list.rows}
        rowKey={(r) => r.id}
        getHref={(r) => rowHref(r.id)}
        emptyMessage="No recurring expenses match these filters."
      />

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

      <p className="mt-4 text-[13px] text-fg-muted">
        Server render time: <DateTimeCST value={new Date()} />
      </p>
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
