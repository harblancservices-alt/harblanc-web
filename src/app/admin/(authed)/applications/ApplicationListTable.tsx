"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { formatTimestampShort, isNew } from "@/lib/admin/format";
import { softDeleteApplication, softDeleteApplications } from "./actions";

export type ApplicationListRow = {
  id: string;
  created_at: string;
  name: string;
  phone: string;
  email: string;
  equipment_type: string;
  cdl_status: string;
  years_experience: string | null;
  home_base: string | null;
};

const colSpec =
  "grid grid-cols-[40px_180px_minmax(140px,1fr)_140px_minmax(160px,1fr)_120px_100px_90px_140px_70px] gap-x-3";

const checkboxCls =
  "h-4 w-4 shrink-0 cursor-pointer accent-red-600 border border-zinc-400 bg-white focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-1 focus:ring-offset-zinc-50";

export function ApplicationListTable({
  rows,
}: {
  rows: ApplicationListRow[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  // Phase OPS-3: client-side search + CDL filter. Unique CDL values
  // are derived from the loaded rows so the filter dropdown always
  // shows actually-present options (no stale enum drift).
  const [searchQuery, setSearchQuery] = useState("");
  const [cdlFilter, setCdlFilter] = useState<string>("");

  const cdlOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.cdl_status && r.cdl_status.trim().length > 0) {
        set.add(r.cdl_status);
      }
    }
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (cdlFilter) {
      result = result.filter((r) => r.cdl_status === cdlFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q.length > 0) {
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.phone.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.equipment_type.toLowerCase().includes(q) ||
          r.cdl_status.toLowerCase().includes(q) ||
          (r.home_base ?? "").toLowerCase().includes(q) ||
          (r.years_experience ?? "").toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q),
      );
    }
    return result;
  }, [rows, searchQuery, cdlFilter]);

  const allSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const someSelected =
    !allSelected && filtered.some((r) => selected.has(r.id));
  const hasFilter = searchQuery.trim().length > 0 || cdlFilter !== "";

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
    setCdlFilter("");
  }

  function bulkSoftDelete() {
    if (selected.size === 0) return;
    const count = selected.size;
    if (
      !confirm(
        `Move ${count} application${count === 1 ? "" : "s"} to trash?`,
      )
    ) {
      return;
    }
    const formData = new FormData();
    selected.forEach((id) => formData.append("ids", id));
    startTransition(async () => {
      try {
        await softDeleteApplications(formData);
        setSelected(new Set());
      } catch (e) {
        alert(`Failed: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    });
  }

  function rowSoftDelete(row: ApplicationListRow) {
    if (!confirm(`Move "${row.name}" to trash?`)) return;
    startTransition(async () => {
      try {
        await softDeleteApplication(row.id);
      } catch (e) {
        alert(`Failed: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    });
  }

  return (
    <>
      {/* Phase OPS-3: search + CDL filter. Search input always visible;
          CDL filter shares the row on sm+, stacks on mobile. */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <div className="relative flex-1">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, phone, email, equipment, home base..."
            className="block w-full border border-zinc-300 bg-white px-4 py-2.5 pr-10 text-sm text-zinc-900 placeholder:text-zinc-500 focus:border-red-600 focus:outline-none"
            aria-label="Search applications"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-500 transition-colors hover:text-zinc-900"
              aria-label="Clear search"
            >
              ×
            </button>
          ) : null}
        </div>
        {cdlOptions.length > 0 ? (
          <select
            value={cdlFilter}
            onChange={(e) => setCdlFilter(e.target.value)}
            className="block w-full border border-zinc-300 bg-white px-3 py-2.5 text-xs font-semibold tracking-[0.12em] uppercase text-zinc-700 focus:border-red-600 focus:outline-none sm:w-auto"
            aria-label="Filter by CDL status"
          >
            <option value="">All CDL statuses</option>
            {cdlOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : null}
        {hasFilter ? (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center justify-center border border-zinc-300 bg-white px-4 py-2.5 text-xs font-semibold tracking-[0.12em] uppercase text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900 sm:w-auto"
          >
            Clear
          </button>
        ) : null}
      </div>

      {hasFilter ? (
        <p className="mt-2 text-xs text-zinc-600">
          Showing {filtered.length} of {rows.length} record
          {rows.length === 1 ? "" : "s"}
        </p>
      ) : null}

      {selected.size > 0 ? (
        <div className="sticky top-0 z-20 mt-3 flex items-center justify-between gap-4 border border-zinc-300 bg-white px-4 py-3 shadow-sm">
          <span className="font-mono text-xs tracking-[0.12em] text-zinc-900 uppercase">
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
        <div className="min-w-[1240px]">
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
            <Th>Name</Th>
            <Th>Phone</Th>
            <Th>Email</Th>
            <Th>Equipment</Th>
            <Th>CDL</Th>
            <Th>Years</Th>
            <Th>Home base</Th>
            <span />
          </div>

          <div className="divide-y divide-zinc-200 border-l border-r border-b border-zinc-200 bg-white">
            {filtered.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <p className="text-sm text-zinc-600">
                  No applications match your filter.
                </p>
                {hasFilter ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-3 inline-flex items-center border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold tracking-[0.12em] uppercase text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900"
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
                    href={`/admin/applications/${r.id}`}
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
                      {r.equipment_type}
                    </span>
                    <span className="text-sm text-zinc-700">
                      {r.cdl_status}
                    </span>
                    <span className="font-mono text-xs text-zinc-700">
                      {r.years_experience ?? "\u2014"}
                    </span>
                    <span className="truncate text-xs text-zinc-700">
                      {r.home_base ?? "\u2014"}
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
