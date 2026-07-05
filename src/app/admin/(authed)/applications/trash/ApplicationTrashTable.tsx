"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { StatusTag } from "@/components/ui/StatusTag";
import { formatDateShort } from "@/lib/admin/format";
import {
  restoreApplication,
  permanentlyDeleteApplication,
} from "../actions";

/**
 * Level 6.6 — Applications Trash feed.
 *
 * Mirrors Quotes Trash 6.5: each trashed application renders as a
 * compact cream feed card. Name dominates; deleted date, equipment,
 * CDL, and auto-purge sit as supporting metadata. Restore / Delete live
 * as outlined buttons (black / red) inside the card.
 *
 * SCOPE (Level 6.6 directive):
 *   - Pure presentational restructure of /admin/applications/trash.
 *   - Server actions unchanged: restoreApplication,
 *     permanentlyDeleteApplication.
 *   - Retention logic unchanged.
 *
 * Dropped from the old spreadsheet implementation (presentation only):
 *   - 9-column min-w-[1240px] table grid
 *   - Heavy column headers (Deleted / Name / Phone / Email / Equipment /
 *     CDL / Auto-purge)
 *   - Checkbox-selection + sticky bulk-action bar.
 *
 * Kept (data + behavior contract):
 *   - Client-side search predicate (same fields as before).
 *   - Per-row Restore / Permanently delete via existing actions.
 *   - Confirm dialog before permanent delete.
 *   - Sort order from the loader (deleted_at DESC).
 */

export type ApplicationTrashRow = {
  id: string;
  created_at: string;
  deleted_at: string;
  delete_after: string | null;
  name: string;
  phone: string;
  email: string;
  equipment_type: string;
  cdl_status: string;
};

export function ApplicationTrashTable({
  rows,
}: {
  rows: ApplicationTrashRow[];
}) {
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
        r.equipment_type.toLowerCase().includes(q) ||
        r.cdl_status.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q),
    );
  }, [rows, searchQuery]);

  const hasFilter = searchQuery.trim().length > 0;

  function rowRestore(row: ApplicationTrashRow) {
    startTransition(async () => {
      try {
        await restoreApplication(row.id);
      } catch (e) {
        alert(`Failed: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    });
  }

  function rowPermanentDelete(row: ApplicationTrashRow) {
    if (
      !confirm(`Permanently delete "${row.name}"? This CANNOT be undone.`)
    ) {
      return;
    }
    startTransition(async () => {
      try {
        await permanentlyDeleteApplication(row.id);
      } catch (e) {
        alert(`Failed: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    });
  }

  return (
    <>
      {/* Search — single field, no extra filters. */}
      <div className="mt-5 flex items-stretch gap-2">
        <div className="relative flex-1">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, phone, email, equipment, ID…"
            className="block w-full rounded-md border border-line-strong bg-card px-3 py-2 text-[14px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/40"
            aria-label="Search trashed applications"
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
        <p className="mt-2 font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-ink-3">
          Showing {filtered.length} of {rows.length}
        </p>
      ) : null}

      {/* Feed: one compact card per trashed application. */}
      <ul className="mt-4 space-y-3">
        {filtered.length === 0 ? (
          <li className="rounded-md border border-dashed border-line-strong bg-card px-4 py-8 text-center font-mono text-[12px] text-ink-3 shadow-e1">
            {hasFilter
              ? "No trashed applications match your search"
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
  row: ApplicationTrashRow;
  isPending: boolean;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const deletedDate = formatDateShort(row.deleted_at).slice(0, 10);
  const purgeDate = row.delete_after
    ? formatDateShort(row.delete_after).slice(0, 10)
    : null;
  const equipment = row.equipment_type?.trim().toUpperCase() || null;
  const cdl = row.cdl_status?.trim().toUpperCase() || null;

  const hasMeta = Boolean(equipment || cdl);

  return (
    <li className="relative rounded-md border border-line bg-card p-4 shadow-e1">
      {/* Accent-red left edge */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] rounded-l-md bg-accent"
      />

      {/* Top row: name + deleted date */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <Link
          href={`/admin/applications/${row.id}`}
          className="min-w-0 truncate text-[16px] font-semibold leading-tight text-ink hover:text-accent"
        >
          {row.name || "—"}
        </Link>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-3">
          Deleted {deletedDate || "—"}
        </p>
      </div>

      {/* Mid: equipment · CDL chips */}
      {hasMeta ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {equipment ? <StatusTag tone="steel">{equipment}</StatusTag> : null}
          {cdl ? <StatusTag tone="slate">CDL {cdl}</StatusTag> : null}
        </div>
      ) : null}

      {/* Sub: auto-purge */}
      {purgeDate ? (
        <p className="mt-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-3">
          Auto purge {purgeDate}
        </p>
      ) : null}

      {/* Actions: Restore (primary) + Delete (destructive) */}
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
