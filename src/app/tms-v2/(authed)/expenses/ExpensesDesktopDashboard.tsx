"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/tms-v2/ui/Card";
import { KpiTile } from "@/components/tms-v2/ui/KpiTile";
import { Money } from "@/components/tms-v2/ui/Money";
import { DataList, type DataListColumn } from "@/components/tms-v2/ui/DataList";
import { formatMoney } from "@/lib/domain/money";
import { RECURRING_FREQUENCY_LABEL } from "@/lib/domain/expenses";
import { computeFixedMonthlySummary } from "./FixedMonthlyHeaderCard";
import { dateBadge, daysUntil } from "./ComingUpCard";
import { ImportExpensesButton } from "./ImportExpensesButton";
import { ExportExpensesCsvButton } from "./ExportExpensesCsvButton";
import { ExpenseComposerToggleButton } from "./ExpenseComposer";
import type { RecurringExpenseRow } from "@/lib/data/recurring-expenses";

function expenseHref(id: string): string {
  return `/tms-v2/expenses?id=${id}`;
}

function AutopayBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-ok-bg px-2 py-0.5 text-[11px] font-semibold text-ok">
      Autopay
    </span>
  );
}

/**
 * Desktop Expenses — Brent's approved full dashboard mockup (2026-08-14),
 * replacing the earlier header-band + table pair (ExpensesDesktopHeaderBand
 * / ExpensesDesktopTable) with one contained page: title + toolbar, a 5-tile
 * KPI strip (Net YTD sourced from the same YTD analytics Performance uses —
 * see page.tsx's own comment), category-cost bars + a "Coming up" panel,
 * then the full bills table. Desktop-only (rendered inside a `hidden
 * lg:flex` wrapper by page.tsx); mobile keeps FixedMonthlyHeaderCard /
 * ComingUpCard / AllBillsCard exactly as they were, untouched.
 *
 * Search is client-local (no `?q=` round trip) and scoped to THIS
 * component's own table + CSV export only — it never touches the `rows`
 * array mobile's stack renders, so mobile behavior can't be affected by
 * anything a desktop visitor types here.
 */
export function ExpensesDesktopDashboard({
  rows,
  netYtd,
  ytdLabel,
}: {
  rows: RecurringExpenseRow[];
  netYtd: number;
  ytdLabel: string;
}) {
  const [q, setQ] = useState("");

  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(needle) || (r.vendor ?? "").toLowerCase().includes(needle));
  }, [rows, q]);

  const { monthlyTotal, annualTotal, activeCount, categoryBreakdown } = computeFixedMonthlySummary(rows);
  const maxCategory = Math.max(1, ...categoryBreakdown.map(([, v]) => v));

  const dueSoon = rows.filter((r) => r.nextChargeDateIso != null && daysUntil(r.nextChargeDateIso) >= 0 && daysUntil(r.nextChargeDateIso) <= 7);
  const dueThisWeekTotal = dueSoon.reduce((s, r) => s + r.amount, 0);

  const largest = rows.slice().sort((a, b) => b.monthlyAmount - a.monthlyAmount)[0] ?? null;

  const comingUp = rows
    .filter((r): r is RecurringExpenseRow & { nextChargeDateIso: string } => r.dayOfMonth != null && r.nextChargeDateIso != null)
    .sort((a, b) => a.nextChargeDateIso.localeCompare(b.nextChargeDateIso))
    .slice(0, 6);

  const columns: DataListColumn<RecurringExpenseRow>[] = [
    { key: "name", header: "Bill", render: (r) => <span className="font-medium text-fg">{r.name}</span> },
    { key: "category", header: "Category", render: (r) => r.category ?? "—" },
    { key: "vendor", header: "Vendor", render: (r) => r.vendor ?? "—" },
    { key: "amount", header: "Amount", align: "right", render: (r) => <Money value={r.amount} tone="none" /> },
    { key: "frequency", header: "Frequency", render: (r) => RECURRING_FREQUENCY_LABEL[r.frequency] },
    { key: "day", header: "Day", render: (r) => (r.dayOfMonth != null ? String(r.dayOfMonth) : r.dayOfWeek ?? "—") },
    { key: "autopay", header: "Autopay", render: (r) => (r.autopay ? <AutopayBadge /> : "—") },
    {
      key: "monthly",
      header: "Monthly",
      align: "right",
      render: (r) => <Money value={r.monthlyAmount} tone="none" className="font-semibold" />,
    },
  ];

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4">
      {/* 1. Header row — title left, toolbar right. */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[20px] font-semibold text-fg">Expenses</h1>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search bills"
            className="h-8 w-52 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
          />
          <ImportExpensesButton />
          <ExportExpensesCsvButton rows={filteredRows} />
          <ExpenseComposerToggleButton size="sm" />
        </div>
      </div>

      {/* 2. KPI strip. */}
      <div className="grid grid-cols-5 gap-3">
        <KpiTile
          label="Fixed monthly"
          value={formatMoney(monthlyTotal)}
          delta={`${activeCount} active bill${activeCount === 1 ? "" : "s"}`}
          emphasis="dark"
        />
        <KpiTile label="Annualized" value={formatMoney(annualTotal)} delta="Fixed monthly × 12" />
        <KpiTile label="Net YTD" value={<Money value={netYtd} className="font-semibold" />} delta={ytdLabel} />
        <KpiTile
          label="Due this week"
          value={formatMoney(dueThisWeekTotal)}
          delta={`${dueSoon.length} bill${dueSoon.length === 1 ? "" : "s"}`}
        />
        <KpiTile
          label="Largest"
          value={largest ? formatMoney(largest.monthlyAmount) : "—"}
          delta={largest ? `${largest.name} / mo` : "No bills yet"}
        />
      </div>

      {/* 3. Category cost bars + Coming up. */}
      <div className="grid grid-cols-[55fr_45fr] gap-4">
        <Card>
          <p className="mb-3 text-[13px] font-semibold text-fg">Monthly cost by category</p>
          {categoryBreakdown.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-fg-muted">No categorized bills yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {categoryBreakdown.map(([category, amount]) => {
                const widthPct = Math.max(4, Math.round((amount / maxCategory) * 100));
                return (
                  <div key={category} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="min-w-0 truncate font-medium text-fg">{category}</span>
                      <Money value={amount} tone="none" className="shrink-0 font-semibold" />
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-elevated">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${widthPct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <p className="mb-3 text-[13px] font-semibold text-fg">Coming up</p>
          {comingUp.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-fg-muted">Nothing scheduled.</p>
          ) : (
            <div className="flex flex-col divide-y divide-line">
              {comingUp.map((r) => {
                const { mon, day } = dateBadge(r.nextChargeDateIso);
                return (
                  <Link
                    key={r.id}
                    href={expenseHref(r.id)}
                    className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 hover:opacity-80"
                  >
                    <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-md bg-elevated text-fg">
                      <span className="text-[9px] font-bold uppercase tracking-wide text-fg-muted">{mon}</span>
                      <span className="text-[14px] font-bold leading-none">{day}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold text-fg">{r.name}</span>
                        {r.autopay ? <AutopayBadge /> : null}
                      </div>
                    </div>
                    <Money value={r.amount} tone="none" className="shrink-0 font-semibold" />
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* 4. All recurring bills — whole row links into the same edit
          drawer mobile's AllBillsCard rows do. */}
      <DataList
        columns={columns}
        rows={filteredRows}
        rowKey={(r) => r.id}
        getHref={(r) => expenseHref(r.id)}
        emptyMessage="No recurring bills yet."
      />
    </div>
  );
}
