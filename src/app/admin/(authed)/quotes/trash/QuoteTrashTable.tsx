"use client";

import { useState, useTransition, useMemo } from "react";
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
  // Phase OPS-3: client-side lane search support.
  pickup_zip: string | null;
  delivery_zip: string | null;
};

const colSpec =
  "grid grid-cols-[40px_160px_minmax(140px,1fr)_140px_minmax(160px,1fr)_minmax(140px,1fr)_140px_150px] gap-x-3";

const checkboxCls =
  "h-4 w-4 shrink-0 cursor-pointer accent-red-600 border border-zinc-400 bg-white focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-1 focus:ring-offset-zinc-50";

export function QuoteTrashTable({ rows }: { rows: QuoteTrashRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  // Phase OPS-3: client-side search. No status filter in trash (all
  // rows share the soft-deleted state). Sort/group by deleted_at is
  // preserved from the loader.
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length === 0) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.phone.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.commodity.toLowerCase().includes(q) ||
        (r.pickup_zip ?? "").toLowerCase().includes(q) ||
        (r.delivery_zip ?? "").toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q),
    );
  }, [rows, searchQuery]);

  const allSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const someSelected =
    !allSelected && filtered.some((r) => selected.has(r.id));
  const hasFilter = searchQuery.trim().length > 0;

  function toggleRow(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const r of filtered) next.add(r.id);
      } else {
        for (const r of filtered) next.delete(r.id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function clearFilters() {
    setSearchQuery("");
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
      {/* Phase OPS-3: search bar. No status filter — trash items share
          the same soft-deleted state. */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <div className="relative flex-1">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, phone, email, commodity, lane, ID..."
            className="block w-full border border-zinc-300 bg-white px-4 py-2.5 pr-10 text-sm text-black placeholder:text-black focus:border-red-600 focus:outline-none"
            aria-label="Search trashed quotes"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-black transition-colors hover:text-black"
              aria-label="Clear search"
            >
              ×
            </button>
          ) : null}
        </div>
        {hasFilter ? (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center justify-center border border-zinc-300 bg-white px-4 py-2.5 text-xs font-semibold tracking-[0.12em] uppercase text-black transition-colors hover:border-zinc-400 hover:text-black sm:w-auto"
          >
            Clear
          </button>
        ) : null}
      </div>

      {hasFilter ? (
        <p className="mt-2 text-xs text-black">
          Showing {filtered.length} of {rows.length} record
          {rows.length === 1 ? "" : "s"}
        </p>
      ) : null}

      {selected.size > 0 ? (
        <div className="sticky top-0 z-20 mt-3 flex items-center justify-between gap-4 border border-zinc-300 bg-white px-4 py-3 shadow-sm">
          <span className="font-mono text-xs tracking-[0.12em] text-black uppercase">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={bulkRestore}
              disabled={isPending}
              className="inline-flex items-center border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-black transition-colors hover:border-zinc-400 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Restore selected
            </button>
            <button
              type="button"
              onClick={bulkPermanentDelete}
              disabled={isPending}
              className="inline-flex items-center bg-red-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Permanently delete selected
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex items-center border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-black transition-colors hover:border-zinc-400 hover:bg-zinc-100"
            >
              Clear selection
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-5 overflow-x-auto">
        <div className="min-w-[1100px]">
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
            <Th>Deleted</Th>
            <Th>Name</Th>
            <Th>Phone</Th>
            <Th>Email</Th>
            <Th>Commodity</Th>
            <Th>Auto-purge</Th>
            <span />
          </div>

          <div className="divide-y divide-zinc-200 border-l border-r border-b border-zinc-200 bg-white">
            {filtered.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <p className="text-sm text-black">
                  No trashed records match your search.
                </p>
                {hasFilter ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-3 inline-flex items-center border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold tracking-[0.12em] uppercase text-black transition-colors hover:border-zinc-400 hover:text-black"
                  >
                    Clear search
                  </button>
                ) : null}
              </div>
            ) : null}
            {filtered.map((r) => {
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
                    <span className="font-mono text-xs text-black">
                      {formatTimestampShort(r.deleted_at)}
                    </span>
                    <span className="truncate text-sm font-semibold text-black">
                      {r.name}
                    </span>
                    <span className="font-mono text-xs text-black">
                      {r.phone}
                    </span>
                    <span className="truncate text-xs text-black">
                      {r.email}
                    </span>
                    <span className="truncate text-sm text-black">
                      {r.commodity}
                    </span>
                    <span className="font-mono text-xs tracking-[0.12em] text-black uppercase">
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
                      className="inline-flex items-center justify-center border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-black transition-colors hover:border-zinc-400 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      onClick={() => rowPermanentDelete(r)}
                      disabled={isPending}
                      title="Permanently delete"
                      aria-label={`Permanently delete ${r.name}`}
                      className="inline-flex items-center justify-center bg-red-600 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
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
    <span className="label-cap text-black">
      {children}
    </span>
  );
}
