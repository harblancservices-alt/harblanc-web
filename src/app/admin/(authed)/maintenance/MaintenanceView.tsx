"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  addMaintenanceService,
  createReceiptUploadUrl,
  updateMaintenanceInterval,
  updateMaintenanceService,
} from "./actions";
import { uploadFileToSignedUrl } from "@/lib/storage/client-upload";
import { IntervalBar } from "./IntervalBar";

export type MaintItem = {
  id: string;
  name: string;
  interval: number;
  lastOdo: number | null;
  lastDate: string | null;
  neverServiced: boolean;
  nextDue: number | null;
  milesRemaining: number | null;
  status: "overdue" | "soon" | "ok" | "baseline";
  /** 0–100: miles since last service ÷ interval (0 if never serviced). */
  pct: number;
  notes: string | null;
};

/** Top-of-page summary band: cost/mile, lifetime spend, next-due item. */
export type MaintSummary = {
  /** Dollars of maintenance per mile driven; null when not yet computable. */
  costPerMile: number | null;
  /** Miles between earliest known odometer and now; null if unknown. */
  milesDriven: number | null;
  totalSpend: number;
  /** Most urgent serviced item (fewest miles remaining), or null. */
  nextDue: { name: string; milesRemaining: number } | null;
};

export type ServiceAttachment = {
  id: string;
  name: string;
  url: string | null;
  /** Small WebP thumbnail signed URL; falls back to `url` on the server. */
  thumbUrl: string | null;
  isImage: boolean;
  amount: number | null;
  label: string | null;
};

/** One expense line on a service: description + amount + its receipts. */
export type ServiceExpenseLine = {
  id: string;
  description: string | null;
  amount: number | null;
  attachments: ServiceAttachment[];
};

export type ServiceHistoryEntry = {
  id: string;
  itemId: string | null;
  serviceName: string;
  date: string | null;
  odo: number | null;
  notes: string | null;
  category: string | null;
  totalCost: number | null;
  /** Expense line items (description + amount), each with its own receipts. */
  expenses: ServiceExpenseLine[];
  /** Legacy receipts not tied to any expense line (pre-line-items data). */
  unlinkedAttachments: ServiceAttachment[];
};

/** Total receipt count across a service's expense lines + any unlinked ones. */
export function receiptCount(h: ServiceHistoryEntry): number {
  return (
    h.expenses.reduce((s, e) => s + e.attachments.length, 0) +
    h.unlinkedAttachments.length
  );
}

// Expense categories offered on the Add Service form (kept in sync with the
// server's EXPENSE_CATEGORIES allow-list).
const EXPENSE_CATEGORIES = [
  "Suspension",
  "Tires",
  "Engine",
  "Drivetrain/Transmission",
  "Brakes",
  "Fluids & Filters",
  "Electrical",
  "Other",
];
const DEFAULT_CATEGORY = "Fluids & Filters";

