"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
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
            className="block w-full border-2 border-black bg-white px-3 py-2.5 font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-black placeholder:text-black/40 focus:outline-none"
            aria-label="Search trashed applications"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-black transition-colors hover:text-red-700"
              aria-label="Clear search"
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      {hasFilter ? (
        <p className="mt-2 font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-black/60">
          Showing {filtered.length} of {rows.length}
        </p>
      ) : null}

      {/* Feed: one compact card per trashed application. */}
      <ul className="mt-4 space-y-3">
        {filtered.length === 0 ? (
          <li className="border-2 border-dashed border-black/30 px-5 py-8 text-center font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-black/55">
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

  const metaTokens: string[] = [];
  if (equipment) metaTokens.push(equipment);
  if (cdl) metaTokens.push(`CDL ${cdl}`);

  return (
    <li className="border-2 border-black border-l-4 border-l-black bg-[#fafaf6] px-4 py-3 sm:px-5 sm:py-4">
      {/* Top row: name + deleted date */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <Link
          href={`/admin/applications/${row.id}`}
          className="min-w-0 truncate text-[17px] font-bold leading-tight text-black hover:underline sm:text-[18px]"
        >
          {row.name || "—"}
        </Link>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-black/70">
          Deleted {deletedDate || "—"}
        </p>
      </div>

      {/* Mid: equipment · CDL */}
      {metaTokens.length > 0 ? (
        <p className="mt-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-black">
          {metaTokens.join(" · ")}
        </p>
      ) : null}

      {/* Sub: auto-purge */}
      {purgeDate ? (
        <p className="mt-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-black/60">
          Auto purge {purgeDate}
        </p>
      ) : null}

      {/* Actions: Restore (outlined black) + Delete (outlined red) */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRestore}
          disabled={isPending}
          aria-label={`Restore ${row.name}`}
          className="inline-flex items-center justify-center border-2 border-black bg-transparent px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-black transition-colors hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Restore
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={isPending}
          aria-label={`Permanently delete ${row.name}`}
          className="inline-flex items-center justify-center border-2 border-red-700 bg-transparent px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-red-700 transition-colors hover:bg-red-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </li>
  );
}
