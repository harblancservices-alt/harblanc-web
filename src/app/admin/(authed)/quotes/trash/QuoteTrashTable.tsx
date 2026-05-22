"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatTimestampShort, formatDateShort } from "@/lib/admin/format";
import {
  restoreQuote,
  permanentlyDeleteQuote,
  restoreQuotes,
  permanentlyDeleteQuotes,
} from "../actions";

export type QuoteTrashRow = {
  id: string;
  created_at: string;
  deleted_at: string;
  delete_after: string | null;
  name: string;
  email: string;
  phone: string;
  commodity: string;
};

const colSpec =
  "grid grid-cols-[40px_160px_minmax(140px,1fr)_140px_minmax(160px,1fr)_minmax(140px,1fr)_140px_150px] gap-x-3";

const checkboxCls =
  "h-4 w-4 shrink-0 cursor-pointer accent-red-600 border border-neutral-600 bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-1 focus:ring-offset-neutral-950";

export function QuoteTrashTable({ rows }: { rows: QuoteTrashRow[] }) {
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

  function bulkRestore() {
    if (selected.size === 0) return;
    const count = selected.size;
    if (
      !confirm(`Restore ${count} quote${count === 1 ? "" : "s"} from trash?`)
    ) {
      return;
    }
    const formData = new FormData();
    selected.forEach((id) => formData.append("ids", id));
    startTransition(async () => {
      try {
        await restoreQuotes(formData);
        setSelected(new Set());
      } catch (e) {
        alert(`Failed: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    });
  }

  function bulkPermanentDelete() {
    if (selected.size === 0) return;
    const count = selected.size;
    if (
      !confirm(
        `Permanently delete ${count} quote${count === 1 ? "" : "s"}? ` +
          `This CANNOT be undone.`,
      )
    ) {
      return;
    }
    const formData = new FormData();
    selected.forEach((id) => formData.append("ids", id));
    startTransition(async () => {
      try {
        await permanentlyDeleteQuotes(formData);
        setSelected(new Set());
      } catch (e) {
        alert(`Failed: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    });
  }

  function rowRestore(row: QuoteTrashRow) {
    startTransition(async () => {
      try {
        await restoreQuote(row.id);
      } catch (e) {
        alert(`Failed: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    });
  }

  function rowPermanentDelete(row: QuoteTrashRow) {
    if (
      !confirm(
        `Permanently delete "${row.name}"? This CANNOT be undone.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        await permanentlyDeleteQuote(row.id);
      } catch (e) {
        alert(`Failed: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    });
  }

  return (
    <>
      {selected.size > 0 ? (
        <div className="mt-3 flex items-center justify-between gap-4 border border-neutral-700 bg-neutral-900 px-4 py-3">
          <span className="font-mono text-[11px] tracking-[0.18em] text-white uppercase">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={bulkRestore}
              disabled={isPending}
              className="inline-flex items-center border border-neutral-700 bg-neutral-900/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-100 transition-colors hover:border-neutral-500 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Restore selected
            </button>
            <button
              type="button"
              onClick={bulkPermanentDelete}
              disabled={isPending}
              className="inline-flex items-center bg-red-600 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Permanently delete selected
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
        <div className="min-w-[1100px]">
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
            <Th>Deleted</Th>
            <Th>Name</Th>
            <Th>Phone</Th>
            <Th>Email</Th>
            <Th>Commodity</Th>
            <Th>Auto-purge</Th>
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
                    <span className="font-mono text-xs text-neutral-300">
                      {formatTimestampShort(r.deleted_at)}
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
                    <span className="font-mono text-[11px] tracking-[0.14em] text-neutral-500 uppercase">
                      {r.delete_after
                        ? formatDateShort(r.delete_after).slice(0, 10)
                        : "\u2014"}
                    </span>
                  </Link>
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => rowRestore(r)}
                      disabled={isPending}
                      title="Restore"
                      aria-label={`Restore ${r.name}`}
                      className="inline-flex items-center justify-center border border-neutral-700 bg-neutral-900/40 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-200 transition-colors hover:border-neutral-500 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      onClick={() => rowPermanentDelete(r)}
                      disabled={isPending}
                      title="Permanently delete"
                      aria-label={`Permanently delete ${r.name}`}
                      className="inline-flex items-center justify-center bg-red-600 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Delete
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
    <span className="font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase">
      {children}
    </span>
  );
}
