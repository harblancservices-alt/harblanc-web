"use client";

import { useActionState, useEffect, useState } from "react";
import { logMaintenance, updateMaintenanceInterval } from "./actions";

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
  notes: string | null;
};

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
}: {
  currentOdo: number;
  items: MaintItem[];
}) {
  const [logItem, setLogItem] = useState<MaintItem | null>(null);
  const [editItem, setEditItem] = useState<MaintItem | null>(null);

  const counts = {
    overdue: items.filter((i) => i.status === "overdue").length,
    soon: items.filter((i) => i.status === "soon").length,
    baseline: items.filter((i) => i.status === "baseline").length,
    ok: items.filter((i) => i.status === "ok").length,
  };

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-3">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-indigo-600">
            Truck
          </p>
          <h1 className="mt-1 text-[22px] font-semibold leading-none tracking-tight text-fg">
            Maintenance
          </h1>
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
                      onClick={() => setLogItem(item)}
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
      </div>

      {logItem ? (
        <LogServiceModal
          item={logItem}
          currentOdo={currentOdo}
          onClose={() => setLogItem(null)}
        />
      ) : null}
      {editItem ? (
        <EditIntervalModal item={editItem} onClose={() => setEditItem(null)} />
      ) : null}
    </div>
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

function LogServiceModal({
  item,
  currentOdo,
  onClose,
}: {
  item: MaintItem;
  currentOdo: number;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<
    { ok: boolean; error: string | null },
    FormData
  >(
    async (_prev, fd) => {
      try {
        await logMaintenance(fd);
        return { ok: true, error: null };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Could not log service.",
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

  const today = new Date().toISOString().slice(0, 10);

  return (
    <ModalShell title={`Log service · ${item.name}`} pending={pending} onClose={onClose}>
      <form action={action} onClick={(e) => e.stopPropagation()}>
        <input type="hidden" name="item_id" value={item.id} />
        <div className="space-y-3 bg-elevated px-4 py-4">
          <div>
            <label className={LABEL}>Odometer when serviced</label>
            <input
              name="service_odo"
              type="number"
              inputMode="numeric"
              defaultValue={currentOdo}
              required
              autoComplete="off"
              className={FIELD}
            />
            <p className="mt-1 font-mono text-[10px] text-fg-subtle">
              Defaults to the current odometer ({currentOdo.toLocaleString()} mi).
            </p>
          </div>
          <div>
            <label className={LABEL}>Date</label>
            <input
              name="service_date"
              type="date"
              defaultValue={today}
              className={FIELD}
            />
          </div>
          <div>
            <label className={LABEL}>Notes (optional)</label>
            <textarea name="notes" rows={2} autoComplete="off" className={FIELD} />
          </div>
          {state.error ? (
            <p role="alert" className="text-[12px] font-semibold text-red-700">
              {state.error}
            </p>
          ) : null}
        </div>
        <ModalFooter pending={pending} onClose={onClose} label="Log service" />
      </form>
    </ModalShell>
  );
}

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
