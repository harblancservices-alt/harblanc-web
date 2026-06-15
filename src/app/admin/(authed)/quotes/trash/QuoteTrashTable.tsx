"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { formatDateShort } from "@/lib/admin/format";
import { restoreQuote, permanentlyDeleteQuote } from "../actions";

/**
 * Level 6.5 — Quotes Trash feed.
 *
 * V3 visual language: each trashed quote renders as a compact cream feed
 * row, not a spreadsheet cell. Customer name dominates; deleted date,
 * lane, freight, and auto-purge sit as supporting metadata. Restore /
 * Delete live as outlined buttons (black / red) inside the row.
 *
 * SCOPE (Level 6.5 directive):
 *   - Pure presentational restructure of /admin/quotes/trash.
 *   - Server actions unchanged: restoreQuote / permanentlyDeleteQuote.
 *   - Soft-delete retention logic unchanged.
 *   - Active quotes workflow untouched.
 *
 * Dropped from the old spreadsheet implementation (presentation only):
 *   - 8-column min-w-[1100px] table grid
 *   - Heavy column headers (Deleted / Name / Phone / Email / Commodity /
 *     Auto-purge)
 *   - Checkbox-selection + sticky bulk-action bar (single-row Restore /
 *     Delete still cover every use case the server actions support).
 *
 * Kept (data + behavior contract):
 *   - Client-side search across name / phone / email / commodity / lane /
 *     id (same predicate as before).
 *   - Server actions: restoreQuote(id), permanentlyDeleteQuote(id).
 *   - Confirm dialog before permanent delete.
 *   - Sort order from the loader (deleted_at DESC).
 */

export type QuoteTrashRow = {
  id: string;
  created_at: string;
  deleted_at: string;
  delete_after: string | null;
  name: string;
  email: string;
  phone: string;
  commodity: string;
  pickup_zip: string | null;
  delivery_zip: string | null;
};

export function QuoteTrashTable({ rows }: { rows: QuoteTrashRow[] }) {
  const [isPending, startTransition] = useTransition();
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

  const hasFilter = searchQuery.trim().length > 0;

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
      !confirm(`Permanently delete "${row.name}"? This CANNOT be undone.`)
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
      {/* L3: Search — single field, no extra filters per Level 6.5 spec. */}
      <div className="mt-5 flex items-stretch gap-2">
        <div className="relative flex-1">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, phone, lane, commodity, ID…"
            className="block w-full border-2 border-line bg-card px-3 py-2.5 font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-fg placeholder:text-fg/40 focus:outline-none"
            aria-label="Search trashed quotes"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-fg transition-colors hover:text-red-700"
              aria-label="Clear search"
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      {hasFilter ? (
        <p className="mt-2 font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-fg-subtle">
          Showing {filtered.length} of {rows.length}
        </p>
      ) : null}

      {/* L4: Trash feed — one compact card per trashed quote. */}
      <ul className="mt-4 space-y-3">
        {filtered.length === 0 ? (
          <li className="border-2 border-dashed border-line/30 px-5 py-8 text-center font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-fg-subtle">
            {hasFilter
              ? "No trashed records match your search"
              : "Trash is empty"}
          </li>
        ) : (
          filtered.map((r) => (
            <TrashRow
              key={r.id}
              row={r}
              isPending={isPending}
              onRestore={() => rowRestore(r)}
              onDelete={() => rowPermanentDelete(r)}
            />
          ))
        )}
      </ul>
    </>
  );
}

function TrashRow({
  row,
  isPending,
  onRestore,
  onDelete,
}: {
  row: QuoteTrashRow;
  isPending: boolean;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const deletedDate = formatDateShort(row.deleted_at).slice(0, 10);
  const purgeDate = row.delete_after
    ? formatDateShort(row.delete_after).slice(0, 10)
    : null;
  const lane =
    row.pickup_zip && row.delivery_zip
      ? `${row.pickup_zip} → ${row.delivery_zip}`
      : row.pickup_zip
        ? `${row.pickup_zip} → —`
        : row.delivery_zip
          ? `— → ${row.delivery_zip}`
          : null;
  const commodity = row.commodity?.trim().toUpperCase() || null;

  return (
    <li className="border-2 border-line border-l-4 border-l-black bg-[#fafaf6] px-4 py-3 sm:px-5 sm:py-4">
      {/* Top row: name + deleted date + lane (lane right-aligned on sm+) */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <Link
          href={`/admin/quotes/${row.id}`}
          className="min-w-0 truncate text-[17px] font-bold leading-tight text-fg hover:underline sm:text-[18px]"
        >
          {row.name || "—"}
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-fg-muted sm:flex-nowrap">
          <span aria-label="Deleted">{deletedDate || "—"}</span>
          {lane ? (
            <span className="text-fg tabular-nums" aria-label="Lane">
              {lane}
            </span>
          ) : null}
        </div>
      </div>

      {/* Meta row: commodity · auto-purge */}
      {commodity || purgeDate ? (
        <p className="mt-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-fg-subtle">
          {commodity ? <span className="text-fg">{commodity}</span> : null}
          {commodity && purgeDate ? (
            <span aria-hidden className="mx-2 text-fg/40">
              ·
            </span>
          ) : null}
          {purgeDate ? <span>Auto purge {purgeDate}</span> : null}
        </p>
      ) : null}

      {/* Action row: Restore (black outline) + Delete (red outline) */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRestore}
          disabled={isPending}
          aria-label={`Restore ${row.name}`}
          className="inline-flex items-center justify-center border-2 border-line bg-transparent px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-fg transition-colors hover:bg-canvas hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
        >
          Restore
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={isPending}
          aria-label={`Permanently delete ${row.name}`}
          className="inline-flex items-center justify-center border-2 border-red-300 bg-transparent px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-red-700 transition-colors hover:bg-red-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </li>
  );
}
