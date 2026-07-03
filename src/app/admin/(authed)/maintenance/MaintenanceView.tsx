"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import {
  addMaintenanceService,
  createReceiptUploadUrl,
  deleteMaintenanceService,
  updateMaintenanceInterval,
  updateMaintenanceService,
} from "./actions";
import { uploadFileToSignedUrl } from "@/lib/storage/client-upload";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusTag, type StatusTone } from "@/components/ui/StatusTag";
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

/** Top-of-page summary band: lifetime spend + next-due item. */
export type MaintSummary = {
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
              <span className="shrink-0 font-mono text-[12.5px] font-bold tabular-nums text-ok">
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

/**
 * Receipt list — one compact row per receipt: a type chip (IMG/PDF), the file
 * name, and a blue "View" button that opens the file in a new tab. No image
 * preview is rendered (Brent only wants a View button).
 */
function ReceiptThumbs({ atts }: { atts: ServiceAttachment[] }) {
  return (
    <div className="mt-1.5 space-y-1">
      {atts.map((a) => (
        <div
          key={a.id}
          className="flex items-center gap-2 rounded-md border border-line bg-card px-2 py-1"
        >
          <span className="shrink-0 rounded-sm bg-elevated px-1.5 py-[1px] font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-fg-muted">
            {a.isImage ? "IMG" : "PDF"}
          </span>
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-fg">
            {a.name}
          </span>
          {a.url ? (
            <Button
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              variant="navigate"
              size="sm"
              className="shrink-0"
            >
              View
            </Button>
          ) : (
            <span className="shrink-0 font-mono text-[9px] text-fg-subtle">
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
    pill: "bg-bad-bg text-bad",
    border: "border-bad/40",
    value: "text-bad",
  },
  soon: {
    label: "Due soon",
    pill: "bg-warn-bg text-warn",
    border: "border-warn/40",
    value: "text-warn",
  },
  baseline: {
    label: "Set baseline",
    pill: "bg-steel-bg text-steel",
    border: "border-line",
    value: "text-steel",
  },
  ok: {
    label: "OK",
    pill: "bg-ok-bg text-ok",
    border: "border-line",
    value: "text-ok",
  },
};

/** Status → V2 StatusTag tone (red/amber/green/steel). */
const STATUS_TONE: Record<MaintItem["status"], StatusTone> = {
  overdue: "red",
  soon: "amber",
  ok: "green",
  baseline: "steel",
};

export function remaining(item: MaintItem): { value: string; label: string; color: string } {
  if (item.milesRemaining == null) {
    return { value: "—", label: "no history", color: "text-steel" };
  }
  const r = item.milesRemaining;
  if (r <= 0) {
    return {
      value: `${Math.abs(r).toLocaleString()} mi`,
      label: "overdue by",
      color: "text-bad",
    };
  }
  return {
    value: `${r.toLocaleString()} mi`,
    label: "remaining",
    color: item.status === "soon" ? "text-warn" : "text-ok",
  };
}

export function MaintenanceView({
  currentOdo,
  items,
  history,
  totalSpend,
}: {
  currentOdo: number;
  items: MaintItem[];
  history: ServiceHistoryEntry[];
  totalSpend: number;
  /** Still passed by the page; the redesigned list no longer surfaces it. */
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

  // Two tiers: items that are overdue OR ≥75% through their interval get
  // promoted to big attention cards at the top; everything else is a compact
  // row. Each tier is sorted most-urgent first (fewest miles remaining;
  // never-serviced items have no milesRemaining → sort last).
  const byUrgency = (a: MaintItem, b: MaintItem) =>
    (a.milesRemaining ?? Number.POSITIVE_INFINITY) -
    (b.milesRemaining ?? Number.POSITIVE_INFINITY);
  const bigItems = items
    .filter((i) => i.status === "overdue" || i.pct >= 75)
    .sort(byUrgency);
  const compactItems = items
    .filter((i) => !(i.status === "overdue" || i.pct >= 75))
    .sort(byUrgency);

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Truck"
          title="Maintenance"
          className="mb-3"
          actions={
            <Button
              type="button"
              onClick={() => setServiceModal({})}
              variant="primary"
            >
              + Add service
            </Button>
          }
        />

        {/* Hero — current odometer (elevated). Reading is derived from the
            highest load odo; no manual update affordance exists today. */}
        <div className="rounded-md border border-line bg-card p-4 shadow-e2 sm:p-5">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">
            Current odometer
          </p>
          <p className="mt-1.5 font-mono text-[34px] font-bold leading-none tabular-nums text-fg sm:text-[40px]">
            {currentOdo.toLocaleString()}
            <span className="ml-1.5 text-[16px] font-semibold text-fg-muted">
              mi
            </span>
          </p>
          <p className="mt-2 text-[11.5px] text-fg-subtle">
            Highest reading across all loads · 2018 Ram 2500 · 6.7L Cummins
          </p>
        </div>

        {/* Status chips — one per tracked state (Need baseline kept). Display
            only, same as before. */}
        <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <SummaryChip
            n={counts.overdue}
            label="overdue"
            cls="bg-bad-bg text-bad"
          />
          <SummaryChip
            n={counts.soon}
            label="due soon"
            cls="bg-warn-bg text-warn"
          />
          <SummaryChip
            n={counts.baseline}
            label="need baseline"
            cls="bg-steel-bg text-steel"
          />
          <SummaryChip n={counts.ok} label="ok" cls="bg-ok-bg text-ok" />
        </div>

        {/* Lifetime spend — a quiet right-aligned line, not a card. */}
        <p className="mt-2 text-right text-[11px] text-fg-subtle">
          Lifetime maintenance{" "}
          <span className="font-mono font-bold tabular-nums text-ok">
            {totalSpend > 0 ? money(totalSpend) : "$0.00"}
          </span>
        </p>

        {/* Item list — clean rows, urgent (overdue / ≥75%) first, then on
            schedule. Every row taps through to the item detail page. */}
        {items.length === 0 ? (
          <div className="mt-3 rounded-md border border-dashed border-line-strong bg-card px-4 py-10 text-center font-mono text-[12px] text-ink-3 shadow-e1">
            No maintenance items yet.
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {bigItems.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
            {compactItems.length > 0 && bigItems.length > 0 ? (
              <p className="pt-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-fg-subtle">
                On schedule · {compactItems.length}
              </p>
            ) : null}
            {compactItems.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </div>
        )}

        <ServiceHistory history={history} totalSpend={totalSpend} />
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
 * One maintenance item as a clean row. Top line: status tag + name, with the
 * miles-remaining (or overdue amount) right-aligned in the status colour. A
 * muted "Last <odo> · <date>" line (or a "Set baseline" hint for never-serviced
 * items), then a slim interval progress bar. Overdue rows get a 3px red left
 * edge + stronger elevation. Taps through to the item detail page — unchanged.
 */
function ItemRow({ item }: { item: MaintItem }) {
  const s = STATUS[item.status];
  const rem = remaining(item);
  const overdue = item.status === "overdue";
  const baseline = item.neverServiced || item.lastOdo == null;
  const remNote =
    item.milesRemaining == null
      ? "no history"
      : item.milesRemaining <= 0
        ? "overdue"
        : "left";
  return (
    <Link
      href={`/admin/maintenance/${item.id}`}
      className={
        "block rounded-md border bg-card p-3 transition-colors hover:border-line-strong hover:bg-inset " +
        (overdue
          ? "border-line border-l-[3px] border-l-bad shadow-e2"
          : "border-line shadow-e1")
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <StatusTag tone={STATUS_TONE[item.status]} className="shrink-0">
            {s.label}
          </StatusTag>
          <h3 className="truncate text-[14px] font-semibold text-fg">
            {item.name}
          </h3>
        </div>
        <div className="shrink-0 whitespace-nowrap text-right">
          <span className={"text-[14px] font-bold tabular-nums " + rem.color}>
            {rem.value}
          </span>
          <span className="ml-1 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-fg-subtle">
            {remNote}
          </span>
        </div>
      </div>

      <p className="mt-1 font-mono text-[10.5px] tabular-nums text-fg-subtle">
        {baseline
          ? "Set baseline · never serviced"
          : `Last ${item.lastOdo!.toLocaleString()} mi${
              item.lastDate
                ? " · " + (formatServiceDate(item.lastDate) ?? item.lastDate)
                : ""
            }`}
      </p>

      <IntervalBar pct={item.pct} status={item.status} className="mt-2 h-1.5" />
    </Link>
  );
}

function ServiceHistory({
  history,
  totalSpend,
}: {
  history: ServiceHistoryEntry[];
  totalSpend: number;
}) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-ink-3">
            Service history
          </span>
          <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
            · {history.length}
          </span>
        </div>
        {totalSpend > 0 ? (
          <div className="rounded-full bg-elevated px-3 py-[3px] font-mono text-[11px] font-bold text-fg">
            <span className="text-fg-subtle">Total spend </span>
            <span className="tabular-nums text-ok">
              {money(totalSpend)}
            </span>
          </div>
        ) : null}
      </div>
      {history.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-strong bg-card px-4 py-10 text-center font-mono text-[12px] text-ink-3 shadow-e1">
          No services logged yet.
        </div>
      ) : (
        <div className="space-y-2">
          {history.map((h) => (
            <Link
              key={h.id}
              href={
                h.itemId
                  ? `/admin/maintenance/${h.itemId}`
                  : `/admin/maintenance/service/${h.id}`
              }
              prefetch={false}
              title="View service"
              className="block rounded-md border border-line bg-card p-3.5 shadow-e1 transition-colors hover:border-line-strong hover:bg-inset focus:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-[14px] font-semibold text-fg">
                    {h.serviceName}
                  </h3>
                  <p className="mt-0.5 font-mono text-[11px] font-semibold tabular-nums text-warn">
                    {formatServiceDate(h.date) ?? "—"}
                    {h.odo != null ? ` · ${h.odo.toLocaleString()} mi` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {h.totalCost != null ? (
                    <div className="text-[17px] font-bold leading-none tabular-nums text-ok">
                      {money(h.totalCost)}
                    </div>
                  ) : (
                    <div className="font-mono text-[11px] text-fg-subtle">
                      no cost
                    </div>
                  )}
                </div>
              </div>
              {/* Collapsed: name + date · mileage + total only. Opens a detail
                  view (item detail for tracked items; per-service page for
                  custom/one-off services) — never straight into edit. */}
            </Link>
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
  onDeleted,
}: {
  items: MaintItem[];
  currentOdo: number;
  presetItemId: string | null;
  editEntry: ServiceHistoryEntry | null;
  onClose: () => void;
  /** Called instead of onClose after a successful delete. Use it to navigate
   *  away when the modal lives on the deleted service's own page. */
  onDeleted?: () => void;
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

  // Delete (edit mode only) — its own transition + error.
  const [deleting, startDelete] = useTransition();
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  function onDelete() {
    if (!editEntry) return;
    if (
      !confirm(
        "Delete this service entry?\n\nThis removes the service and its expense lines + receipts. This can't be undone.",
      )
    ) {
      return;
    }
    setDeleteErr(null);
    startDelete(async () => {
      try {
        await deleteMaintenanceService(editEntry.id);
        (onDeleted ?? onClose)();
      } catch (e) {
        setDeleteErr(
          e instanceof Error ? e.message : "Could not delete service.",
        );
      }
    });
  }

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

  const busy = pending || uploading || deleting;
  const errorMsg = uploadErr ?? deleteErr ?? state.error;
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
          {/* Date + odometer stacked full-width. The native date control has
              an intrinsic min-width that clips inside a half-width grid column
              on iOS, so each gets its own full-width row (block + min-w-0). */}
          <div>
            <label className={LABEL}>Date</label>
            <input
              name="service_date"
              type="date"
              value={serviceDate}
              onChange={(e) => setServiceDate(e.target.value)}
              required
              className={FIELD + " block min-w-0"}
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
          <div>
            <label className={LABEL}>Notes (optional)</label>
            <textarea
              name="notes"
              rows={2}
              defaultValue={editEntry?.notes ?? ""}
              autoComplete="off"
              placeholder="Anything worth remembering about this service…"
              className={FIELD + " resize-none"}
            />
          </div>

          {/* Expense line items — each a description + amount + optional
              receipts. Brent's case: "Sensor $X" (with its receipt) AND
              "Filters $Y" (with its receipt) as two lines on one service. */}
          <div>
            <div className="flex items-center justify-between">
              <label className={LABEL}>Expenses</label>
              <Button
                type="button"
                onClick={addLine}
                variant="primary"
                size="sm"
              >
                + Add expense
              </Button>
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
                  {/* Description on its own full-width line so the placeholder
                      never truncates on mobile; amount + remove sit below. */}
                  <input
                    value={l.description}
                    onChange={(e) =>
                      patchLine(l.key, { description: e.target.value })
                    }
                    autoComplete="off"
                    placeholder="Description (e.g. Sensor)"
                    aria-label="Expense description"
                    className="block w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <div className="relative w-32 shrink-0">
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
                    <Button
                      type="button"
                      onClick={() => removeLine(l.key)}
                      aria-label="Remove expense line"
                      variant="destructive"
                      size="sm"
                      className="ml-auto shrink-0"
                    >
                      Remove
                    </Button>
                  </div>

                  {/* This line's receipts: saved (edit) + newly picked. */}
                  {l.existing.length > 0 || l.files.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {/* Saved receipts — name + View (no image preview) + Remove. */}
                      {l.existing.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center gap-2 rounded-md border border-line bg-elevated px-2 py-1"
                        >
                          <span className="shrink-0 rounded-sm bg-card px-1.5 py-[1px] font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-fg-muted">
                            {a.isImage ? "IMG" : "PDF"}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[11.5px] text-fg">
                            {a.name}
                          </span>
                          {a.url ? (
                            <Button
                              href={a.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              variant="navigate"
                              size="sm"
                              className="shrink-0"
                            >
                              View
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            onClick={() => removeExistingFromLine(l.key, a.id)}
                            aria-label={`Remove ${a.name}`}
                            variant="destructive"
                            size="sm"
                            className="shrink-0"
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                      {/* Newly-picked files (not yet uploaded) — name + Remove. */}
                      {l.files.map((f) => (
                        <div
                          key={f.id}
                          className="flex items-center gap-2 rounded-md border border-line-strong bg-elevated px-2 py-1"
                        >
                          <span className="shrink-0 rounded-sm bg-card px-1.5 py-[1px] font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-steel">
                            New
                          </span>
                          <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-fg-muted">
                            {f.file.name}
                          </span>
                          <Button
                            type="button"
                            onClick={() => removeFile(l.key, f.id)}
                            aria-label={`Remove ${f.file.name}`}
                            variant="destructive"
                            size="sm"
                            className="shrink-0"
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-steel/50 bg-steel-bg px-2.5 py-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-steel transition-colors hover:bg-steel-bg/70">
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
            <span className="font-mono text-[16px] font-bold tabular-nums text-ok">
              {total > 0 ? money(total) : "$0.00"}
            </span>
          </div>

          {errorMsg ? (
            <p role="alert" className="text-[12px] font-semibold text-bad">
              {errorMsg}
            </p>
          ) : null}
        </div>
        <ModalFooter
          pending={busy}
          onClose={onClose}
          label={isEdit ? "Save changes" : "Add service"}
          onDelete={isEdit ? onDelete : undefined}
          deleting={deleting}
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
  "mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/40";
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
            <p role="alert" className="text-[12px] font-semibold text-bad">
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
          <Button
            type="button"
            onClick={onClose}
            disabled={pending}
            variant="cancel"
            size="sm"
          >
            Cancel
          </Button>
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
  onDelete,
  deleting,
}: {
  pending: boolean;
  onClose: () => void;
  label: string;
  /** When provided (edit mode), renders a red Delete button on the left. */
  onDelete?: () => void;
  deleting?: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-line bg-elevated px-4 py-3">
      {onDelete ? (
        <Button
          type="button"
          onClick={onDelete}
          disabled={pending}
          variant="destructive"
          className="mr-auto"
        >
          {deleting ? "Deleting…" : "Delete"}
        </Button>
      ) : null}
      <Button
        type="button"
        onClick={onClose}
        disabled={pending}
        variant="cancel"
      >
        Cancel
      </Button>
      <Button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        variant="primary"
        leftIcon={
          pending ? (
            <span
              aria-hidden
              className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white"
            />
          ) : undefined
        }
      >
        {pending ? "Saving…" : label}
      </Button>
    </div>
  );
}