// "$1,250.00" — null/blank renders nothing.
export function money(n: number | null | undefined): string {
  if (n == null) return "";
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function parseMoney(raw: string): number {
  const n = Number(raw.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Format a stored service_date ("2026-06-20") as M/D/Y ("06/20/2026").
 * String-split (no Date parsing) so it can't drift across time zones.
 */
export function formatServiceDate(date: string | null): string | null {
  if (!date) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return date;
  return `${m[2]}/${m[3]}/${m[1]}`;
}

/**
 * Read-only display of a service's expense line items (description + amount).
 * `showReceipts` (default true) controls whether each line's receipts render as
 * signed-URL thumbnails — the per-item detail page keeps them (it's the
 * receipt-management surface); the global Service History hides them.
 */
export function ExpenseLines({
  expenses,
  unlinked,
  showReceipts = true,
}: {
  expenses: ServiceExpenseLine[];
  unlinked: ServiceAttachment[];
  showReceipts?: boolean;
}) {
  if (expenses.length === 0 && unlinked.length === 0) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {expenses.map((e) => (
        <div
          key={e.id}
          className="rounded-md border border-line bg-elevated px-2.5 py-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[12.5px] font-medium text-fg">
              {e.description || "Expense"}
            </span>
            {e.amount != null ? (
              <span className="shrink-0 font-mono text-[12.5px] font-bold tabular-nums text-emerald-700">
                {money(e.amount)}
              </span>
            ) : null}
          </div>
          {showReceipts && e.attachments.length > 0 ? (
            <ReceiptThumbs atts={e.attachments} />
          ) : null}
        </div>
      ))}
      {showReceipts && unlinked.length > 0 ? (
        <div className="rounded-md border border-line bg-elevated px-2.5 py-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-fg-subtle">
            Other receipts
          </span>
          <ReceiptThumbs atts={unlinked} />
        </div>
      ) : null}
    </div>
  );
}

/** Receipt thumbnail row (images open in a new tab; PDFs show a PDF box). */
function ReceiptThumbs({ atts }: { atts: ServiceAttachment[] }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-2">
      {atts.map((a) => (
        <div key={a.id} className="w-14">
          {a.url ? (
            a.isImage ? (
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                title={a.name}
                onClick={(e) => e.stopPropagation()}
                className="block h-14 w-14 overflow-hidden rounded-md border border-line"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.thumbUrl ?? a.url}
                  alt={a.name}
                  width={56}
                  height={56}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </a>
            ) : (
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                title={a.name}
                onClick={(e) => e.stopPropagation()}
                className="flex h-14 w-14 items-center justify-center rounded-md border border-line bg-card font-mono text-[11px] font-bold text-red-700"
              >
                PDF
              </a>
            )
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-line text-center font-mono text-[9px] text-fg-subtle">
              no link
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export const STATUS: Record<
  MaintItem["status"],
  { label: string; pill: string; border: string; value: string }
> = {
  overdue: {
    label: "Overdue",
    pill: "bg-red-100 text-red-700",
    border: "border-red-300",
    value: "text-red-700",
  },
  soon: {
    label: "Due soon",
    pill: "bg-amber-100 text-amber-700",
    border: "border-amber-300",
    value: "text-amber-700",
  },
  baseline: {
    label: "Set baseline",
    pill: "bg-blue-100 text-blue-700",
    border: "border-line",
    value: "text-blue-700",
  },
  ok: {
    label: "OK",
    pill: "bg-green-100 text-green-700",
    border: "border-line",
    value: "text-green-700",
  },
};

export function remaining(item: MaintItem): { value: string; label: string; color: string } {
  if (item.milesRemaining == null) {
    return { value: "—", label: "no history", color: "text-blue-700" };
  }
  const r = item.milesRemaining;
  if (r <= 0) {
    return {
      value: `${Math.abs(r).toLocaleString()} mi`,
      label: "overdue by",
      color: "text-red-700",
    };
  }
  return {
    value: `${r.toLocaleString()} mi`,
    label: "remaining",
    color: item.status === "soon" ? "text-amber-700" : "text-green-700",
  };
}

export function MaintenanceView({
  currentOdo,
  items,
  history,
  totalSpend,
  summary,
}: {
  currentOdo: number;
  items: MaintItem[];
  history: ServiceHistoryEntry[];
  totalSpend: number;
  summary: MaintSummary;
}) {
  // Unified add / log / edit service modal. presetItemId locks the type
  // (used when opened for a specific item); editEntry = opened from a history
  // entry (prefilled for editing). Per-item Edit / Log now live on the detail
  // page — the list is browse + tap-to-open only.
  const [serviceModal, setServiceModal] = useState<{
    presetItemId?: string;
    editEntry?: ServiceHistoryEntry;
  } | null>(null);

  const counts = {
    overdue: items.filter((i) => i.status === "overdue").length,
    soon: items.filter((i) => i.status === "soon").length,
    baseline: items.filter((i) => i.status === "baseline").length,
    ok: items.filter((i) => i.status === "ok").length,
  };

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-indigo-600">
              Truck
            </p>
            <h1 className="mt-1 text-[22px] font-semibold leading-none tracking-tight text-fg">
              Maintenance
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setServiceModal({})}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-700 bg-red-600 px-3.5 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-red-700"
          >
            + Add service
          </button>
        </header>

        {/* Summary band — turns the logged data into useful numbers. */}
        <SummaryBand summary={summary} />

        {/* Current odometer */}
        <div className="rounded-xl border border-line bg-card p-4 shadow-md">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-600">
            Current odometer
          </p>
          <p className="mt-1 text-[30px] font-bold leading-none tabular-nums text-fg">
            {currentOdo.toLocaleString()}{" "}
            <span className="text-[16px] font-semibold text-fg-muted">mi</span>
          </p>
          <p className="mt-1.5 text-[11px] text-fg-subtle">
            Highest reading across all loads · 2018 Ram 2500 · 6.7L Cummins
          </p>
        </div>

        {/* Status summary */}
        <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <SummaryChip
            n={counts.overdue}
            label="overdue"
            cls="bg-red-100 text-red-700"
          />
          <SummaryChip
            n={counts.soon}
            label="due soon"
            cls="bg-amber-100 text-amber-700"
          />
          {counts.baseline > 0 ? (
            <SummaryChip
              n={counts.baseline}
              label="need baseline"
              cls="bg-blue-100 text-blue-700"
            />
          ) : null}
          <SummaryChip n={counts.ok} label="ok" cls="bg-green-100 text-green-700" />
        </div>

        {/* Item cards */}
        {items.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-line bg-card px-4 py-10 text-center font-mono text-[12px] text-fg-subtle">
            No maintenance items yet.
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => {
              const s = STATUS[item.status];
              const rem = remaining(item);
              return (
                <div
                  key={item.id}
                  className={
                    "flex flex-col rounded-xl border bg-card p-3.5 shadow-sm " +
                    s.border
                  }
                >
                  {/* Card body navigates to the item's detail/profile page —
                      where Brent sees the full service log, prices, receipts,
                      and can log/reset. The footer buttons stay separate (not
                      nested in the link) so quick actions still work. */}
                  <Link
                    href={`/admin/maintenance/${item.id}`}
                    className="-m-1 block rounded-lg p-1 transition-colors hover:bg-elevated"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={
                              "shrink-0 rounded-sm px-1.5 py-[1px] font-mono text-[10px] font-bold uppercase tracking-[0.06em] " +
                              s.pill
                            }
                          >
                            {s.label}
                          </span>
                          <h3 className="truncate text-[15px] font-semibold text-fg">
                            {item.name}
                          </h3>
                        </div>
                        {item.neverServiced ? (
                          <p className="mt-1 text-[11.5px] text-fg-subtle">
                            Never serviced
                          </p>
                        ) : (
                          <p className="mt-1 font-mono text-[11.5px] font-semibold tabular-nums text-amber-700">
                            Last {item.lastOdo!.toLocaleString()} mi
                            {item.lastDate
                              ? " · " + (formatServiceDate(item.lastDate) ?? item.lastDate)
                              : ""}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <div
                          className={
                            "text-[17px] font-bold leading-none tabular-nums " +
                            rem.color
                          }
                        >
                          {rem.value}
                        </div>
                        <div className="mt-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-fg-subtle">
                          {rem.label}
                        </div>
                        {item.nextDue != null ? (
                          <div className="mt-1 font-mono text-[10px] text-fg-subtle">
                            Due {item.nextDue.toLocaleString()} mi
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-2.5">
                      <IntervalBar pct={item.pct} status={item.status} />
                      <p className="mt-1 font-mono text-[9.5px] text-fg-subtle">
                        {item.neverServiced
                          ? "Awaiting first service"
                          : `${Math.round(item.pct)}% through ${item.interval.toLocaleString()} mi interval`}
                      </p>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        )}

        <ServiceHistory
          history={history}
          totalSpend={totalSpend}
          onEditEntry={(h) => setServiceModal({ editEntry: h })}
        />
      </div>

      {serviceModal ? (
        <ServiceModal
          items={items}
          currentOdo={currentOdo}
          presetItemId={serviceModal.presetItemId ?? null}
          editEntry={serviceModal.editEntry ?? null}
          onClose={() => setServiceModal(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * Top-of-page stat band: maintenance cost/mile (headline), lifetime total
 * spent, and the single most-urgent item. 3 tiles across, readable on mobile.
 */
function SummaryBand({ summary }: { summary: MaintSummary }) {
  const { costPerMile, milesDriven, totalSpend, nextDue } = summary;

  const cpmValue = costPerMile != null ? `$${costPerMile.toFixed(2)}` : "—";
  const cpmNote =
    costPerMile != null && milesDriven != null
      ? `${milesDriven.toLocaleString()} mi driven`
      : "needs more data";

  let nextValue = "—";
  let nextNote = "no serviced items";
  let nextColor = "text-fg";
  if (nextDue) {
    if (nextDue.milesRemaining <= 0) {
      nextValue = `${Math.abs(nextDue.milesRemaining).toLocaleString()} mi`;
      nextNote = `${nextDue.name} · overdue`;
      nextColor = "text-red-700";
    } else {
      nextValue = `${nextDue.milesRemaining.toLocaleString()} mi`;
      nextNote = `${nextDue.name} · left`;
      nextColor =
        nextDue.milesRemaining <= 1000 ? "text-amber-700" : "text-green-700";
    }
  }

  return (
    <div className="mb-2 grid grid-cols-3 divide-x divide-line overflow-hidden rounded-xl border border-line bg-card shadow-md">
      <div className="min-w-0 px-3 py-3">
        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-indigo-600">
          Cost / mile
        </p>
        <p className="mt-1 leading-none">
          <span className="text-[22px] font-bold tabular-nums text-fg">
            {cpmValue}
          </span>
          {costPerMile != null ? (
            <span className="ml-0.5 text-[12px] font-semibold text-fg-muted">
              /mi
            </span>
          ) : null}
        </p>
        <p className="mt-1 truncate font-mono text-[9px] text-fg-subtle">
          {cpmNote}
        </p>
      </div>

      <div className="min-w-0 px-3 py-3">
        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-indigo-600">
          Total spent
        </p>
        <p className="mt-1 text-[19px] font-bold leading-none tabular-nums text-emerald-700">
          {totalSpend > 0 ? money(totalSpend) : "$0.00"}
        </p>
        <p className="mt-1 font-mono text-[9px] text-fg-subtle">lifetime</p>
      </div>

      <div className="min-w-0 px-3 py-3">
        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-indigo-600">
          Next due
        </p>
        <p
          className={
            "mt-1 text-[17px] font-bold leading-none tabular-nums " + nextColor
          }
        >
          {nextValue}
        </p>
        <p className="mt-1 truncate font-mono text-[9px] text-fg-subtle">
          {nextNote}
        </p>
      </div>
    </div>
  );
}

function ServiceHistory({
  history,
  totalSpend,
  onEditEntry,
}: {
  history: ServiceHistoryEntry[];
  totalSpend: number;
  onEditEntry: (h: ServiceHistoryEntry) => void;
}) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-600">
            Service history
          </span>
          <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
            · {history.length}
          </span>
        </div>
        {totalSpend > 0 ? (
          <div className="rounded-full bg-elevated px-3 py-[3px] font-mono text-[11px] font-bold text-fg">
            <span className="text-fg-subtle">Total spend </span>
            <span className="tabular-nums text-emerald-700">
              {money(totalSpend)}
            </span>
          </div>
        ) : null}
      </div>
      {history.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-card px-4 py-10 text-center font-mono text-[12px] text-fg-subtle">
          No services logged yet.
        </div>
      ) : (
        <div className="space-y-2">
          {history.map((h) => (
            <div
              key={h.id}
              role="button"
              tabIndex={0}
              onClick={() => onEditEntry(h)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onEditEntry(h);
                }
              }}
              title="Tap to edit · expenses / receipts"
              className="cursor-pointer rounded-xl border border-line bg-card p-3.5 shadow-sm transition-colors hover:border-line-strong hover:bg-elevated focus:outline-none focus-visible:border-fg focus-visible:ring-2 focus-visible:ring-fg/20"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-[14px] font-semibold text-fg">
                    {h.serviceName}
                  </h3>
                  <p className="mt-0.5 font-mono text-[11px] font-semibold tabular-nums text-amber-700">
                    {formatServiceDate(h.date) ?? "—"}
                    {h.odo != null ? ` · ${h.odo.toLocaleString()} mi` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {h.totalCost != null ? (
                    <div className="text-[17px] font-bold leading-none tabular-nums text-emerald-700">
                      {money(h.totalCost)}
                    </div>
                  ) : (
                    <div className="font-mono text-[11px] text-fg-subtle">
                      no cost
                    </div>
                  )}
                </div>
              </div>
              {/* Collapsed: name + date · mileage + total only. The full
                  expense line-item breakdown lives on the per-item detail page
                  (/admin/maintenance/[id]); tap an entry to edit it there. */}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Editable state for one expense line in the ServiceModal. */
type ExpenseLineState = {
  key: string;
  description: string;
  amount: string;
  /** Receipts already saved (edit mode) that belong to this line. */
  existing: ServiceAttachment[];
  /** New files picked this session, to upload on submit. */
  files: { id: string; file: File }[];
};

/**
 * Seed the modal's expense lines. Edit mode prefills the saved lines (with
 * their receipts); any legacy receipts not tied to a line are folded into one
 * extra line so they're preserved. Add mode starts with a single blank line.
 */
function initialLines(editEntry: ServiceHistoryEntry | null): ExpenseLineState[] {
  if (!editEntry) {
    return [
      { key: crypto.randomUUID(), description: "", amount: "", existing: [], files: [] },
    ];
  }
  const lines: ExpenseLineState[] = editEntry.expenses.map((e) => ({
    key: crypto.randomUUID(),
    description: e.description ?? "",
    amount: e.amount != null ? String(e.amount) : "",
    existing: e.attachments,
    files: [],
  }));
  if (editEntry.unlinkedAttachments.length > 0) {
    lines.push({
      key: crypto.randomUUID(),
      description: "",
      amount: "",
      existing: editEntry.unlinkedAttachments,
      files: [],
    });
  }
  if (lines.length === 0) {
    lines.push({
      key: crypto.randomUUID(),
      description: "",
      amount: "",
      existing: [],
      files: [],
    });
  }
  return lines;
}

export function ServiceModal({
  items,
  currentOdo,
  presetItemId,
  editEntry,
  onClose,
}: {
  items: MaintItem[];
  currentOdo: number;
  presetItemId: string | null;
  editEntry: ServiceHistoryEntry | null;
  onClose: () => void;
}) {
  const isEdit = !!editEntry;
  // Lock the type when logging from a specific item's "Log" button.
  const lockType = !!presetItemId && !isEdit;
  const presetItem = presetItemId
    ? items.find((i) => i.id === presetItemId) ?? null
    : null;

  // Initial service-type selection ("" = custom typed name).
  const initialItemId = editEntry
    ? editEntry.itemId && items.some((i) => i.id === editEntry.itemId)
      ? editEntry.itemId
      : ""
    : presetItemId ?? items[0]?.id ?? "";
  const [selectedItemId, setSelectedItemId] = useState(initialItemId);
  const custom = selectedItemId === "";

  const today = new Date().toISOString().slice(0, 10);
  const defaultCategory =
    editEntry?.category && EXPENSE_CATEGORIES.includes(editEntry.category)
      ? editEntry.category
      : DEFAULT_CATEGORY;

  // Expense lines — each = description + amount + optional receipts. In edit
  // mode, prefill from the saved lines (and fold any legacy receipts not tied
  // to a line into one extra line so they're preserved).
  const [lines, setLines] = useState<ExpenseLineState[]>(() =>
    initialLines(editEntry),
  );
  // Existing attachments the user removed (deleted on save).
  const [removedIds, setRemovedIds] = useState<string[]>([]);

  // Date + odometer as controlled inputs. Date defaults to today (new) or the
  // entry's date (edit). Odometer is comma-formatted (e.g. 293,560) to match
  // the app's number formatting; the action strips commas back to an integer.
  const [serviceDate, setServiceDate] = useState(editEntry?.date ?? today);
  const [odo, setOdo] = useState(() => {
    const seed = editEntry?.odo ?? currentOdo;
    return seed != null ? seed.toLocaleString("en-US") : "";
  });
  function onOdoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/[^\d]/g, "");
    setOdo(digits ? Number(digits).toLocaleString("en-US") : "");
  }

  // Direct-upload phase runs before the metadata action; its own busy + error.
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const [state, action, pending] = useActionState<
    { ok: boolean; error: string | null },
    FormData
  >(
    async (_prev, fd) => {
      try {
        if (editEntry) await updateMaintenanceService(editEntry.id, fd);
        else await addMaintenanceService(fd);
        return { ok: true, error: null };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Could not save service.",
        };
      }
    },
    { ok: false, error: null },
  );

  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending && !uploading) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending, uploading, onClose]);

  const total = lines.reduce((s, l) => s + parseMoney(l.amount), 0);

  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        description: "",
        amount: "",
        existing: [],
        files: [],
      },
    ]);
  }
  function patchLine(key: string, patch: Partial<ExpenseLineState>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function removeLine(key: string) {
    setLines((prev) => {
      const line = prev.find((l) => l.key === key);
      if (line && line.existing.length > 0) {
        const ids = line.existing.map((a) => a.id);
        setRemovedIds((r) => [...r, ...ids.filter((id) => !r.includes(id))]);
      }
      return prev.filter((l) => l.key !== key);
    });
  }
  function addFilesToLine(key: string, fileList: FileList | null) {
    const picked = Array.from(fileList ?? []);
    if (picked.length === 0) return;
    setLines((prev) =>
      prev.map((l) =>
        l.key === key
          ? {
              ...l,
              files: [
                ...l.files,
                ...picked.map((file) => ({ id: crypto.randomUUID(), file })),
              ],
            }
          : l,
      ),
    );
  }
  function removeFile(key: string, fileId: string) {
    setLines((prev) =>
      prev.map((l) =>
        l.key === key
          ? { ...l, files: l.files.filter((f) => f.id !== fileId) }
          : l,
      ),
    );
  }
  function removeExistingFromLine(key: string, attId: string) {
    setRemovedIds((r) => (r.includes(attId) ? r : [...r, attId]));
    setLines((prev) =>
      prev.map((l) =>
        l.key === key
          ? { ...l, existing: l.existing.filter((a) => a.id !== attId) }
          : l,
      ),
    );
  }

  // Each line's receipt files upload DIRECTLY to storage (bypassing the body
  // limit) before the action runs; only their metadata is sent, grouped under
  // the line so the server can set each attachment's expense_id.
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || uploading) return;
    const form = e.currentTarget;
    setUploading(true);
    setUploadErr(null);
    try {
      const payload: {
        description: string;
        amount: string;
        newReceipts: {
          storagePath: string;
          name: string;
          type: string;
          size: number;
        }[];
        existingReceiptIds: string[];
      }[] = [];
      for (const l of lines) {
        const metas: {
          storagePath: string;
          name: string;
          type: string;
          size: number;
        }[] = [];
        for (const f of l.files) {
          const file = f.file;
          const urlRes = await createReceiptUploadUrl(
            file.name,
            file.type,
            file.size,
          );
          if (!urlRes.ok) {
            setUploadErr(urlRes.reason);
            return;
          }
          const upRes = await uploadFileToSignedUrl(
            urlRes.bucket,
            urlRes.path,
            urlRes.token,
            file,
          );
          if (!upRes.ok) {
            setUploadErr(`Upload failed ("${file.name}"): ${upRes.reason}`);
            return;
          }
          metas.push({
            storagePath: urlRes.path,
            name: file.name,
            type: file.type,
            size: file.size,
          });
        }
        const desc = l.description.trim();
        const amt = l.amount.trim();
        // Drop fully-empty lines.
        if (!desc && !amt && metas.length === 0 && l.existing.length === 0) {
          continue;
        }
        payload.push({
          description: desc,
          amount: amt,
          newReceipts: metas,
          existingReceiptIds: l.existing.map((a) => a.id),
        });
      }
      const fd = new FormData(form);
      fd.set("expenses", JSON.stringify(payload));
      if (isEdit) fd.set("remove_attachment_ids", JSON.stringify(removedIds));
      action(fd);
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const busy = pending || uploading;
  const errorMsg = uploadErr ?? state.error;
  const title = isEdit
    ? "Edit service"
    : lockType
      ? `Log service · ${presetItem?.name ?? "item"}`
      : "Add service";

  return (
    <ModalShell title={title} pending={busy} onClose={onClose}>
      <form onSubmit={onSubmit} onClick={(e) => e.stopPropagation()}>
        <div className="space-y-3 bg-elevated px-4 py-4">
          <div>
            <label className={LABEL}>Service type</label>
            <select
              name={lockType ? undefined : "item_id"}
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              disabled={lockType}
              className={FIELD + (lockType ? " opacity-70" : "")}
            >
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                </option>
              ))}
              <option value="">+ Custom service…</option>
            </select>
            {lockType ? (
              <input type="hidden" name="item_id" value={selectedItemId} />
            ) : null}
          </div>
          {custom ? (
            <div>
              <label className={LABEL}>Custom service name</label>
              <input
                name="service_name"
                required
                defaultValue={
                  editEntry && !editEntry.itemId ? editEntry.serviceName : ""
                }
                autoComplete="off"
                placeholder="e.g. Front shocks"
                className={FIELD}
              />
            </div>
          ) : null}
          <div>
            <label className={LABEL}>Expense category</label>
            <select
              name="category"
              defaultValue={defaultCategory}
              className={FIELD}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Date</label>
              <input
                name="service_date"
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
                required
                className={FIELD}
              />
            </div>
            <div>
              <label className={LABEL}>Odometer</label>
              <input
                name="service_odo"
                type="text"
                inputMode="numeric"
                value={odo}
                onChange={onOdoChange}
                required
                autoComplete="off"
                placeholder="0"
                className={FIELD + " tabular-nums"}
              />
            </div>
          </div>
          <div>
            <label className={LABEL}>Notes (optional)</label>
            <textarea
              name="notes"
              rows={2}
              defaultValue={editEntry?.notes ?? ""}
              autoComplete="off"
              className={FIELD}
            />
          </div>

          {/* Expense line items — each a description + amount + optional
              receipts. Brent's case: "Sensor $X" (with its receipt) AND
              "Filters $Y" (with its receipt) as two lines on one service. */}
          <div>
            <div className="flex items-center justify-between">
              <label className={LABEL}>Expenses</label>
              <button
                type="button"
                onClick={addLine}
                className="rounded-md border border-line-strong bg-card px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-fg-muted transition-colors hover:text-fg"
              >
                + Add expense
              </button>
            </div>
            {lines.length === 0 ? (
              <p className="mt-1.5 font-mono text-[11px] text-fg-subtle">
                No expenses yet — add a line (e.g. Sensor, Filters, Oil).
              </p>
            ) : null}
            <div className="mt-1.5 space-y-2">
              {lines.map((l) => (
                <div
                  key={l.key}
                  className="rounded-md border border-line bg-card p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <input
                      value={l.description}
                      onChange={(e) =>
                        patchLine(l.key, { description: e.target.value })
                      }
                      autoComplete="off"
                      placeholder="Description (e.g. Sensor, Filters, Oil)"
                      aria-label="Expense description"
                      className="min-w-0 flex-1 rounded-md border border-line-strong bg-card px-2 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
                    />
                    <div className="relative w-24 shrink-0">
                      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[12px] text-fg-subtle">
                        $
                      </span>
                      <input
                        value={l.amount}
                        onChange={(e) =>
                          patchLine(l.key, { amount: e.target.value })
                        }
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0.00"
                        aria-label="Amount"
                        className="w-full rounded-md border border-line-strong bg-card py-1.5 pl-5 pr-2 text-[13px] tabular-nums text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(l.key)}
                      aria-label="Remove expense line"
                      className="shrink-0 rounded-sm border border-line-strong px-1.5 py-[3px] font-mono text-[12px] font-bold text-fg-subtle transition-colors hover:bg-elevated hover:text-red-700"
                    >
                      ✕
                    </button>
                  </div>

                  {/* This line's receipts: saved (edit) + newly picked. */}
                  {l.existing.length > 0 || l.files.length > 0 ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {l.existing.map((a) => (
                        <div key={a.id} className="relative w-12">
                          {a.url && a.isImage ? (
                            <a
                              href={a.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="block h-12 w-12 overflow-hidden rounded-md border border-line"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={a.thumbUrl ?? a.url}
                                alt={a.name}
                                width={48}
                                height={48}
                                loading="lazy"
                                decoding="async"
                                className="h-full w-full object-cover"
                              />
                            </a>
                          ) : (
                            <a
                              href={a.url ?? "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="flex h-12 w-12 items-center justify-center rounded-md border border-line bg-elevated font-mono text-[10px] font-bold text-red-700"
                            >
                              PDF
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => removeExistingFromLine(l.key, a.id)}
                            aria-label={`Remove ${a.name}`}
                            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-red-700 bg-red-600 text-[11px] font-bold leading-none text-white shadow-sm transition-colors hover:bg-red-700"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {l.files.map((f) => (
                        <span
                          key={f.id}
                          className="inline-flex max-w-[10rem] items-center gap-1.5 rounded-md border border-line-strong bg-elevated px-2 py-1"
                        >
                          <span className="truncate font-mono text-[10.5px] text-fg-muted">
                            {f.file.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeFile(l.key, f.id)}
                            aria-label={`Remove ${f.file.name}`}
                            className="shrink-0 font-mono text-[11px] font-bold text-fg-subtle hover:text-red-700"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line-strong bg-elevated px-2.5 py-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-fg-muted transition-colors hover:text-fg">
                    + Receipt
                    <input
                      type="file"
                      multiple
                      accept="image/*,application/pdf,.heic"
                      onChange={(e) => {
                        addFilesToLine(l.key, e.target.files);
                        e.target.value = "";
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              ))}
            </div>
            <p className="mt-1 font-mono text-[10px] text-fg-subtle">
              One line per transaction (e.g. Sensor + Filters). Attach a receipt
              photo/PDF to a line, or leave it amount-only. Up to 20 MB each.
            </p>
          </div>

          {/* Total — auto-summed from the line amounts (read-only). */}
          <div className="flex items-center justify-between rounded-md border border-line-strong bg-card px-3 py-2">
            <span className={LABEL}>Total</span>
            <span className="font-mono text-[16px] font-bold tabular-nums text-emerald-700">
              {total > 0 ? money(total) : "$0.00"}
            </span>
          </div>

          {errorMsg ? (
            <p role="alert" className="text-[12px] font-semibold text-red-700">
              {errorMsg}
            </p>
          ) : null}
        </div>
        <ModalFooter
          pending={busy}
          onClose={onClose}
          label={isEdit ? "Save changes" : "Add service"}
        />
      </form>
    </ModalShell>
  );
}

function SummaryChip({ n, label, cls }: { n: number; label: string; cls: string }) {
  return (
    <span
      className={
        "inline-flex items-baseline gap-1 rounded-full px-2 py-[2px] font-bold tabular-nums " +
        (n > 0 ? cls : "bg-elevated text-fg-subtle")
      }
    >
      {n}
      <span className="font-medium uppercase tracking-[0.06em]">{label}</span>
    </span>
  );
}

const FIELD =
  "mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none";
const LABEL =
  "block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg";

export function EditIntervalModal({
  item,
  onClose,
}: {
  item: MaintItem;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<
    { ok: boolean; error: string | null },
    FormData
  >(
    async (_prev, fd) => {
      try {
        await updateMaintenanceInterval(fd);
        return { ok: true, error: null };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Could not update interval.",
        };
      }
    },
    { ok: false, error: null },
  );

  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending, onClose]);

  return (
    <ModalShell title={`Edit · ${item.name}`} pending={pending} onClose={onClose}>
      <form action={action} onClick={(e) => e.stopPropagation()}>
        <input type="hidden" name="item_id" value={item.id} />
        <div className="space-y-3 bg-elevated px-4 py-4">
          <div>
            <label className={LABEL}>Interval (miles)</label>
            <input
              name="interval_miles"
              type="number"
              inputMode="numeric"
              defaultValue={item.interval}
              required
              autoComplete="off"
              className={FIELD}
            />
          </div>
          <div>
            <label className={LABEL}>Notes (optional)</label>
            <textarea
              name="notes"
              rows={2}
              defaultValue={item.notes ?? ""}
              autoComplete="off"
              className={FIELD}
            />
          </div>
          {state.error ? (
            <p role="alert" className="text-[12px] font-semibold text-red-700">
              {state.error}
            </p>
          ) : null}
        </div>
        <ModalFooter pending={pending} onClose={onClose} label="Save" />
      </form>
    </ModalShell>
  );
}

function ModalShell({
  title,
  pending,
  onClose,
  children,
}: {
  title: string;
  pending: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-6"
      onClick={() => {
        if (!pending) onClose();
      }}
    >
      <div
        className="my-4 w-full max-w-md overflow-hidden rounded-lg border border-line-strong bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 bg-bar px-4 py-2.5">
          <span className="truncate font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-bar-fg">
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-sm border border-white/25 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-bar-fg transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalFooter({
  pending,
  onClose,
  label,
}: {
  pending: boolean;
  onClose: () => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-line bg-elevated px-4 py-3">
      <button
        type="button"
        onClick={onClose}
        disabled={pending}
        className="rounded-md border border-line-strong bg-card px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-fg transition-colors hover:bg-elevated disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="inline-flex items-center gap-1.5 rounded-md border border-red-700 bg-red-600 px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? (
          <>
            <span
              aria-hidden
              className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white"
            />
            Saving…
          </>
        ) : (
          label
        )}
      </button>
    </div>
  );
}
