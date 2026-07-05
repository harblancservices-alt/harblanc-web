"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { StatusTag } from "@/components/ui/StatusTag";
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
            className="block w-full rounded-md border border-line-strong bg-card px-3 py-2 text-[14px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/40"
            aria-label="Search trashed quotes"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-3 transition-colors hover:text-ink"
              aria-label="Clear search"
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      {hasFilter ? (
        <p className="mt-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
          Showing {filtered.length} of {rows.length}
        </p>
      ) : null}

      {/* L4: Trash feed — one compact card per trashed quote. */}
      <ul className="mt-4 space-y-3">
        {filtered.length === 0 ? (
          <li className="rounded-md border border-dashed border-line-strong bg-card px-4 py-8 text-center font-mono text-[12px] text-ink-3 shadow-e1">
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
    <li className="relative overflow-hidden rounded-md border border-line bg-card p-4 shadow-e1 sm:p-5">
      {/* Accent-red left edge signals a trashed record. */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-accent" />

      {/* Top row: name + trashed tag + deleted date + lane (right-aligned on sm+) */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <Link
            href={`/admin/quotes/${row.id}`}
            className="min-w-0 truncate text-[16px] font-semibold leading-tight text-ink transition-colors hover:text-accent"
          >
            {row.name || "—"}
          </Link>
          <StatusTag tone="slate" hideDot>
            Trashed
          </StatusTag>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3 sm:flex-nowrap">
          <span aria-label="Deleted">{deletedDate || "—"}</span>
          {lane ? (
            <span className="text-ink-2 tabular-nums" aria-label="Lane">
              {lane}
            </span>
          ) : null}
        </div>
      </div>

      {/* Meta row: commodity · auto-purge */}
      {commodity || purgeDate ? (
        <p className="mt-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
          {commodity ? <span className="text-ink-2">{commodity}</span> : null}
          {commodity && purgeDate ? (
            <span aria-hidden className="mx-2 text-ink-3">
              ·
            </span>
          ) : null}
          {purgeDate ? <span>Auto purge {purgeDate}</span> : null}
        </p>
      ) : null}

      {/* Action row: Restore (primary) + Delete (destructive) */}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="sm"
          type="button"
          onClick={onRestore}
          disabled={isPending}
          aria-label={`Restore ${row.name}`}
        >
          Restore
        </Button>
        <Button
          variant="destructive"
          size="sm"
          type="button"
          onClick={onDelete}
          disabled={isPending}
          aria-label={`Permanently delete ${row.name}`}
        >
          Delete
        </Button>
      </div>
    </li>
  );
}
