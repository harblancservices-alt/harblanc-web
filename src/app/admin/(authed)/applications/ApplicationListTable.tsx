"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { formatTimestampShort, isNew } from "@/lib/admin/format";
import { softDeleteApplication } from "./actions";

/**
 * Level 6.6 — Active Applications feed.
 *
 * V3 visual language: each application renders as a compact cream feed
 * row, not a spreadsheet cell. Name dominates; date received, equipment,
 * CDL, years, and home base sit as supporting metadata. Phone / Email
 * action affordances live inside the row alongside Trash.
 *
 * SCOPE (Level 6.6 directive):
 *   - Pure presentational restructure of /admin/applications.
 *   - Server action unchanged: softDeleteApplication.
 *   - Active quotes / detail / schema untouched.
 *
 * Dropped from the old spreadsheet implementation (presentation only):
 *   - 10-column min-w-[1240px] table grid
 *   - Heavy column headers (Received / Name / Phone / Email / Equipment /
 *     CDL / Years / Home base)
 *   - Checkbox-selection + sticky bulk-action bar (single-row Trash still
 *     covers every use case the server action supports).
 *
 * Kept (data + behavior contract):
 *   - Client-side search predicate (same fields as before).
 *   - CDL status filter (operators triage by CDL class).
 *   - "New" badge for recently-received applications.
 *   - Server action: softDeleteApplication(id).
 *   - Confirm dialog before trash.
 *   - Sort order from the loader (created_at DESC).
 */

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

export function ApplicationListTable({
  rows,
}: {
  rows: ApplicationListRow[];
}) {
  const [isPending, startTransition] = useTransition();
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

  const hasFilter = searchQuery.trim().length > 0 || cdlFilter !== "";

  function clearFilters() {
    setSearchQuery("");
    setCdlFilter("");
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
      {/* Toolbar: search + CDL filter + clear */}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <div className="relative flex-1">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, phone, email, equipment, home base…"
            className="block w-full border-2 border-line bg-card px-3 py-2.5 font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-fg placeholder:text-fg/40 focus:outline-none"
            aria-label="Search applications"
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
        {cdlOptions.length > 0 ? (
          <select
            value={cdlFilter}
            onChange={(e) => setCdlFilter(e.target.value)}
            className="block w-full border-2 border-line bg-card px-3 py-2.5 font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-fg focus:outline-none sm:w-auto"
            aria-label="Filter by CDL status"
          >
            <option value="">All CDL</option>
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
            className="inline-flex items-center justify-center border-2 border-line bg-card px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-fg transition-colors hover:bg-canvas hover:text-fg sm:w-auto"
          >
            Clear
          </button>
        ) : null}
      </div>

      {hasFilter ? (
        <p className="mt-2 font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-fg-subtle">
          Showing {filtered.length} of {rows.length}
        </p>
      ) : null}

      {/* Feed: one compact card per application */}
      <ul className="mt-4 space-y-3">
        {filtered.length === 0 ? (
          <li className="border-2 border-dashed border-line/30 px-5 py-8 text-center font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-fg-subtle">
            {hasFilter
              ? "No applications match your filter"
              : "No incoming applications"}
          </li>
        ) : (
          filtered.map((r) => (
            <ApplicationRow
              key={r.id}
              row={r}
              isPending={isPending}
              onTrash={() => rowSoftDelete(r)}
            />
          ))
        )}
      </ul>
    </>
  );
}

function ApplicationRow({
  row,
  isPending,
  onTrash,
}: {
  row: ApplicationListRow;
  isPending: boolean;
  onTrash: () => void;
}) {
  const received = formatTimestampShort(row.created_at);
  const fresh = isNew(row.created_at);
  const equipment = row.equipment_type?.trim().toUpperCase() || null;
  const cdl = row.cdl_status?.trim().toUpperCase() || null;
  const years = row.years_experience?.trim() || null;
  const homeBase = row.home_base?.trim() || null;

  // Tertiary metadata line (equipment · CDL · years).
  const metaTokens: string[] = [];
  if (equipment) metaTokens.push(equipment);
  if (cdl) metaTokens.push(`CDL ${cdl}`);
  if (years) metaTokens.push(`${years} YRS`);

  const phoneHref = `tel:${row.phone.replace(/[^\d+]/g, "")}`;
  const emailHref = `mailto:${row.email}`;
  const hasPhone = row.phone.trim().length > 0;
  const hasEmail = row.email.trim().length > 0;

  return (
    <li className="border-2 border-line border-l-4 border-l-black bg-[#fafaf6] px-4 py-3 sm:px-5 sm:py-4">
      {/* Top row: name + date / NEW chip */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <Link
          href={`/admin/applications/${row.id}`}
          className="min-w-0 truncate text-[17px] font-bold leading-tight text-fg hover:underline sm:text-[18px]"
        >
          {row.name || "—"}
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-fg-muted sm:flex-nowrap">
          <span aria-label="Received">{received || "—"}</span>
          {fresh ? (
            <span
              aria-label="New application"
              className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-red-700"
            >
              NEW
            </span>
          ) : null}
        </div>
      </div>

      {/* Mid: equipment · CDL · years */}
      {metaTokens.length > 0 ? (
        <p className="mt-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-fg">
          {metaTokens.join(" · ")}
        </p>
      ) : null}

      {/* Sub: home base */}
      {homeBase ? (
        <p className="mt-0.5 text-[13px] text-fg/80">{homeBase}</p>
      ) : null}

      {/* Actions: Phone + Email + Trash */}
      <div className="mt-3 flex flex-wrap gap-2">
        {hasPhone ? (
          <a
            href={phoneHref}
            aria-label={`Call ${row.name}`}
            className="inline-flex items-center justify-center border-2 border-line bg-transparent px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-fg transition-colors hover:bg-canvas hover:text-fg"
          >
            <span aria-hidden className="mr-1.5">
              &#9742;
            </span>
            Phone
          </a>
        ) : null}
        {hasEmail ? (
          <a
            href={emailHref}
            aria-label={`Email ${row.name}`}
            className="inline-flex items-center justify-center border-2 border-line bg-transparent px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-fg transition-colors hover:bg-canvas hover:text-fg"
          >
            <span aria-hidden className="mr-1.5">
              &#9993;
            </span>
            Email
          </a>
        ) : null}
        <button
          type="button"
          onClick={onTrash}
          disabled={isPending}
          aria-label={`Move ${row.name} to trash`}
          className="ml-auto inline-flex items-center justify-center border-2 border-red-300 bg-transparent px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-red-700 transition-colors hover:bg-red-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Trash
        </button>
      </div>
    </li>
  );
}
