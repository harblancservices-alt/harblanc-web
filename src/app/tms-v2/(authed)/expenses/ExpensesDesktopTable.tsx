"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DataList, type DataListColumn } from "@/components/tms-v2/ui/DataList";
import { Money } from "@/components/tms-v2/ui/Money";
import { Button } from "@/components/tms-v2/ui/Button";
import { formatMoney } from "@/lib/domain/money";
import { markBillPaidThisCycle, undoMarkBillPaid } from "@/actions/tms-v2/expenses";
import { daysUntil } from "./ComingUpCard";
import { CYCLE_SUFFIX } from "./AllBillsCard";
import { computeFixedMonthlySummary } from "./FixedMonthlyHeaderCard";
import { ExpenseKebabMenu } from "./ExpenseKebabMenu";
import type { MutationResult } from "@/lib/demo/mutation";
import type { RecurringExpenseRow } from "@/lib/data/recurring-expenses";

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold tabular-nums ${className}`}>
      {children}
    </span>
  );
}

/** Countdown pill — same red ≤3 / amber ≤10 / blue beyond thresholds as the
 * mobile ring (ComingUpRow's ringColor), just a solid table pill instead of
 * an SVG ring. `justPaid` (this session's local state, not persisted data —
 * see the table component's own header comment) overrides everything else
 * to a green "Paid" pill; a $0 bill always shows "Set amount" instead of a
 * date, regardless of paid state. */
function NextPill({ row, justPaid }: { row: RecurringExpenseRow; justPaid: boolean }) {
  if (row.monthlyAmount === 0) return <Pill className="bg-warn text-white">Set amount</Pill>;
  if (justPaid) return <Pill className="bg-ok text-white">Paid</Pill>;
  if (!row.nextChargeDateIso) return <Pill className="bg-elevated text-fg-muted">—</Pill>;

  const days = daysUntil(row.nextChargeDateIso);
  if (days <= 0) return <Pill className="bg-bad text-white">Today</Pill>;
  if (days <= 3) return <Pill className="bg-bad text-white">{days}d</Pill>;
  if (days <= 10) return <Pill className="bg-warn text-white">{days}d</Pill>;
  return <Pill className="bg-info text-white">{days}d</Pill>;
}

/**
 * Desktop Expenses' dense bills table (Brent's approved mockup,
 * 2026-08-08) — DataList's table half, columns Bill/Category/Due/Account/
 * Monthly/Next/Status/Actions, a totals footer. Desktop-only (rendered
 * inside a `hidden lg:block` wrapper by page.tsx); mobile keeps
 * ComingUpCard/AllBillsCard exactly as they were.
 *
 * "Mark paid" calls the EXACT SAME markBillPaidThisCycle server action
 * mobile's countdown ring uses (actions/tms-v2/expenses.ts) — one
 * implementation, not a second. The difference is presentation only:
 * mobile's row collapses away once paid; this table's rows don't disappear
 * (Brent's mockup wants a persistent "N active bills" table, not a
 * shrinking one), so a just-paid row instead flips its own Mark paid
 * button to Undo and its Status cell to "Resets <date>" — tracked as
 * client-local state (`justPaid`, keyed by expense id) rather than a new
 * database column: the mutation already fully captures "paid" by
 * advancing `skip_next_date`, and after a refresh the row's own
 * nextChargeDateIso already reflects the new cycle correctly on its own.
 * This local flag only remembers, for the rest of this browser session,
 * that THIS row was the one that just did that — a genuine, disclosed
 * scope edge (a hard page reload loses the Undo affordance, but the bill
 * really is still marked paid; only the one-click convenience is lost).
 *
 * DataList's own `getHref` isn't used here (unlike the Load Board): every
 * cell DataList renders would otherwise get wrapped in one shared <Link>,
 * which would nest this table's real buttons inside an <a> — invalid HTML
 * and broken click handling. Instead only the Bill column's own name is a
 * <Link> into the edit context drawer, matching mobile's AllBillsCard row-
 * as-link pattern column-scoped instead of row-scoped.
 */
// Same `?id=` context-drawer link page.tsx's own buildHref() produces —
// duplicated here (not passed down as a prop) because this is a Client
// Component: a Server Component can't hand a plain function across the
// server/client boundary (only data and Server Actions survive
// serialization), so page.tsx's `rowHref` closure can never reach this file
// as-is. It's cheap enough to re-derive locally rather than route it through
// a Server Action just to keep one call site.
function expenseHref(id: string): string {
  return `/tms-v2/expenses?id=${id}`;
}

export function ExpensesDesktopTable({
  rows,
  accounts,
}: {
  rows: RecurringExpenseRow[];
  accounts: { id: string; name: string }[];
}) {
  const router = useRouter();
  // Presence in this map = "just marked paid this session"; the value is
  // the row's own skip_next_date AS IT WAS the moment before the mutation
  // ran, captured from that row's already-loaded props — Undo restores
  // exactly that, not a blind null-out.
  const [justPaid, setJustPaid] = useState<Map<string, string | null>>(new Map());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onMarkPaid(row: RecurringExpenseRow) {
    setBusyId(row.id);
    setError(null);
    const result: MutationResult<{ paidThroughDate: string }> = await markBillPaidThisCycle(row.id);
    setBusyId(null);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setJustPaid((prev) => new Map(prev).set(row.id, row.skipNextDate));
    router.refresh();
  }

  async function onUndo(row: RecurringExpenseRow) {
    const restoreTo = justPaid.get(row.id) ?? null;
    setBusyId(row.id);
    setError(null);
    const result: MutationResult = await undoMarkBillPaid(row.id, restoreTo);
    setBusyId(null);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setJustPaid((prev) => {
      const next = new Map(prev);
      next.delete(row.id);
      return next;
    });
    router.refresh();
  }

  const sorted = rows.slice().sort((a, b) => b.monthlyAmount - a.monthlyAmount || a.name.localeCompare(b.name));
  const { monthlyTotal, annualTotal, activeCount, pausedCount } = computeFixedMonthlySummary(rows);

  const columns: DataListColumn<RecurringExpenseRow>[] = [
    {
      key: "name",
      header: "Bill",
      render: (r) => (
        <Link href={expenseHref(r.id)} className="font-medium text-fg hover:text-accent">
          {r.name}
        </Link>
      ),
    },
    { key: "category", header: "Category", render: (r) => r.category ?? "—" },
    { key: "due", header: "Due", render: (r) => r.nextChargeLabel ?? "—" },
    { key: "account", header: "Account", render: (r) => r.cardName ?? "—" },
    {
      key: "monthly",
      header: "Monthly",
      align: "right",
      render: (r) => {
        if (r.monthlyAmount === 0) return <span className="font-semibold text-fg">$0</span>;
        const suffix = CYCLE_SUFFIX[r.frequency];
        return (
          <span className="inline-flex items-baseline gap-1">
            <Money value={r.amount} tone="none" className="font-semibold" />
            {suffix ? <span className="text-[12px] font-medium text-fg-muted">{suffix}</span> : null}
          </span>
        );
      },
    },
    { key: "next", header: "Next", render: (r) => <NextPill row={r} justPaid={justPaid.has(r.id)} /> },
    {
      key: "status",
      header: "Status",
      render: (r) => (justPaid.has(r.id) ? <span className="text-fg-muted">Resets {r.nextChargeLabel ?? "next cycle"}</span> : "—"),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          {justPaid.has(r.id) ? (
            <Button type="button" variant="secondary" size="sm" disabled={busyId === r.id} onClick={() => onUndo(r)}>
              {busyId === r.id ? "…" : "Undo"}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={busyId === r.id || r.monthlyAmount === 0}
              onClick={() => onMarkPaid(r)}
              className="bg-ok text-white hover:bg-ok hover:opacity-90"
            >
              {busyId === r.id ? "…" : "Mark paid"}
            </Button>
          )}
          <Link
            href={expenseHref(r.id)}
            className="inline-flex h-8 items-center justify-center rounded-md border border-line-strong bg-card px-3 text-[13px] font-medium text-fg shadow-e1 transition-colors hover:bg-elevated"
          >
            Edit
          </Link>
          <ExpenseKebabMenu expense={r} accounts={accounts} />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      {error ? <p className="text-[13px] font-medium text-bad">{error}</p> : null}
      <DataList
        columns={columns}
        rows={sorted}
        rowKey={(r) => r.id}
        emptyMessage="No recurring bills yet."
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3 text-[13px]">
            <span className="font-medium text-fg-muted">
              {activeCount} active bill{activeCount === 1 ? "" : "s"}
              {pausedCount > 0 ? ` · ${pausedCount} need amounts` : ""}
            </span>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <span className="text-fg-muted">
                <span className="font-semibold tabular-nums text-fg">{formatMoney(monthlyTotal)}</span> / mo
              </span>
              <span className="text-fg-muted">
                ≈ <span className="font-semibold tabular-nums text-fg">{formatMoney(annualTotal)}</span> / year
              </span>
            </div>
          </div>
        }
      />
    </div>
  );
}
