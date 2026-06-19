"use client";

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

export type ServiceHistoryEntry = {
  id: string;
  itemId: string | null;
  serviceName: string;
  date: string | null;
  odo: number | null;
  notes: string | null;
  category: string | null;
  paymentMethod: string | null;
  totalCost: number | null;
  attachments: ServiceAttachment[];
};

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

// Payment methods (kept in sync with the server's PAYMENT_METHODS allow-list).
const PAYMENT_METHODS = ["Cash", "Credit", "Debit", "Check", "Other"];

// "$1,250.00" — null/blank renders nothing.
function money(n: number | null | undefined): string {
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

const STATUS: Record<
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

function remaining(item: MaintItem): { value: string; label: string; color: string } {
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
}: {
  currentOdo: number;
  items: MaintItem[];
  history: ServiceHistoryEntry[];
  totalSpend: number;
}) {
  const [editItem, setEditItem] = useState<MaintItem | null>(null);
  // Unified add / log / edit service modal. presetItemId = opened from an
  // item's "Log" button (locked to that service type); editEntry = opened from
  // a history entry (prefilled for editing).
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
                      <p className="mt-1 text-[12px] text-fg-muted">
                        Every {item.interval.toLocaleString()} mi
                      </p>
                      <p className="text-[11.5px] text-fg-subtle">
                        {item.neverServiced
                          ? "Never serviced"
                          : `Last ${item.lastOdo!.toLocaleString()} mi${item.lastDate ? " · " + item.lastDate : ""}`}
                      </p>
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

                  <div className="mt-2.5 flex items-center justify-end gap-2 border-t border-line pt-2.5">
                    <button
                      type="button"
                      onClick={() => setEditItem(item)}
                      className="rounded-md border border-line-strong bg-card px-2.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setServiceModal({ presetItemId: item.id })}
                      className="rounded-md border border-red-700 bg-red-600 px-2.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-red-700"
                    >
                      Log service
                    </button>
                  </div>
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

      {editItem ? (
        <EditIntervalModal item={editItem} onClose={() => setEditItem(null)} />
      ) : null}
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
              title="Tap to edit · add receipts / payment"
              className="cursor-pointer rounded-xl border border-line bg-card p-3.5 shadow-sm transition-colors hover:border-line-strong hover:bg-elevated focus:outline-none focus-visible:border-fg focus-visible:ring-2 focus-visible:ring-fg/20"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-[14px] font-semibold text-fg">
                      {h.serviceName}
                    </h3>
                    {h.category ? (
                      <span className="shrink-0 rounded-sm bg-indigo-100 px-1.5 py-[1px] font-mono text-[9.5px] font-bold uppercase tracking-[0.06em] text-indigo-700">
                        {h.category}
                      </span>
                    ) : null}
                    {h.paymentMethod ? (
                      <span className="shrink-0 rounded-sm bg-elevated px-1.5 py-[1px] font-mono text-[9.5px] font-bold uppercase tracking-[0.06em] text-fg-muted">
                        {h.paymentMethod}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] text-fg-subtle">
                    {h.date ?? "—"}
                    {h.odo != null ? ` · ${h.odo.toLocaleString()} mi` : ""}
                    <span className="ml-1.5 text-indigo-600">· tap to edit</span>
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
                  {h.attachments.length > 0 ? (
                    <div className="mt-1 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-fg-subtle">
                      {h.attachments.length} receipt
                      {h.attachments.length === 1 ? "" : "s"}
                    </div>
                  ) : null}
                </div>
              </div>
              {h.notes ? (
                <p className="mt-1.5 whitespace-pre-wrap text-[12px] text-fg-muted">
                  {h.notes}
                </p>
              ) : null}
              {h.attachments.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-3">
                  {h.attachments.map((a) => (
                    <div key={a.id} className="w-16">
                      {a.url ? (
                        a.isImage ? (
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={a.name}
                            onClick={(e) => e.stopPropagation()}
                            className="block h-16 w-16 overflow-hidden rounded-md border border-line"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={a.thumbUrl ?? a.url}
                              alt={a.name}
                              width={64}
                              height={64}
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
                            className="flex h-16 w-16 items-center justify-center rounded-md border border-line bg-elevated font-mono text-[11px] font-bold text-red-700"
                          >
                            PDF
                          </a>
                        )
                      ) : (
                        <span className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-line text-center font-mono text-[9px] text-fg-subtle">
                          no link
                        </span>
                      )}
                      {a.label || a.amount != null ? (
                        <div className="mt-1 leading-tight">
                          {a.label ? (
                            <div className="truncate font-mono text-[9.5px] font-bold uppercase tracking-[0.04em] text-fg-muted">
                              {a.label}
                            </div>
                          ) : null}
                          {a.amount != null ? (
                            <div className="font-mono text-[10px] font-bold tabular-nums text-emerald-700">
                              {money(a.amount)}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

type ReceiptRow = {
  id: string;
  file: File;
  amount: string;
  label: string;
};

function ServiceModal({
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
  const defaultPayment =
    editEntry?.paymentMethod &&
    PAYMENT_METHODS.includes(editEntry.paymentMethod)
      ? editEntry.paymentMethod
      : "";

  // New receipts to upload this session.
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  // Existing attachments (edit mode), with removal tracking.
  const [existing, setExisting] = useState<ServiceAttachment[]>(
    editEntry?.attachments ?? [],
  );
  const [removedIds, setRemovedIds] = useState<string[]>([]);

  // Total cost — prefilled from the entry in edit mode; otherwise auto-sums the
  // new receipt amounts until the user edits it.
  const [total, setTotal] = useState(
    editEntry?.totalCost != null ? String(editEntry.totalCost) : "",
  );
  const [totalDirty, setTotalDirty] = useState(
    isEdit && editEntry?.totalCost != null,
  );

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

  const sum = rows.reduce((s, r) => s + parseMoney(r.amount), 0);
  const totalValue = totalDirty ? total : sum > 0 ? sum.toFixed(2) : "";

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length > 0) {
      setRows((prev) => [
        ...prev,
        ...picked.map((file) => ({
          id: crypto.randomUUID(),
          file,
          amount: "",
          label: "",
        })),
      ]);
    }
    e.target.value = ""; // allow re-selecting the same file
  }

  function patchRow(id: string, patch: Partial<ReceiptRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function removeExisting(id: string) {
    setExisting((prev) => prev.filter((a) => a.id !== id));
    setRemovedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  // Receipts upload DIRECTLY to storage (bypassing the body limit) before the
  // action runs; only their metadata (path/name/type/size + amount/label) is
  // sent to the action as JSON.
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || uploading) return;
    const form = e.currentTarget;
    setUploading(true);
    setUploadErr(null);
    try {
      const metas: {
        storagePath: string;
        name: string;
        type: string;
        size: number;
        amount: string;
        label: string;
      }[] = [];
      for (const r of rows) {
        const f = r.file;
        const urlRes = await createReceiptUploadUrl(f.name, f.type, f.size);
        if (!urlRes.ok) {
          setUploadErr(urlRes.reason);
          return;
        }
        const upRes = await uploadFileToSignedUrl(
          urlRes.bucket,
          urlRes.path,
          urlRes.token,
          f,
        );
        if (!upRes.ok) {
          setUploadErr(`Upload failed ("${f.name}"): ${upRes.reason}`);
          return;
        }
        metas.push({
          storagePath: urlRes.path,
          name: f.name,
          type: f.type,
          size: f.size,
          amount: r.amount,
          label: r.label,
        });
      }
      const fd = new FormData(form);
      fd.set("total_cost", totalValue);
      fd.set("receipts", JSON.stringify(metas));
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
          <div className="grid grid-cols-2 gap-3">
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
            <div>
              <label className={LABEL}>Payment method</label>
              <select
                name="payment_method"
                defaultValue={defaultPayment}
                className={FIELD}
              >
                <option value="">— none —</option>
                {PAYMENT_METHODS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Date</label>
              <input
                name="service_date"
                type="date"
                defaultValue={editEntry?.date ?? today}
                className={FIELD}
              />
            </div>
            <div>
              <label className={LABEL}>Odometer</label>
              <input
                name="service_odo"
                type="number"
                inputMode="numeric"
                defaultValue={editEntry?.odo ?? currentOdo}
                required
                autoComplete="off"
                className={FIELD}
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

          {/* Saved receipts (edit) — tap × to remove */}
          {existing.length > 0 ? (
            <div>
              <label className={LABEL}>Saved receipts</label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {existing.map((a) => (
                  <div key={a.id} className="relative w-16">
                    {a.url && a.isImage ? (
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="block h-16 w-16 overflow-hidden rounded-md border border-line"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={a.thumbUrl ?? a.url}
                          alt={a.name}
                          width={64}
                          height={64}
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
                        className="flex h-16 w-16 items-center justify-center rounded-md border border-line bg-elevated font-mono text-[11px] font-bold text-red-700"
                      >
                        PDF
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => removeExisting(a.id)}
                      aria-label={`Remove ${a.name}`}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-red-700 bg-red-600 text-[11px] font-bold leading-none text-white shadow-sm transition-colors hover:bg-red-700"
                    >
                      ×
                    </button>
                    {a.amount != null ? (
                      <div className="mt-1 font-mono text-[10px] font-bold tabular-nums text-emerald-700">
                        {money(a.amount)}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Receipts — each carries its own amount + label (e.g. Parts/Labor) */}
          <div>
            <label className={LABEL}>
              {isEdit ? "Add receipts" : "Receipts (optional)"}
            </label>
            {rows.length > 0 ? (
              <div className="mt-1.5 space-y-2">
                {rows.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-md border border-line bg-card p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-muted">
                        {r.file.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeRow(r.id)}
                        className="shrink-0 rounded-sm border border-line-strong px-1.5 py-[1px] font-mono text-[11px] font-bold text-fg-subtle transition-colors hover:bg-elevated hover:text-red-700"
                        aria-label={`Remove ${r.file.name}`}
                      >
                        ✕
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div className="relative">
                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[12px] text-fg-subtle">
                          $
                        </span>
                        <input
                          value={r.amount}
                          onChange={(e) =>
                            patchRow(r.id, { amount: e.target.value })
                          }
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="0.00"
                          aria-label="Amount"
                          className="w-full rounded-md border border-line-strong bg-card py-1.5 pl-5 pr-2 text-[13px] tabular-nums text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
                        />
                      </div>
                      <input
                        value={r.label}
                        onChange={(e) =>
                          patchRow(r.id, { label: e.target.value })
                        }
                        autoComplete="off"
                        placeholder="Parts / Labor"
                        aria-label="Label"
                        className="w-full rounded-md border border-line-strong bg-card px-2 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <label className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line-strong bg-card px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-fg-muted transition-colors hover:bg-elevated hover:text-fg">
              + Add receipt
              <input
                type="file"
                multiple
                accept="image/*,application/pdf,.heic"
                onChange={onPickFiles}
                className="hidden"
              />
            </label>
            <p className="mt-1 font-mono text-[10px] text-fg-subtle">
              Photos or PDF · up to 20 MB each · one amount + label per receipt.
            </p>
          </div>

          {/* Total cost — defaults to the receipt sum, editable */}
          <div>
            <label className={LABEL}>Total cost</label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-[13px] text-fg-subtle">
                $
              </span>
              <input
                value={totalValue}
                onChange={(e) => {
                  setTotalDirty(true);
                  setTotal(e.target.value);
                }}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                className="w-full rounded-md border border-line-strong bg-card py-1.5 pl-6 pr-2 text-[13px] font-semibold tabular-nums text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
              />
            </div>
            <p className="mt-1 font-mono text-[10px] text-fg-subtle">
              {sum > 0
                ? `Auto-summed from receipts: ${money(sum)}` +
                  (totalDirty ? " · overridden" : " · edit to override")
                : "No receipt amounts — enter a total for cash/no-receipt jobs."}
            </p>
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

function EditIntervalModal({
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
