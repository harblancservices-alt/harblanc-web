"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Money } from "@/components/tms-v2/ui/Money";
import { Button } from "@/components/tms-v2/ui/Button";
import type { ExpenseSortKey, RecurringExpenseRow } from "@/lib/data/recurring-expenses";
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const SORT_PILLS: { key: ExpenseSortKey; label: string }[] = [
  { key: "vendor", label: "Vendor" },
  { key: "category", label: "Category" },
  { key: "amount", label: "Amount" },
  { key: "next", label: "Next charge" },
];

function CategoryPill({ category }: { category: string | null }) {
  return (
    <span className="shrink-0 rounded-full bg-elevated px-2 py-0.5 text-[11px] font-medium text-fg-muted">
      {category ?? "No category"}
    </span>
  );
}

/** One tight row — avatar-with-gap-dot, vendor/payee + category pill +
 * frequency, amount with its next-charge date stacked underneath. Same
 * "compact directory" family as the Brokers list's CompactBrokerRow, but
 * unsplit: this screen applies the same treatment on mobile AND desktop
 * per Brent's explicit ask, rather than keeping a separate heavier desktop
 * table. Money stays neutral ink (tone="none") except the one real red
 * case — a manual (non-autopay) charge whose next charge date has arrived
 * and hasn't been handled — no red-by-default the way a raw due-date table
 * would render it. */
function ExpenseRow({
  r,
  href,
  selectMode,
  selected,
  onToggle,
  accountNameSet,
}: {
  r: RecurringExpenseRow;
  href: string;
  selectMode: boolean;
  selected: boolean;
  onToggle: () => void;
  accountNameSet: Set<string>;
}) {
  const gaps = expenseGaps(
    { amount: r.amount, frequency: r.frequency, dayOfMonth: r.dayOfMonth, dayOfWeek: r.dayOfWeek, startDate: r.startDate, card: r.cardName, category: r.category },
    accountNameSet,
  );
  const overdue = !r.autopay && r.nextChargeDateIso === todayIso();
  const name = r.vendor || r.name;

  return (
    <div className={`flex items-center gap-2.5 border-b border-line px-3 py-2.5 last:border-b-0 hover:bg-elevated ${r.archived ? "opacity-60" : ""}`}>
      {selectMode ? (
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${name}`} className="h-4 w-4 shrink-0" />
      ) : null}
      <Link href={href} className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-elevated text-[11px] font-semibold text-fg-muted">
          {initials(name)}
          {gaps.length > 0 ? (
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-warn ring-2 ring-card"
              title={`Incomplete: ${gaps.map((g) => EXPENSE_GAP_LABEL[g]).join(", ")}`}
            />
          ) : null}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-semibold text-fg">{name}</span>
            {r.archived ? (
              <span className="shrink-0 rounded-full bg-elevated px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-fg-muted">
                Archived
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <CategoryPill category={r.category} />
            <span className="truncate text-[12px] text-fg-muted">{RECURRING_FREQUENCY_LABEL[r.frequency]}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <Money value={r.amount} tone={overdue ? "negative" : "none"} className="text-[13px] font-semibold" />
          {overdue ? (
            <span className="text-[11px] font-medium text-bad">Due today</span>
          ) : r.nextChargeLabel ? (
            <span className="text-[11px] text-fg-muted">{r.nextChargeLabel}</span>
          ) : null}
        </div>
      </Link>
      <ExpenseRowActions expense={r} />
    </div>
  );
}

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
  const [state, setState] = useState<{ pending: boolean; error: string | null }>({ pending: false, error: null });
  const [category, setCategory] = useState("");

  const accountNameSet = useMemo(() => new Set(accountNames), [accountNames]);

  const activeSort = typeof baseParams.sort === "string" ? (baseParams.sort as ExpenseSortKey) : null;
  const activeDir = baseParams.dir === "asc" ? "asc" : "desc";

  function rowHref(id: string): string {
    return buildHref(baseParams, { id });
  }

  function sortHrefFor(key: ExpenseSortKey): string {
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

  // Distinct sections (Phase 4) — a one-time charge has no real "next
  // charge" cadence, so it never belongs sorted into the recurring bills'
  // list. Same combined fetch/sort/pagination as before; split for display
  // only, preserving whatever order the server already returned.
  const recurringRows = rows.filter((r) => r.frequency !== "onetime");
  const oneTimeRows = rows.filter((r) => r.frequency === "onetime");

  return (
    <div className="flex flex-col gap-3">
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-elevated px-3.5 py-2.5 text-[13px] shadow-e1">
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

      {rows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-fg-muted">Sort:</span>
          {SORT_PILLS.map(({ key, label }) => (
            <Link
              key={key}
              href={sortHrefFor(key)}
              className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${
                activeSort === key ? "bg-accent text-white" : "bg-elevated text-fg-muted"
              }`}
            >
              {label}
              {activeSort === key ? <span aria-hidden> {activeDir === "asc" ? "▲" : "▼"}</span> : null}
            </Link>
          ))}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-card px-4 py-10 text-center">
          <p className="text-[13px] text-fg-muted">No expenses match these filters.</p>
        </div>
      ) : (
        <>
          <div>
            <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-fg-muted">
              Recurring bills {recurringRows.length > 0 ? `· ${recurringRows.length}` : ""}
            </div>
            {recurringRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line-strong bg-card px-4 py-6 text-center">
                <p className="text-[13px] text-fg-muted">No recurring bills match these filters.</p>
              </div>
            ) : (
              <div className="no-scrollbar overflow-hidden rounded-xl border border-line bg-card shadow-e1">
                {recurringRows.map((r) => (
                  <ExpenseRow
                    key={r.id}
                    r={r}
                    href={rowHref(r.id)}
                    selectMode
                    selected={selected.has(r.id)}
                    onToggle={() => onToggle(r.id)}
                    accountNameSet={accountNameSet}
                  />
                ))}
              </div>
            )}
          </div>

          {oneTimeRows.length > 0 ? (
            <div>
              <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-fg-muted">
                One-time expenses · {oneTimeRows.length}
              </div>
              <div className="no-scrollbar overflow-hidden rounded-xl border border-line bg-card shadow-e1">
                {oneTimeRows.map((r) => (
                  <ExpenseRow
                    key={r.id}
                    r={r}
                    href={rowHref(r.id)}
                    selectMode
                    selected={selected.has(r.id)}
                    onToggle={() => onToggle(r.id)}
                    accountNameSet={accountNameSet}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
