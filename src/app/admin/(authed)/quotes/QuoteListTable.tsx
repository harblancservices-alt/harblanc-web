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
  "h-4 w-4 shrink-0 cursor-pointer accent-red-600 border border-zinc-400 bg-white focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-1 focus:ring-offset-zinc-50";

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
        <div className="mt-3 flex items-center justify-between gap-4 border border-zinc-300 bg-white px-4 py-3">
          <span className="text-xs font-semibold tracking-[0.12em] text-zinc-900 uppercase">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={bulkSoftDelete}
              disabled={isPending}
              className="inline-flex items-center bg-red-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Move selected to trash
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex items-center border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-100"
            >
              Clear selection
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-5 overflow-x-auto">
        <div className="min-w-[1130px]">
          <div
            className={`${colSpec} items-center border-b border-zinc-300 bg-zinc-100 px-3 py-3`}
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

          <div className="divide-y divide-zinc-200 border-l border-r border-b border-zinc-200 bg-white">
            {rows.map((r) => {
              const isSel = selected.has(r.id);
              return (
                <div
                  key={r.id}
                  className={
                    `${colSpec} items-center px-3 py-2.5 transition-colors hover:bg-zinc-50 ` +
                    (isSel ? "bg-red-50" : "")
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
                    <span className="flex items-center gap-2 font-mono text-xs text-zinc-700">
                      {isNew(r.created_at) ? (
                        <span className="font-mono text-xs tracking-[0.12em] text-red-600 uppercase">
                          New
                        </span>
                      ) : null}
                      <span>{formatTimestampShort(r.created_at)}</span>
                    </span>
                    <span className="flex items-center">
                      <StatusBadge status={r.lead_status} />
                    </span>
                    <span className="truncate text-sm font-semibold text-zinc-900">
                      {r.name}
                    </span>
                    <span className="font-mono text-xs text-zinc-700">
                      {r.phone}
                    </span>
                    <span className="truncate text-xs text-zinc-700">
                      {r.email}
                    </span>
                    <span className="truncate text-sm text-zinc-700">
                      {r.commodity}
                    </span>
                    <span className="font-mono text-xs text-zinc-700">
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
                      className="inline-flex items-center justify-center border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-700 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
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
    <span className="label-cap text-zinc-600">
      {children}
    </span>
  );
}
