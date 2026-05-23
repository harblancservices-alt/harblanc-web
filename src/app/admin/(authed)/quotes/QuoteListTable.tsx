"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatTimestampShort, isNew } from "@/lib/admin/format";
import { softDeleteQuote, softDeleteQuotes } from "./actions";
import { StatusBadge } from "./[id]/StatusBadge";
import { type LeadStatus } from "@/lib/dispatch/status";

export type QuoteListRow = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  phone: string;
  commodity: string;
  weight: string;
  lead_status: LeadStatus;
};

// Grid: checkbox / received / status / name / phone / email / commodity /
// weight (compact) / action. Status replaces the prior dedicated weight
// column position; weight moves narrower to make room for the badge.
const colSpec =
  "grid grid-cols-[40px_180px_180px_minmax(140px,1fr)_140px_minmax(160px,1fr)_minmax(140px,1fr)_100px_70px] gap-x-3";

const checkboxCls =
  "h-4 w-4 shrink-0 cursor-pointer accent-red-600 border border-neutral-600 bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-1 focus:ring-offset-neutral-950";

export function QuoteListTable({ rows }: { rows: QuoteListRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0 && selected.size < rows.length;

  function toggleRow(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set());
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function bulkSoftDelete() {
    if (selected.size === 0) return;
    const count = selected.size;
    if (
      !confirm(
        `Move ${count} quote request${count === 1 ? "" : "s"} to trash?`,
      )
    ) {
      return;
    }
    const formData = new FormData();
    selected.forEach((id) => formData.append("ids", id));
    startTransition(async () => {
      try {
        await softDeleteQuotes(formData);
        setSelected(new Set());
      } catch (e) {
        alert(
          `Failed: ${e instanceof Error ? e.message : "unknown error"}`,
        );
      }
    });
  }

  function rowSoftDelete(row: QuoteListRow) {
    if (!confirm(`Move "${row.name}" to trash?`)) return;
    startTransition(async () => {
      try {
        await softDeleteQuote(row.id);
      } catch (e) {
        alert(
          `Failed: ${e instanceof Error ? e.message : "unknown error"}`,
        );
      }
    });
  }

  return (
    <>
      {selected.size > 0 ? (
        <div className="mt-3 flex items-center justify-between gap-4 border border-neutral-700 bg-neutral-900 px-4 py-3">
          <span className="text-[11px] font-semibold tracking-[0.18em] text-white uppercase">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={bulkSoftDelete}
              disabled={isPending}
              className="inline-flex items-center bg-red-600 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Move selected to trash
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex items-center border border-neutral-700 bg-neutral-900/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-100 transition-colors hover:border-neutral-500 hover:bg-neutral-900"
            >
              Clear selection
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-5 overflow-x-auto">
        <div className="min-w-[1130px]">
          <div
            className={`${colSpec} items-center border-b border-neutral-700 bg-neutral-900 px-3 py-3`}
          >
            <div>
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={(e) => toggleAll(e.target.checked)}
                className={checkboxCls}
                aria-label="Select all"
              />
            </div>
            <Th>Received</Th>
            <Th>Status</Th>
            <Th>Name</Th>
            <Th>Phone</Th>
            <Th>Email</Th>
            <Th>Commodity</Th>
            <Th>Weight</Th>
            <span />
          </div>

          <div className="divide-y divide-neutral-800">
            {rows.map((r) => {
              const isSel = selected.has(r.id);
              return (
                <div
                  key={r.id}
                  className={
                    `${colSpec} items-center px-3 py-2.5 transition-colors hover:bg-neutral-900 ` +
                    (isSel ? "bg-neutral-900/60" : "")
                  }
                >
                  <div>
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={(e) => toggleRow(r.id, e.target.checked)}
                      className={checkboxCls}
                      aria-label={`Select ${r.name}`}
                    />
                  </div>
                  <Link
                    href={`/admin/quotes/${r.id}`}
                    className="contents"
                  >
                    <span className="flex items-center gap-2 font-mono text-xs text-neutral-300">
                      {isNew(r.created_at) ? (
                        <span className="font-mono text-[9px] tracking-[0.22em] text-red-500 uppercase">
                          New
                        </span>
                      ) : null}
                      <span>{formatTimestampShort(r.created_at)}</span>
                    </span>
                    <span className="flex items-center">
                      <StatusBadge status={r.lead_status} />
                    </span>
                    <span className="truncate text-sm font-semibold text-white">
                      {r.name}
                    </span>
                    <span className="font-mono text-xs text-neutral-300">
                      {r.phone}
                    </span>
                    <span className="truncate text-xs text-neutral-300">
                      {r.email}
                    </span>
                    <span className="truncate text-sm text-neutral-300">
                      {r.commodity}
                    </span>
                    <span className="font-mono text-xs text-neutral-300">
                      {r.weight}
                    </span>
                  </Link>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => rowSoftDelete(r)}
                      disabled={isPending}
                      title="Move to trash"
                      aria-label={`Move ${r.name} to trash`}
                      className="inline-flex items-center justify-center border border-neutral-700 bg-neutral-900/40 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:border-red-700 hover:bg-red-950/30 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Trash
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <span className="label-cap text-neutral-500">
      {children}
    </span>
  );
}
