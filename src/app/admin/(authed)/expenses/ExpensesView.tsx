"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { KPI } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusTag } from "@/components/ui/StatusTag";
import { field } from "@/components/ui/styles";
import { LABEL } from "./formLabel";
import {
  archiveExpense,
  bulkArchiveExpenses,
  bulkChangeCategory,
  bulkDeleteExpenses,
  deleteExpense,
  duplicateExpense,
  importExpenses,
  restoreExpense,
  skipNextPayment,
  type ImportExpenseRow,
} from "./actions";
import { ExpenseRowMenu } from "./ExpenseRowMenu";
import { ExpenseSlideOver } from "./ExpenseSlideOver";
import { PaymentMethodsDialog } from "./PaymentMethodsDialog";
import {
  CATEGORIES,
  FREQUENCIES,
  FREQUENCY_LABEL,
  FREQUENCY_TONE,
  chargeScheduleLabel,
  isFrequency,
  type ExpenseItem,
  type ExpensesData,
} from "./types";
import {
  IconChevronDown,
  IconDownload,
  IconFilter,
  IconInbox,
  IconPlus,
  IconSearch,
  IconUpload,
  IconX,
} from "./icons";

/**
 * Expenses — QuickBooks-style ledger. A dense sortable table is the primary
 * surface (toolbar + KPI strip above it, a right-side slide-over for detail/
 * edit, a kebab menu per row for secondary actions) instead of the previous
 * stacked-card layout. Manual tracker still — nothing here is linked to a
 * bank or card and no money moves.
 *
 * THEME SAFETY: card/inset/elevated are THEMED surfaces, so content on top of
 * them uses the theme-aware text-fg/-muted/-subtle tiers, never the FIXED
 * text-ink family (which stays near-black even under the admin's dark theme
 * and would go invisible on a dark card). Fixed tints (frequency/status
 * pills) use the V2 status tokens (bg-*-bg/text-*), which are intentionally
 * theme-independent.
 *
 * CONTRAST: per owner feedback, every label/button/value on this page uses
 * the PRIMARY text-fg tier (near-black in the default light admin theme) —
 * the lighter -muted/-subtle tiers are reserved for genuinely secondary
 * metadata (timestamps, placeholder text, unit annotations next to a bold
 * value), never for labels, buttons, or primary content.
 */

type Status = "all" | "active" | "archived";
type SortKey = "vendor" | "category" | "amount" | "frequency" | "nextCharge" | "status";
type Dir = "asc" | "desc";

type Filters = {
  category: string;
  vendor: string;
  paymentMethod: string;
  status: Status;
  dateFrom: string;
  dateTo: string;
  recurringOnly: boolean;
};

const EMPTY_FILTERS: Filters = {
  category: "",
  vendor: "",
  paymentMethod: "",
  status: "all",
  dateFrom: "",
  dateTo: "",
  recurringOnly: false,
};

type SavedFilter = { name: string; search: string; filters: Filters };
const SAVED_FILTERS_KEY = "hb-expenses-saved-filters";

const PAGE_SIZE = 25;

