"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ExpenseLines,
  ServiceModal,
  formatServiceDate,
  money,
  receiptCount,
  type MaintItem,
  type ServiceHistoryEntry,
} from "../../MaintenanceView";

/**
 * Detail view for ONE logged service (the per-service page). Mirrors the item
 * detail layout: blue back button, a header card with the service's full info,
 * its expense line items + receipts, and a deliberate Edit step (the shared
 * ServiceModal in edit mode). Tapping a service-history card lands HERE — never
 * straight into the edit form.
 */
export function ServiceDetail({
  entry,
  allItems,
  currentOdo,
}: {
  entry: ServiceHistoryEntry;
  allItems: MaintItem[];
  currentOdo: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 lg:px-8">
        {/* Back */}
        <Link
          href="/admin/maintenance"
          prefetch={false}
          className="inline-flex items-center gap-1.5 rounded-md border border-blue-700 bg-blue-600 px-2.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-blue-700"
        >
          ← All maintenance
        </Link>

        {/* Header card */}
        <div className="mt-3 rounded-xl border border-line bg-card p-4 shadow-md">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-600">
                Service
              </p>
              <h1 className="mt-0.5 text-[22px] font-semibold leading-tight tracking-tight text-fg">
                {entry.serviceName}
              </h1>
              <p className="mt-1 font-mono text-[12px] font-semibold tabular-nums text-amber-700">
                {formatServiceDate(entry.date) ?? "Undated"}
                {entry.odo != null
                  ? ` · ${entry.odo.toLocaleString()} mi`
                  : ""}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {entry.totalCost != null ? (
                <div className="text-[24px] font-bold leading-none tabular-nums text-emerald-700">
                  {money(entry.totalCost)}
                </div>
              ) : (
                <div className="font-mono text-[12px] text-fg-subtle">
                  no cost
                </div>
              )}
              {receiptCount(entry) > 0 ? (
                <div className="mt-1 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-fg-subtle">
                  {receiptCount(entry)} receipt
                  {receiptCount(entry) === 1 ? "" : "s"}
                </div>
              ) : null}
            </div>
          </div>

          {entry.notes ? (
            <p className="mt-3 whitespace-pre-wrap border-t border-line pt-3 text-[12.5px] text-fg-muted">
              {entry.notes}
            </p>
          ) : null}
        </div>

        {/* Actions */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border border-blue-700 bg-blue-600 px-3.5 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-blue-700"
          >
            Edit service
          </button>
        </div>

        {/* Expense lines + receipts */}
        <section className="mt-6">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-600">
              Expenses
            </span>
            <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
              · {entry.expenses.length}
            </span>
          </div>
          {entry.expenses.length === 0 &&
          entry.unlinkedAttachments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-card px-4 py-8 text-center font-mono text-[12px] text-fg-subtle">
              No expense lines on this service.
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-card p-3.5 shadow-sm">
              {/* Reuse the shared expense-line display (receipts visible). */}
              <ExpenseLines
                expenses={entry.expenses}
                unlinked={entry.unlinkedAttachments}
              />
              {entry.totalCost != null ? (
                <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg-subtle">
                    Total
                  </span>
                  <span className="font-mono text-[14px] font-bold tabular-nums text-emerald-700">
                    {money(entry.totalCost)}
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>

      {editing ? (
        <ServiceModal
          items={allItems}
          currentOdo={currentOdo}
          presetItemId={null}
          editEntry={entry}
          onClose={() => {
            setEditing(false);
            router.refresh();
          }}
          // The service lives on THIS page — after a delete, leave for the list
          // instead of refreshing into a 404.
          onDeleted={() => router.push("/admin/maintenance")}
        />
      ) : null}
    </div>
  );
}
