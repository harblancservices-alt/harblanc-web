"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { formatTimestampShort, isNew } from "@/lib/admin/format";
import { softDeleteQuote, softDeleteQuotes } from "./actions";
import { StatusBadge } from "./StatusBadge";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  type LeadStatus,
} from "@/lib/dispatch/status";

export type QuoteListRow = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  phone: string;
  commodity: string;
  weight: string;
  lead_status: LeadStatus;
  // Phase OPS-3: surfaced for client-side lane search. Loaded by the
  // page wrapper's SELECT; nullable on legacy rows that pre-date the
  // quick-quote ZIP fields.
  pickup_zip: string | null;
  delivery_zip: string | null;
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

  // Phase OPS-3: client-side search + status filter. Server query
  // unchanged; this is pure presentation-layer filtering across the
  // already-loaded row set. As lead volume grows past ~50 the operator
  // hits a scroll wall — this kills it.
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "">("");

  const filtered = useMemo(() => {
    let result = rows;
    if (statusFilter) {
      result = result.filter((r) => r.lead_status === statusFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q.length > 0) {
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.phone.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.commodity.toLowerCase().includes(q) ||
          (r.pickup_zip ?? "").toLowerCase().includes(q) ||
          (r.delivery_zip ?? "").toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q),
      );
    }
    return result;
  }, [rows, searchQuery, statusFilter]);

  // "All selected" / "Some selected" against the CURRENTLY-VISIBLE
  // filtered set so the operator can intuitively "select all visible".
  // Selections outside the filter are preserved across filter changes.
  const allSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const someSelected =
    !allSelected && filtered.some((r) => selected.has(r.id));

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
    setStatusFilter("");
  }

  const hasFilter = searchQuery.trim().length > 0 || statusFilter !== "";

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
      {/* Phase OPS-3: search + filter bar. Search input is always
          visible (mobile-first). Status filter shares the row on sm+;
          stacks below on mobile. Clear button appears when any filter
          is active. */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <div className="relative flex-1">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, phone, email, commodity, lane, ID..."
            className="block w-full border border-zinc-300 bg-white px-4 py-2.5 pr-10 text-sm text-black placeholder:text-black focus:border-red-600 focus:outline-none"
            aria-label="Search quotes"
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
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as LeadStatus | "")}
          className="block w-full border border-zinc-300 bg-white px-3 py-2.5 text-xs font-semibold tracking-[0.12em] uppercase text-black focus:border-red-600 focus:outline-none sm:w-auto"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {LEAD_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
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
          <span className="text-xs font-semibold tracking-[0.12em] text-black uppercase">
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
              className="inline-flex items-center border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-black transition-colors hover:border-zinc-400 hover:bg-zinc-100"
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
            {filtered.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <p className="text-sm text-black">
                  No records match your filter.
                </p>
                {hasFilter ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-3 inline-flex items-center border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold tracking-[0.12em] uppercase text-black transition-colors hover:border-zinc-400 hover:text-black"
                  >
                    Clear filters
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
                    <span className="flex items-center gap-2 font-mono text-xs text-black">
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
                    <span className="font-mono text-xs text-black">
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
                      className="inline-flex items-center justify-center border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-black transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
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
    <span className="label-cap text-black">
      {children}
    </span>
  );
}
