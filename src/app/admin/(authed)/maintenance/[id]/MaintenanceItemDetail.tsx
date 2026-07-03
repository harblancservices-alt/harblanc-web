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
        {/* Top bar — back (left) + top-level controls (top-right): Edit
            intervals, then Delete. Delete lives here, not buried under the body
            actions, so it's a deliberate reach. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            href="/admin/maintenance"
            prefetch={false}
            variant="navigate"
            size="sm"
          >
            ← All maintenance
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => setEditInterval(true)}
              variant="edit"
              size="sm"
            >
              Edit intervals &amp; notes
            </Button>
            <Button
              type="button"
              onClick={onDeleteItem}
              disabled={deleting}
              variant="destructive"
              size="sm"
              leftIcon={
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
                className="h-3.5 w-3.5"
              >
                <path
                  fillRule="evenodd"
                  d="M8.75 1.75a.75.75 0 0 0-.75.75V3H4.5a.75.75 0 0 0 0 1.5h.53l.86 11.16A2 2 0 0 0 7.88 17.5h4.24a2 2 0 0 0 1.99-1.84L14.97 4.5h.53a.75.75 0 0 0 0-1.5H12v-.5a.75.75 0 0 0-.75-.75h-2.5zM8.5 7.25a.75.75 0 0 1 1.5 0v6a.75.75 0 0 1-1.5 0v-6zm3 0a.75.75 0 0 1 1.5 0v6a.75.75 0 0 1-1.5 0v-6z"
                  clipRule="evenodd"
                />
              </svg>
            }
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </div>
        {deleteErr ? (
          <p role="alert" className="mt-2 text-[12px] font-semibold text-bad">
            {deleteErr}
          </p>
        ) : null}

        {/* Header card */}
        <div
          className={
            "mt-3 rounded-md border bg-card p-4 shadow-e2 " +
            (item.status === "overdue" ? "border-l-[3px] border-l-bad " : "") +
            s.border
          }
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
            </div>
            {/* REMAINING — the one big number. "Due X mi" lived here too; it's
                dropped since the Next-due stat below already carries it. */}
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
            </div>
          </div>

          {/* Progress — the interval lives here (single home; the old header
              "Every X mi" line was removed as a duplicate). */}
          <div className="mt-3">
            <IntervalBar pct={item.pct} status={item.status} />
            <p className="mt-1.5 text-[12px] text-fg-muted">
              {item.neverServiced
                ? "Awaiting first service — log one to set the baseline."
                : `${Math.round(item.pct)}% through the ${item.interval.toLocaleString()} mi interval`}
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
        <div className="mt-3 flex items-center justify-between rounded-md border border-line bg-card p-4 shadow-e1">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-ink-3">
              Total spent on this item
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-fg-subtle">
              {log.length} service{log.length === 1 ? "" : "s"} logged
            </p>
          </div>
          <p className="text-[28px] font-bold leading-none tabular-nums text-ok">
            {totalSpent > 0 ? money(totalSpent) : "$0.00"}
          </p>
        </div>

        {/* Actions — Log service, right-aligned. (Edit intervals + Delete live
            in the top bar.) */}
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            onClick={() => setServiceModal({ presetItemId: item.id })}
            variant="primary"
          >
            + Log service
          </Button>
        </div>
        {item.notes ? (
          <div className="mt-3 rounded-md border border-line bg-card p-4 shadow-e1">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-ink-3">
              Notes
            </p>
            <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg">
              {item.notes}
            </p>
          </div>
        ) : null}

        {/* Service log */}
        <section className="mt-6">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-ink-3">
              Service log
            </span>
            <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
              · {log.length}
            </span>
          </div>

          {log.length === 0 ? (
            <div className="rounded-md border border-dashed border-line bg-card px-4 py-10 text-center font-mono text-[12px] text-fg-subtle">
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
      className="cursor-pointer rounded-md border border-line bg-card p-3.5 shadow-e1 transition-colors hover:border-line-strong hover:bg-inset focus:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[14.5px] font-semibold leading-tight text-fg">
            {formatServiceDate(h.date) ?? "Undated"}
          </h3>
          {h.odo != null ? (
            <p className="mt-0.5 font-mono text-[11.5px] tabular-nums text-fg-muted">
              {h.odo.toLocaleString()} mi
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          {h.totalCost != null ? (
            <div className="text-[18px] font-bold leading-none tabular-nums text-ok">
              {money(h.totalCost)}
            </div>
          ) : (
            <div className="font-mono text-[11px] text-fg-subtle">no cost</div>
          )}
          {receiptCount(h) > 0 ? (
            <div className="mt-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-fg-subtle">
              {receiptCount(h)} receipt
              {receiptCount(h) === 1 ? "" : "s"}
            </div>
          ) : null}
        </div>
      </div>
      {h.notes ? (
        <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-fg-muted">
          {h.notes}
        </p>
      ) : null}
      <ExpenseLines expenses={h.expenses} unlinked={h.unlinkedAttachments} />
    </div>
  );
}
