"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { IntervalBar } from "../IntervalBar";
import { deleteMaintenanceItem } from "../actions";
import {
  EditIntervalModal,
  ExpenseLines,
  ServiceModal,
  STATUS,
  formatServiceDate,
  money,
  receiptCount,
  remaining,
  type MaintItem,
  type ServiceHistoryEntry,
} from "../MaintenanceView";

/**
 * Per-item maintenance detail / profile page (client view).
 *
 * This is Brent's primary place to MANAGE one maintenance item:
 *   - Header: status, interval, current odometer, miles since last service,
 *     miles remaining / next-due, progress bar.
 *   - Total spent on this item (sum of every logged service's total_cost).
 *   - The full service log for this item (newest first) — each entry shows
 *     date, odometer, cost, notes, expense line items, and its receipts as
 *     signed-URL thumbnails. Tap an entry to edit it (prices, date/odo/notes,
 *     add/remove receipts) via the shared ServiceModal +
 *     updateMaintenanceService.
 *   - Log service (locked to this item) → adds more services/receipts, and
 *     ALWAYS overrides the item's reading (last_service_odo/date) so next-due
 *     recomputes — that's the reset (no separate button needed).
 *   - Edit intervals & notes.
 *
 * Everything routes through the SAME ServiceModal + actions the main
 * /admin/maintenance page uses, including the direct-to-storage signed
 * upload path for receipts.
 */

