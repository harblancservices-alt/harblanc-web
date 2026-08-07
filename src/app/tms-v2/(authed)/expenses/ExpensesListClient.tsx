"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DataList, type DataListColumn } from "@/components/tms-v2/ui/DataList";
import { Money } from "@/components/tms-v2/ui/Money";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { Button } from "@/components/tms-v2/ui/Button";
import type { RecurringExpenseRow } from "@/lib/data/recurring-expenses";
import { EXPENSE_CATEGORIES, RECURRING_FREQUENCY_LABEL } from "@/lib/domain/expenses";
import { expenseGaps, EXPENSE_GAP_LABEL } from "@/lib/dispatch/alerts";
import { bulkArchiveExpenses, bulkDeleteExpenses, bulkChangeExpenseCategory } from "@/actions/tms-v2/expenses";
import { ExpenseRowActions } from "./ExpenseRowActions";

function buildHref(base: Record<string, string | number | undefined>, extra: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...extra })) {
    if (v !== undefined && v !== "" && v !== "all") usp.set(k, String(v));
  }
  const qs = usp.toString();
  return qs ? `/tms-v2/expenses?${qs}` : "/tms-v2/expenses";
}

function buildColumns(accountNames: string[]): DataListColumn<RecurringExpenseRow>[] {
  const accountNameSet = new Set(accountNames);

  function gapsFor(r: RecurringExpenseRow) {
    return expenseGaps(
      { amount: r.amount, frequency: r.frequency, dayOfMonth: r.dayOfMonth, dayOfWeek: r.dayOfWeek, startDate: r.startDate, card: r.cardName, category: r.category },
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
      sortable: true,
    },
    { key: "category", header: "Category", render: (r) => r.category ?? "—", sortable: true },
    {
      key: "card",
      header: "Card",
      render: (r) => (r.cardName ? <span>{r.cardName}{r.cardLast4 ? <span className="text-fg-muted"> ····{r.cardLast4}</span> : null}</span> : "—"),
      hideOnMobile: true,
    },
    { key: "frequency", header: "Frequency", render: (r) => RECURRING_FREQUENCY_LABEL[r.frequency] },
    { key: "next", header: "Next charge", render: (r) => r.nextChargeLabel ?? "—", sortable: true },
    { key: "status", header: "Status", render: (r) => (r.archived ? "Archived" : "Active"), hideOnMobile: true },
    { key: "amount", header: "Amount", render: (r) => <Money value={r.amount} tone="none" />, align: "right", sortable: true },
    { key: "actions", header: "", render: (r) => <ExpenseRowActions expense={r} />, align: "right" },
  ];
}

type SaveState = { pending: boolean; error: string | null };

export function ExpensesListClient({
  rows,
  accountNames,
  baseParams,
}: {
  rows: RecurringExpenseRow[];
  accountNames: string[];
  baseParams: Record<string, string | number | undefined>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, setState] = useState<SaveState>({ pending: false, error: null });
  const [category, setCategory] = useState("");

  const columns = useMemo(() => buildColumns(accountNames), [accountNames]);

  function rowHref(id: string): string {
    return buildHref(baseParams, { id });
  }

  const activeSort = typeof baseParams.sort === "string" ? baseParams.sort : null;
  const activeDir = baseParams.dir === "asc" ? "asc" : "desc";

  function sortHrefFor(key: string): string {
    const nextDir = activeSort === key && activeDir === "asc" ? "desc" : "asc";
    return buildHref({ ...baseParams, page: undefined }, { sort: key, dir: nextDir });
  }

  function onToggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onToggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  function clearAndRefresh() {
    setSelected(new Set());
    router.refresh();
  }

  function runBulk(fn: () => Promise<{ ok: boolean; reason?: string }>) {
    setState({ pending: true, error: null });
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setState({ pending: false, error: null });
        clearAndRefresh();
      } else {
        setState({ pending: false, error: res.reason ?? "Something went wrong." });
      }
    });
  }

  const busy = isPending || state.pending;

  return (
    <div className="flex flex-col gap-3">
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line-strong bg-elevated px-3 py-2 text-[13px]">
          <span className="font-medium text-fg">{selected.size} selected</span>
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => runBulk(() => bulkArchiveExpenses(Array.from(selected)))}>
            Archive
          </Button>
          <select
            value={category}
            onChange={(e) => {
              const v = e.target.value;
              setCategory(v);
              if (v) runBulk(() => bulkChangeExpenseCategory(Array.from(selected), v));
            }}
            disabled={busy}
            className="h-8 rounded-md border border-line-strong bg-card px-2 text-[13px] text-fg"
          >
            <option value="">Change category…</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={() => {
              if (!confirm(`Delete ${selected.size} expense${selected.size === 1 ? "" : "s"}? This cannot be undone.`)) return;
              runBulk(() => bulkDeleteExpenses(Array.from(selected)));
            }}
          >
            Delete
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setSelected(new Set())}>
            Cancel
          </Button>
          {state.error ? <span className="text-[13px] font-medium text-bad">{state.error}</span> : null}
        </div>
      ) : null}

      <DataList
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        getHref={(r) => rowHref(r.id)}
        emptyMessage="No recurring expenses match these filters."
        selection={{ selectedIds: selected, onToggle, onToggleAll, allSelected: rows.length > 0 && selected.size === rows.length }}
        sort={{ activeKey: activeSort, dir: activeDir, hrefFor: sortHrefFor }}
      />

      <p className="text-[13px] text-fg-muted">
        Server render time: <DateTimeCST value={new Date()} />
      </p>
    </div>
  );
}