export function ExpensesView({ data }: { data: ExpensesData }) {
  const router = useRouter();
  const [panel, setPanel] = useState<"new" | ExpenseItem | null>(null);
  const [methodsOpen, setMethodsOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<{ key: SortKey; dir: Dir }>({ key: "nextCharge", dir: "asc" });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, startBusy] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [savedFiltersOpen, setSavedFiltersOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVED_FILTERS_KEY);
      if (raw) setSavedFilters(JSON.parse(raw));
    } catch {
      // ignore malformed storage
    }
  }, []);

  useEffect(() => {
    setPage(0);
  }, [search, filters]);

  function runAction(fn: () => Promise<void>) {
    setActionError(null);
    startBusy(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  const vendors = useMemo(() => {
    const set = new Set<string>();
    for (const e of data.expenses) set.add(e.vendor || e.name);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data.expenses]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.expenses.filter((e) => {
      if (q) {
        const hay = `${e.vendor ?? ""} ${e.name} ${e.notes ?? ""} ${e.category ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.category && e.category !== filters.category) return false;
      if (filters.vendor && (e.vendor || e.name) !== filters.vendor) return false;
      if (filters.paymentMethod && (e.card ?? "") !== filters.paymentMethod) return false;
      if (filters.status === "active" && e.archived) return false;
      if (filters.status === "archived" && !e.archived) return false;
      if (filters.recurringOnly && e.frequency === "onetime") return false;
      if (filters.dateFrom && (!e.nextChargeDateIso || e.nextChargeDateIso < filters.dateFrom)) return false;
      if (filters.dateTo && (!e.nextChargeDateIso || e.nextChargeDateIso > filters.dateTo)) return false;
      return true;
    });
  }, [data.expenses, search, filters]);

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const copy = [...filtered];
    copy.sort((a, b) => {
      switch (sort.key) {
        case "vendor":
          return dir * (a.vendor || a.name).localeCompare(b.vendor || b.name);
        case "category":
          return dir * (a.category ?? "").localeCompare(b.category ?? "");
        case "amount":
          return dir * (a.amount - b.amount);
        case "frequency":
          return dir * FREQUENCIES.indexOf(a.frequency) - dir * FREQUENCIES.indexOf(b.frequency);
        case "status":
          return dir * (Number(a.archived) - Number(b.archived));
        case "nextCharge": {
          const av = a.nextChargeDateIso ?? "9999-99-99";
          const bv = b.nextChargeDateIso ?? "9999-99-99";
          return dir * av.localeCompare(bv);
        }
        default:
          return 0;
      }
    });
    return copy;
  }, [filtered, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const paged = sorted.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

  const activeFilterCount =
    (filters.category ? 1 : 0) +
    (filters.vendor ? 1 : 0) +
    (filters.paymentMethod ? 1 : 0) +
    (filters.status !== "all" ? 1 : 0) +
    (filters.dateFrom || filters.dateTo ? 1 : 0) +
    (filters.recurringOnly ? 1 : 0);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      if (prev.size === sorted.length) return new Set();
      return new Set(sorted.map((e) => e.id));
    });
  }

  function exportCsv(rows: ExpenseItem[]) {
    const header = [
      "Vendor",
      "Category",
      "Description",
      "Amount",
      "Payment Method",
      "Frequency",
      "Next Charge",
      "Status",
      "Start Date",
      "Tags",
    ];
    const lines = [header.join(",")];
    for (const e of rows) {
      const cells = [
        e.vendor || e.name,
        e.category ?? "",
        e.notes ?? "",
        e.amount.toFixed(2),
        e.card ?? "",
        FREQUENCY_LABEL[e.frequency],
        e.nextChargeDateIso ?? "",
        e.archived ? "Archived" : "Active",
        e.startDate ?? "",
        e.tags.join("; "),
      ];
      lines.push(cells.map(csvEscape).join(","));
    }
    downloadFile(
      `expenses-${new Date().toISOString().slice(0, 10)}.csv`,
      lines.join("\n"),
      "text/csv;charset=utf-8",
    );
  }

  function handleImportFile(file: File) {
    setImporting(true);
    setActionError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseImportCsv(String(reader.result ?? ""));
        if (rows.length === 0) throw new Error("No valid rows found in that file.");
        startBusy(async () => {
          const res = await importExpenses(rows);
          if (!res.ok) setActionError(res.reason);
          else router.refresh();
          setImporting(false);
        });
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Could not read that CSV file.");
        setImporting(false);
      }
    };
    reader.onerror = () => {
      setActionError("Could not read that CSV file.");
      setImporting(false);
    };
    reader.readAsText(file);
  }

  function saveCurrentFilter() {
    const name = window.prompt("Name this filter view:");
    if (!name || !name.trim()) return;
    const next = [...savedFilters.filter((f) => f.name !== name.trim()), { name: name.trim(), search, filters }];
    setSavedFilters(next);
    window.localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(next));
  }

  function applySavedFilter(sf: SavedFilter) {
    setSearch(sf.search);
    setFilters(sf.filters);
    setSavedFiltersOpen(false);
  }

  function removeSavedFilter(name: string) {
    const next = savedFilters.filter((f) => f.name !== name);
    setSavedFilters(next);
    window.localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(next));
  }

  const selectedRows = sorted.filter((e) => selected.has(e.id));

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <PageHeader
          eyebrow="Payments"
          title="Expenses"
          className="mb-4"
          actions={
            <>
              <Button type="button" onClick={() => setMethodsOpen(true)} variant="navigate" size="md">
                Payment methods
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImportFile(f);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                variant="utility"
                size="md"
                leftIcon={<IconUpload className="h-3.5 w-3.5" />}
              >
                {importing ? "Importing…" : "Import"}
              </Button>
              <Button
                type="button"
                onClick={() => exportCsv(selectedRows.length > 0 ? selectedRows : sorted)}
                variant="utility"
                size="md"
                leftIcon={<IconDownload className="h-3.5 w-3.5" />}
              >
                Export
              </Button>
              <Button type="button" onClick={() => setPanel("new")} variant="primary" size="md">
                + New Expense
              </Button>
            </>
          }
        />

        <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <KPI label="This Month" value={usd(data.kpis.thisMonth)} />
          <KPI label="Recurring" value={String(data.kpis.recurringCount)} sub="active charges" />
          <KPI label="YTD Expenses" value={usd(data.kpis.ytd)} />
          <KPI label="Average Monthly" value={usd(data.kpis.averageMonthly)} />
        </div>

        {actionError ? (
          <div className="mb-3 rounded-md border border-bad bg-bad-bg px-3 py-2 text-[12.5px] font-bold text-bad">
            {actionError}
          </div>
        ) : null}

        {/* ── Toolbar ── */}
        <div className="mb-3 rounded-md border border-line-strong bg-card p-2.5 shadow-e1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1">
              <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search expenses…"
                className="h-9 w-full rounded-md border border-line-strong bg-card pl-8 pr-3 text-[13px] font-medium text-fg outline-none placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent/40"
              />
            </div>

            {/* Mobile: collapse the rest into a sheet */}
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-card px-3 text-[12.5px] font-bold text-fg sm:hidden"
            >
              <IconFilter className="h-3.5 w-3.5" />
              Filters
              {activeFilterCount > 0 ? (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] text-white">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>

            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <DesktopFilters
                filters={filters}
                setFilters={setFilters}
                vendors={vendors}
                accounts={data.accounts}
              />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setSavedFiltersOpen((v) => !v)}
                  className="inline-flex h-9 items-center gap-1 rounded-md border border-line-strong bg-card px-2.5 text-[12px] font-bold text-fg hover:border-accent hover:text-accent"
                >
                  Saved
                  <IconChevronDown className="h-3 w-3" />
                </button>
                {savedFiltersOpen ? (
                  <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-md border border-line-strong bg-card p-1.5 shadow-e3">
                    <button
                      type="button"
                      onClick={() => {
                        saveCurrentFilter();
                        setSavedFiltersOpen(false);
                      }}
                      className="w-full rounded px-2 py-1.5 text-left text-[12px] font-bold text-accent hover:bg-elevated"
                    >
                      + Save current filters
                    </button>
                    {savedFilters.length > 0 ? <div className="my-1 border-t border-line-strong" /> : null}
                    {savedFilters.map((sf) => (
                      <div key={sf.name} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => applySavedFilter(sf)}
                          className="flex-1 truncate rounded px-2 py-1.5 text-left text-[12px] font-semibold text-fg hover:bg-elevated"
                        >
                          {sf.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSavedFilter(sf.name)}
                          aria-label={`Remove ${sf.name}`}
                          className="rounded p-1 text-fg-muted hover:text-bad"
                        >
                          <IconX className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setFilters(EMPTY_FILTERS)}
                  className="text-[12px] font-bold text-fg hover:text-accent"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {mobileFiltersOpen ? (
          <MobileFilterSheet
            filters={filters}
            setFilters={setFilters}
            vendors={vendors}
            accounts={data.accounts}
            onClose={() => setMobileFiltersOpen(false)}
          />
        ) : null}

        {selected.size > 0 ? (
          <BulkBar
            count={selected.size}
            busy={busy}
            onClear={() => setSelected(new Set())}
            onArchive={() => runAction(async () => bulkArchiveExpenses(Array.from(selected)))}
            onDelete={() => {
              if (!window.confirm(`Delete ${selected.size} expense(s)? This removes them from the tracker.`)) return;
              runAction(async () => bulkDeleteExpenses(Array.from(selected)));
            }}
            onCategory={(category) => runAction(async () => bulkChangeCategory(Array.from(selected), category))}
            onExport={() => exportCsv(selectedRows)}
          />
        ) : null}

        {data.expenses.length === 0 ? (
          <EmptyState onAdd={() => setPanel("new")} />
        ) : sorted.length === 0 ? (
          <div className="rounded-md border border-dashed border-line-strong bg-card px-6 py-10 text-center shadow-e1">
            <p className="text-[13px] font-semibold text-fg">No expenses match these filters.</p>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setFilters(EMPTY_FILTERS);
              }}
              className="mt-2 text-[12.5px] font-bold text-accent hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <DesktopTable
              rows={paged}
              sort={sort}
              onSort={toggleSort}
              selected={selected}
              allSelected={selected.size > 0 && selected.size === sorted.length}
              onToggleAll={toggleSelectAll}
              onToggleRow={toggleSelected}
              onOpen={(e) => setPanel(e)}
              onDuplicate={(id) => runAction(async () => duplicateExpense(id))}
              onSkip={(id) => runAction(async () => skipNextPayment(id))}
              onToggleArchive={(e) =>
                runAction(async () => (e.archived ? restoreExpense(e.id) : archiveExpense(e.id)))
              }
              onDelete={(e) => {
                if (!window.confirm(`Delete "${e.vendor || e.name}"? This removes it from the tracker.`)) return;
                runAction(async () => deleteExpense(e.id));
              }}
            />
            <MobileCards
              rows={paged}
              onOpen={(e) => setPanel(e)}
              onDuplicate={(id) => runAction(async () => duplicateExpense(id))}
              onSkip={(id) => runAction(async () => skipNextPayment(id))}
              onToggleArchive={(e) =>
                runAction(async () => (e.archived ? restoreExpense(e.id) : archiveExpense(e.id)))
              }
              onDelete={(e) => {
                if (!window.confirm(`Delete "${e.vendor || e.name}"? This removes it from the tracker.`)) return;
                runAction(async () => deleteExpense(e.id));
              }}
            />

            {pageCount > 1 ? (
              <div className="mt-3 flex items-center justify-between gap-3 text-[12.5px] font-medium text-fg-muted">
                <span>
                  {clampedPage * PAGE_SIZE + 1}–{Math.min(sorted.length, (clampedPage + 1) * PAGE_SIZE)} of{" "}
                  {sorted.length}
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={clampedPage === 0}
                    variant="navigate"
                    size="sm"
                  >
                    Prev
                  </Button>
                  <span className="font-bold tabular-nums text-fg">
                    {clampedPage + 1} / {pageCount}
                  </span>
                  <Button
                    type="button"
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    disabled={clampedPage >= pageCount - 1}
                    variant="navigate"
                    size="sm"
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Mobile floating add button */}
      <button
        type="button"
        onClick={() => setPanel("new")}
        aria-label="Add expense"
        className="fixed bottom-5 right-5 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-e3 transition-colors hover:bg-accent-hover sm:hidden"
      >
        <IconPlus className="h-6 w-6" />
      </button>

      {panel ? (
        <ExpenseSlideOver
          expense={panel === "new" ? null : panel}
          accounts={data.accounts}
          onClose={() => setPanel(null)}
          onSaved={() => {
            setPanel(null);
            router.refresh();
          }}
        />
      ) : null}

      {methodsOpen ? (
        <PaymentMethodsDialog accounts={data.accounts} onClose={() => setMethodsOpen(false)} />
      ) : null}
    </div>
  );
}

/* ── Filters ─────────────────────────────────────────────────────────── */

function DesktopFilters({
  filters,
  setFilters,
  vendors,
  accounts,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  vendors: string[];
  accounts: ExpensesData["accounts"];
}) {
  const selectCls =
    "h-9 rounded-md border border-line-strong bg-card px-2 text-[12.5px] font-medium text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/40";
  return (
    <>
      <input
        type="date"
        value={filters.dateFrom}
        onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
        className={selectCls}
        aria-label="Date from"
      />
      <span className="text-[12px] font-semibold text-fg-subtle">to</span>
      <input
        type="date"
        value={filters.dateTo}
        onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
        className={selectCls}
        aria-label="Date to"
      />
      <select
        value={filters.category}
        onChange={(e) => setFilters({ ...filters, category: e.target.value })}
        className={selectCls}
      >
        <option value="">All categories</option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select
        value={filters.vendor}
        onChange={(e) => setFilters({ ...filters, vendor: e.target.value })}
        className={selectCls}
      >
        <option value="">All vendors</option>
        {vendors.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
      <select
        value={filters.paymentMethod}
        onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value })}
        className={selectCls}
      >
        <option value="">All payment methods</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.name}>
            {a.name}
          </option>
        ))}
      </select>
      <select
        value={filters.status}
        onChange={(e) => setFilters({ ...filters, status: e.target.value as Status })}
        className={selectCls}
      >
        <option value="all">All statuses</option>
        <option value="active">Active</option>
        <option value="archived">Archived</option>
      </select>
      <label className="flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-card px-2.5 text-[12.5px] font-bold text-fg">
        <input
          type="checkbox"
          checked={filters.recurringOnly}
          onChange={(e) => setFilters({ ...filters, recurringOnly: e.target.checked })}
          className="h-3.5 w-3.5 accent-accent"
        />
        Recurring only
      </label>
    </>
  );
}

function MobileFilterSheet({
  filters,
  setFilters,
  vendors,
  accounts,
  onClose,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  vendors: string[];
  accounts: ExpensesData["accounts"];
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(filters);
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 sm:hidden" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-xl border-t border-line-strong bg-card p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[13px] font-bold uppercase tracking-[0.1em] text-fg">Filters</span>
          <button type="button" onClick={onClose} aria-label="Close">
            <IconX className="h-5 w-5 text-fg-muted" />
          </button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LABEL}>From</label>
              <input
                type="date"
                value={draft.dateFrom}
                onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })}
                className={field.input}
              />
            </div>
            <div>
              <label className={LABEL}>To</label>
              <input
                type="date"
                value={draft.dateTo}
                onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })}
                className={field.input}
              />
            </div>
          </div>
          <div>
            <label className={LABEL}>Category</label>
            <select
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              className={field.select}
            >
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Vendor</label>
            <select
              value={draft.vendor}
              onChange={(e) => setDraft({ ...draft, vendor: e.target.value })}
              className={field.select}
            >
              <option value="">All vendors</option>
              {vendors.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Payment method</label>
            <select
              value={draft.paymentMethod}
              onChange={(e) => setDraft({ ...draft, paymentMethod: e.target.value })}
              className={field.select}
            >
              <option value="">All payment methods</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.name}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Status</label>
            <select
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value as Status })}
              className={field.select}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <label className="flex h-10 w-fit items-center gap-2 rounded-md border border-line-strong bg-card px-3 text-[13px] font-bold text-fg">
            <input
              type="checkbox"
              checked={draft.recurringOnly}
              onChange={(e) => setDraft({ ...draft, recurringOnly: e.target.checked })}
              className="h-4 w-4 accent-accent"
            />
            Recurring only
          </label>
        </div>
        <div className="mt-4 flex gap-2">
          <Button type="button" onClick={() => setDraft(EMPTY_FILTERS)} variant="cancel" fullWidth>
            Reset
          </Button>
          <Button
            type="button"
            onClick={() => {
              setFilters(draft);
              onClose();
            }}
            variant="primary"
            fullWidth
          >
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Bulk action bar ─────────────────────────────────────────────────── */

function BulkBar({
  count,
  busy,
  onClear,
  onArchive,
  onDelete,
  onCategory,
  onExport,
}: {
  count: number;
  busy: boolean;
  onClear: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onCategory: (category: string) => void;
  onExport: () => void;
}) {
  const [category, setCategory] = useState("");
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border-2 border-accent bg-accent/10 px-3 py-2">
      <span className="text-[12.5px] font-bold text-fg">{count} selected</span>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            if (e.target.value) {
              onCategory(e.target.value);
              setCategory("");
            }
          }}
          disabled={busy}
          className="h-8 rounded-md border border-line-strong bg-card px-2 text-[12px] font-semibold text-fg outline-none"
        >
          <option value="">Change category…</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <Button type="button" onClick={onExport} disabled={busy} variant="utility" size="sm">
          Export
        </Button>
        <Button type="button" onClick={onArchive} disabled={busy} variant="edit" size="sm">
          Archive
        </Button>
        <Button type="button" onClick={onDelete} disabled={busy} variant="destructive" size="sm">
          Delete
        </Button>
        <Button type="button" onClick={onClear} disabled={busy} variant="cancel" size="sm">
          Clear
        </Button>
      </div>
    </div>
  );
}

/* ── Desktop table ───────────────────────────────────────────────────── */

const TH_CLS = "px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-fg border-b-2 border-line-strong";

function SortHead({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: Dir;
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={TH_CLS + (align === "right" ? " text-right" : "")}
    >
      <button
        type="button"
        onClick={onClick}
        className={
          "inline-flex items-center gap-1 transition-colors hover:text-accent " +
          (align === "right" ? "flex-row-reverse" : "") +
          (active ? " text-accent" : "")
        }
      >
        {label}
        <span aria-hidden className={active ? "text-accent" : "text-transparent"}>
          {active && dir === "asc" ? "▲" : "▼"}
        </span>
      </button>
    </th>
  );
}

function DesktopTable({
  rows,
  sort,
  onSort,
  selected,
  allSelected,
  onToggleAll,
  onToggleRow,
  onOpen,
  onDuplicate,
  onSkip,
  onToggleArchive,
  onDelete,
}: {
  rows: ExpenseItem[];
  sort: { key: SortKey; dir: Dir };
  onSort: (key: SortKey) => void;
  selected: Set<string>;
  allSelected: boolean;
  onToggleAll: () => void;
  onToggleRow: (id: string) => void;
  onOpen: (e: ExpenseItem) => void;
  onDuplicate: (id: string) => void;
  onSkip: (id: string) => void;
  onToggleArchive: (e: ExpenseItem) => void;
  onDelete: (e: ExpenseItem) => void;
}) {
  return (
    <div className="hidden overflow-hidden rounded-md border border-line-strong bg-card shadow-e1 sm:block">
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full border-collapse text-[13px] text-fg">
          <thead className="sticky top-0 z-10 bg-elevated">
            <tr>
              <th className="w-9 border-b-2 border-line-strong px-3 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                  aria-label="Select all"
                  className="h-3.5 w-3.5 accent-accent"
                />
              </th>
              <SortHead label="Vendor" active={sort.key === "vendor"} dir={sort.dir} onClick={() => onSort("vendor")} />
              <SortHead label="Category" active={sort.key === "category"} dir={sort.dir} onClick={() => onSort("category")} />
              <th className={TH_CLS}>Description</th>
              <SortHead label="Amount" active={sort.key === "amount"} dir={sort.dir} onClick={() => onSort("amount")} align="right" />
              <th className={TH_CLS}>Payment method</th>
              <SortHead label="Frequency" active={sort.key === "frequency"} dir={sort.dir} onClick={() => onSort("frequency")} />
              <SortHead label="Next charge" active={sort.key === "nextCharge"} dir={sort.dir} onClick={() => onSort("nextCharge")} />
              <SortHead label="Status" active={sort.key === "status"} dir={sort.dir} onClick={() => onSort("status")} />
              <th className="w-10 border-b-2 border-line-strong px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => (
              <tr
                key={e.id}
                onClick={() => onOpen(e)}
                className={
                  "h-11 cursor-pointer border-b border-line transition-colors hover:bg-elevated " +
                  (i % 2 === 1 ? "bg-elevated/40" : "") +
                  (e.archived ? " opacity-70" : "")
                }
              >
                <td className="px-3 py-2" onClick={(ev) => ev.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(e.id)}
                    onChange={() => onToggleRow(e.id)}
                    aria-label={`Select ${e.vendor || e.name}`}
                    className="h-3.5 w-3.5 accent-accent"
                  />
                </td>
                <td className="max-w-[220px] truncate px-3 py-2 font-bold text-fg">
                  {e.vendor || e.name}
                </td>
                <td className="px-3 py-2 font-medium text-fg">{e.category ?? "—"}</td>
                <td className="max-w-[260px] truncate px-3 py-2 font-medium text-fg-muted">{e.notes ?? "—"}</td>
                <td className="px-3 py-2 text-right font-bold tabular-nums text-fg">{usdCents(e.amount)}</td>
                <td className="px-3 py-2 font-medium text-fg">{e.card ?? "—"}</td>
                <td className="px-3 py-2">
                  <StatusTag tone={FREQUENCY_TONE[e.frequency]} hideDot>
                    {FREQUENCY_LABEL[e.frequency]}
                  </StatusTag>
                </td>
                <td className="px-3 py-2 font-semibold text-fg">
                  {e.nextChargeLabel ?? "—"}
                  {e.skipNextDate ? (
                    <span className="ml-1 text-[10px] font-bold uppercase text-warn">skipped</span>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <StatusTag tone={e.archived ? "slate" : "green"} hideDot>
                    {e.archived ? "Archived" : "Active"}
                  </StatusTag>
                </td>
                <td className="px-2 py-2 text-right" onClick={(ev) => ev.stopPropagation()}>
                  <ExpenseRowMenu
                    archived={e.archived}
                    canSkip={!!e.nextChargeDateIso && !e.archived}
                    onEdit={() => onOpen(e)}
                    onDuplicate={() => onDuplicate(e.id)}
                    onSkip={() => onSkip(e.id)}
                    onToggleArchive={() => onToggleArchive(e)}
                    onDelete={() => onDelete(e)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Mobile cards ────────────────────────────────────────────────────── */

function MobileCards({
  rows,
  onOpen,
  onDuplicate,
  onSkip,
  onToggleArchive,
  onDelete,
}: {
  rows: ExpenseItem[];
  onOpen: (e: ExpenseItem) => void;
  onDuplicate: (id: string) => void;
  onSkip: (id: string) => void;
  onToggleArchive: (e: ExpenseItem) => void;
  onDelete: (e: ExpenseItem) => void;
}) {
  return (
    <div className="space-y-2.5 sm:hidden">
      {rows.map((e) => (
        <article
          key={e.id}
          onClick={() => onOpen(e)}
          className={
            "rounded-md border border-line-strong bg-card p-3.5 shadow-e1" + (e.archived ? " opacity-70" : "")
          }
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[14.5px] font-bold text-fg">{e.vendor || e.name}</div>
              <div className="mt-0.5 text-[12px] font-semibold text-fg-muted">{e.category ?? "No category"}</div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <div className="text-right">
                <div className="text-[16px] font-bold tabular-nums text-fg">{usdCents(e.amount)}</div>
              </div>
              <div onClick={(ev) => ev.stopPropagation()}>
                <ExpenseRowMenu
                  archived={e.archived}
                  canSkip={!!e.nextChargeDateIso && !e.archived}
                  onEdit={() => onOpen(e)}
                  onDuplicate={() => onDuplicate(e.id)}
                  onSkip={() => onSkip(e.id)}
                  onToggleArchive={() => onToggleArchive(e)}
                  onDelete={() => onDelete(e)}
                />
              </div>
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <StatusTag tone={FREQUENCY_TONE[e.frequency]} hideDot>
              {FREQUENCY_LABEL[e.frequency]}
            </StatusTag>
            <StatusTag tone={e.archived ? "slate" : "green"} hideDot>
              {e.archived ? "Archived" : "Active"}
            </StatusTag>
            {e.card ? <span className="text-[11.5px] font-semibold text-fg-muted">{e.card}</span> : null}
          </div>
          <div className="mt-1.5 text-[12px] font-semibold text-fg-muted">
            {e.nextChargeLabel ? `Next ${e.nextChargeLabel}` : chargeScheduleLabel(e)}
            {e.skipNextDate ? <span className="ml-1 font-bold uppercase text-warn">skipped</span> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────── */

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-md border border-dashed border-line-strong bg-card px-6 py-14 text-center shadow-e1">
      <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-elevated text-fg">
        <IconInbox className="h-5 w-5" />
      </span>
      <div className="mt-3.5 text-[15px] font-bold text-fg">No expenses yet</div>
      <p className="mx-auto mt-1.5 max-w-xs text-[13px] leading-relaxed text-fg-muted">
        Add the truck payment, insurance, subscriptions — whatever charges on
        a schedule — to start tracking them here.
      </p>
      <Button type="button" onClick={onAdd} variant="primary" size="md" className="mt-4">
        Add First Expense
      </Button>
    </div>
  );
}

/* ── CSV helpers ─────────────────────────────────────────────────────── */

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Minimal RFC4180-ish line splitter — handles quoted fields with embedded
 *  commas/escaped quotes. Embedded newlines inside a quoted field aren't
 *  supported (good enough for a vendor/description-level export/import). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseImportCsv(text: string): ImportExpenseRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (...names: string[]) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;

  const vendorIdx = idx("vendor", "name");
  const categoryIdx = idx("category");
  const descriptionIdx = idx("description", "notes");
  const amountIdx = idx("amount");
  const methodIdx = idx("payment method", "paymentmethod", "card");
  const frequencyIdx = idx("frequency");
  const startDateIdx = idx("start date", "startdate", "next charge");

  if (vendorIdx < 0 || amountIdx < 0) return [];

  const rows: ImportExpenseRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const vendor = (cells[vendorIdx] ?? "").trim();
    const amount = Number((cells[amountIdx] ?? "").replace(/[$,\s]/g, ""));
    if (!vendor || !Number.isFinite(amount)) continue;
    const frequencyRaw = (cells[frequencyIdx] ?? "monthly").trim().toLowerCase();
    rows.push({
      vendor,
      category: categoryIdx >= 0 ? (cells[categoryIdx] ?? "").trim() || null : null,
      description: descriptionIdx >= 0 ? (cells[descriptionIdx] ?? "").trim() || null : null,
      amount: Math.round(amount * 100) / 100,
      paymentMethod: methodIdx >= 0 ? (cells[methodIdx] ?? "").trim() || null : null,
      frequency: isFrequency(frequencyRaw) ? frequencyRaw : "monthly",
      startDate:
        startDateIdx >= 0 && /^\d{4}-\d{2}-\d{2}$/.test((cells[startDateIdx] ?? "").trim())
          ? (cells[startDateIdx] ?? "").trim()
          : null,
    });
  }
  return rows;
}

/* ── Money formatting ────────────────────────────────────────────────── */

function usd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function usdCents(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