export function MaintenanceItemDetail({
  item,
  allItems,
  currentOdo,
  log,
  totalSpent,
}: {
  item: MaintItem;
  /** All non-deleted items — feeds the ServiceModal's type dropdown. */
  allItems: MaintItem[];
  currentOdo: number;
  log: ServiceHistoryEntry[];
  totalSpent: number;
}) {
  const router = useRouter();
  const [serviceModal, setServiceModal] = useState<{
    presetItemId?: string;
    editEntry?: ServiceHistoryEntry;
  } | null>(null);
  const [editInterval, setEditInterval] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const s = STATUS[item.status];
  const rem = remaining(item);
  const milesSince =
    item.neverServiced || item.lastOdo == null
      ? null
      : Math.max(0, currentOdo - item.lastOdo);

  function onDeleteItem() {
    if (
      !confirm(
        `Delete "${item.name}"?\n\nThis removes it from the maintenance list. Services you've already logged for it stay in your service history. This can't be undone from the app.`,
      )
    ) {
      return;
    }
    setDeleteErr(null);
    startDelete(async () => {
      try {
        await deleteMaintenanceItem(item.id);
        router.push("/admin/maintenance");
      } catch (e) {
        setDeleteErr(e instanceof Error ? e.message : "Could not delete item.");
      }
    });
  }

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 lg:px-8">
        {/* Back */}
        <Button
          href="/admin/maintenance"
          prefetch={false}
          variant="navigate"
          size="sm"
        >
          ← All maintenance
        </Button>

        {/* Header card */}
        <div
          className={"mt-3 rounded-xl border bg-card p-4 shadow-md " + s.border}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
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
                <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-fg">
                  {item.name}
                </h1>
              </div>
              <p className="mt-1 text-[12.5px] text-fg-muted">
                Every {item.interval.toLocaleString()} mi
                {item.neverServiced
                  ? " · never serviced"
                  : ` · last ${item.lastOdo!.toLocaleString()} mi${item.lastDate ? " · " + item.lastDate : ""}`}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <div
                className={
                  "text-[24px] font-bold leading-none tabular-nums " + rem.color
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

          {/* Progress */}
          <div className="mt-3">
            <IntervalBar pct={item.pct} status={item.status} />
            <p className="mt-1 font-mono text-[9.5px] text-fg-subtle">
              {item.neverServiced
                ? "Awaiting first service — log one to set the baseline."
                : `${Math.round(item.pct)}% through ${item.interval.toLocaleString()} mi interval`}
            </p>
          </div>

          {/* Stat strip */}
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3">
            <Stat label="Current odo" value={`${currentOdo.toLocaleString()} mi`} />
            <Stat
              label="Since service"
              value={milesSince == null ? "—" : `${milesSince.toLocaleString()} mi`}
            />
            <Stat
              label="Next due"
              value={
                item.nextDue == null ? "—" : `${item.nextDue.toLocaleString()} mi`
              }
            />
          </div>
        </div>

        {/* Total spent — prominent */}
        <div className="mt-3 flex items-center justify-between rounded-xl border border-line bg-card p-4 shadow-sm">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-600">
              Total spent on this item
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-fg-subtle">
              {log.length} service{log.length === 1 ? "" : "s"} logged
            </p>
          </div>
          <p className="text-[28px] font-bold leading-none tabular-nums text-emerald-700">
            {totalSpent > 0 ? money(totalSpent) : "$0.00"}
          </p>
        </div>

        {/* Actions */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => setServiceModal({ presetItemId: item.id })}
            variant="primary"
          >
            + Log service
          </Button>
          <Button
            type="button"
            onClick={() => setEditInterval(true)}
            variant="edit"
          >
            Edit intervals &amp; notes
          </Button>
          <Button
            type="button"
            onClick={onDeleteItem}
            disabled={deleting}
            variant="destructive"
          >
            {deleting ? "Deleting…" : "Delete item"}
          </Button>
        </div>
        {deleteErr ? (
          <p role="alert" className="mt-2 text-[12px] font-semibold text-red-700">
            {deleteErr}
          </p>
        ) : null}
        {item.notes ? (
          <p className="mt-2 whitespace-pre-wrap rounded-md border border-line bg-elevated px-3 py-2 text-[12px] text-fg-muted">
            {item.notes}
          </p>
        ) : null}

        {/* Service log */}
        <section className="mt-6">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-600">
              Service log
            </span>
            <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
              · {log.length}
            </span>
          </div>

          {log.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-card px-4 py-10 text-center font-mono text-[12px] text-fg-subtle">
              No services logged for this item yet.
              <br />
              Tap “Log service” to record one (with cost + receipts).
            </div>
          ) : (
            <div className="space-y-2">
              {log.map((h) => (
                <LogEntryCard
                  key={h.id}
                  entry={h}
                  onEdit={() => setServiceModal({ editEntry: h })}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {editInterval ? (
        <EditIntervalModal item={item} onClose={() => setEditInterval(false)} />
      ) : null}
      {serviceModal ? (
        <ServiceModal
          items={allItems}
          currentOdo={currentOdo}
          presetItemId={serviceModal.presetItemId ?? null}
          editEntry={serviceModal.editEntry ?? null}
          onClose={() => setServiceModal(null)}
        />
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-fg-subtle">
        {label}
      </p>
      <p className="mt-0.5 text-[14px] font-semibold tabular-nums text-fg">
        {value}
      </p>
    </div>
  );
}

/**
 * One service-log entry on the item detail page. Tap-to-edit opens the shared
 * ServiceModal prefilled. Shows date, odometer, cost, notes, expense line
 * items, and receipts as signed-URL thumbnails (private bucket).
 */
function LogEntryCard({
  entry: h,
  onEdit,
}: {
  entry: ServiceHistoryEntry;
  onEdit: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onEdit();
        }
      }}
      title="Edit service"
      className="cursor-pointer rounded-xl border border-line bg-card p-3.5 shadow-sm transition-colors hover:border-line-strong hover:bg-elevated focus:outline-none focus-visible:border-fg focus-visible:ring-2 focus-visible:ring-fg/20"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-mono text-[13px] font-bold tabular-nums text-amber-700">
            {formatServiceDate(h.date) ?? "Undated"}
            {h.odo != null ? ` · ${h.odo.toLocaleString()} mi` : ""}
          </h3>
        </div>
        <div className="shrink-0 text-right">
          {h.totalCost != null ? (
            <div className="text-[17px] font-bold leading-none tabular-nums text-emerald-700">
              {money(h.totalCost)}
            </div>
          ) : (
            <div className="font-mono text-[11px] text-fg-subtle">no cost</div>
          )}
          {receiptCount(h) > 0 ? (
            <div className="mt-1 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-fg-subtle">
              {receiptCount(h)} receipt
              {receiptCount(h) === 1 ? "" : "s"}
            </div>
          ) : null}
        </div>
      </div>
      {h.notes ? (
        <p className="mt-1.5 whitespace-pre-wrap text-[12px] text-fg-muted">
          {h.notes}
        </p>
      ) : null}
      <ExpenseLines expenses={h.expenses} unlinked={h.unlinkedAttachments} />
    </div>
  );
}
