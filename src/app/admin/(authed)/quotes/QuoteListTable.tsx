"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { relativeTime } from "@/lib/admin/format";
import { softDeleteQuote, softDeleteQuotes } from "./actions";
import { StatusBadge } from "./StatusBadge";
import {
  LEAD_STATUS_LABELS,
  type LeadStatus,
} from "@/lib/dispatch/status";
import { type UrgencyChip } from "@/lib/dispatch/urgency";

/**
 * Level 6.3 — Active Leads workflow feed.
 *
 * Replaces the 9-col grid table with a single-column grouped feed of
 * lead cards. Four visual tiers (per 6.2B):
 *
 *   1. Needs Attention  — heavy white cards, big name + lane, solid
 *                         black OPEN LEAD button, red `!` corner mark.
 *   2. Medium           — New / Estimate sent / Awaiting pay / Ready
 *                         to dispatch. Standard cards with text link.
 *   3. Compact rows     — In motion. One line per lead, no card chrome.
 *   4. Collapsed        — Delivered / Archived+Lost. Header only by
 *                         default; expand with `+ Show`.
 *
 * Group membership: a lead appears in exactly ONE group. Urgency wins
 * over status — a flagged lead lives in Needs Attention until the
 * urgency clears, then it moves to its status group on next render.
 *
 * Filter chips replace the status `<select>`. Select-mode toggle adds
 * checkboxes + a sticky bulk-action bar. Search predicate unchanged.
 */

export type QuoteListRow = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  phone: string;
  commodity: string;
  weight: string;
  lead_status: LeadStatus;
  lead_status_updated_at: string | null;
  pickup_zip: string | null;
  delivery_zip: string | null;
  urgencyChips: UrgencyChip[];
  topUrgency: UrgencyChip | null;
};

type FilterChip =
  | "all"
  | "needs"
  | "new"
  | "est"
  | "pay"
  | "ready"
  | "motion";

const NEW_STATUSES: LeadStatus[] = ["new", "contacted"];
const EST_STATUSES: LeadStatus[] = ["estimate_sent", "awaiting_confirmation"];
const MOTION_STATUSES: LeadStatus[] = ["dispatched", "picked_up", "in_transit"];

function sinceLabel(row: QuoteListRow): string {
  return row.lead_status_updated_at
    ? relativeTime(row.lead_status_updated_at)
    : relativeTime(row.created_at);
}

function laneLabel(row: QuoteListRow): string {
  if (row.pickup_zip && row.delivery_zip) {
    return `${row.pickup_zip} → ${row.delivery_zip}`;
  }
  return "Lane TBD";
}

function freightLabel(row: QuoteListRow): string {
  const parts = [row.commodity, row.weight].filter(
    (s) => s && s.trim().length > 0,
  );
  return parts.join(" · ");
}

function byMostRecentlyTouched(a: QuoteListRow, b: QuoteListRow): number {
  const at =
    new Date(a.lead_status_updated_at ?? a.created_at).getTime() || 0;
  const bt =
    new Date(b.lead_status_updated_at ?? b.created_at).getTime() || 0;
  return bt - at;
}

function byAttentionPriority(a: QuoteListRow, b: QuoteListRow): number {
  const sevA = a.topUrgency?.severity === "alert" ? 0 : 1;
  const sevB = b.topUrgency?.severity === "alert" ? 0 : 1;
  if (sevA !== sevB) return sevA - sevB;
  const ageA = a.topUrgency?.ageHours ?? 0;
  const ageB = b.topUrgency?.ageHours ?? 0;
  return ageB - ageA;
}

export function QuoteListTable({
  rows,
  initialFilter = "all",
}: {
  rows: QuoteListRow[];
  /** Level 8.1: optional URL-driven initial filter from /admin/quotes
   *  ?filter=… (set when arriving from a Dashboard counter link). Falls
   *  back to "all" when omitted or unknown. */
  initialFilter?: string;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterChip, setFilterChip] = useState<FilterChip>(() => {
    // Narrow the loose string param to the FilterChip union here so the
    // useState initializer type-checks. Anything else falls through to
    // "all".
    const allowed: FilterChip[] = [
      "all",
      "needs",
      "new",
      "est",
      "pay",
      "ready",
      "motion",
    ];
    return (allowed as string[]).includes(initialFilter)
      ? (initialFilter as FilterChip)
      : "all";
  });
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [deliveredExpanded, setDeliveredExpanded] = useState(false);
  const [archivedExpanded, setArchivedExpanded] = useState(false);

  // ── Search pass ──────────────────────────────────────────────
  const searched = useMemo(() => {
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

  // ── Group splits — urgency wins over status ─────────────────
  const groups = useMemo(() => {
    const needsAttention: QuoteListRow[] = [];
    const newLeads: QuoteListRow[] = [];
    const estAwaiting: QuoteListRow[] = [];
    const awaitingPay: QuoteListRow[] = [];
    const readyToDispatch: QuoteListRow[] = [];
    const inMotion: QuoteListRow[] = [];
    const delivered: QuoteListRow[] = [];
    const archivedOrLost: QuoteListRow[] = [];

    for (const r of searched) {
      if (r.topUrgency !== null) {
        needsAttention.push(r);
        continue;
      }
      if (NEW_STATUSES.includes(r.lead_status)) newLeads.push(r);
      else if (EST_STATUSES.includes(r.lead_status)) estAwaiting.push(r);
      else if (r.lead_status === "awaiting_payment") awaitingPay.push(r);
      else if (r.lead_status === "ready_to_dispatch") readyToDispatch.push(r);
      else if (MOTION_STATUSES.includes(r.lead_status)) inMotion.push(r);
      else if (r.lead_status === "delivered") delivered.push(r);
      else if (
        r.lead_status === "archived" ||
        r.lead_status === "lost"
      )
        archivedOrLost.push(r);
    }

    needsAttention.sort(byAttentionPriority);
    newLeads.sort(byMostRecentlyTouched);
    estAwaiting.sort(byMostRecentlyTouched);
    awaitingPay.sort(byMostRecentlyTouched);
    readyToDispatch.sort(byMostRecentlyTouched);
    inMotion.sort(byMostRecentlyTouched);
    delivered.sort(byMostRecentlyTouched);
    archivedOrLost.sort(byMostRecentlyTouched);

    return {
      needsAttention,
      newLeads,
      estAwaiting,
      awaitingPay,
      readyToDispatch,
      inMotion,
      delivered,
      archivedOrLost,
    };
  }, [searched]);

  // ── Chip filter mask ─────────────────────────────────────────
  const showAll = filterChip === "all";
  const showNeeds = showAll || filterChip === "needs";
  const showNew = showAll || filterChip === "new";
  const showEst = showAll || filterChip === "est";
  const showPay = showAll || filterChip === "pay";
  const showReady = showAll || filterChip === "ready";
  const showMotion = showAll || filterChip === "motion";

  const hasAnyResult =
    (showNeeds && groups.needsAttention.length > 0) ||
    (showNew && groups.newLeads.length > 0) ||
    (showEst && groups.estAwaiting.length > 0) ||
    (showPay && groups.awaitingPay.length > 0) ||
    (showReady && groups.readyToDispatch.length > 0) ||
    (showMotion && groups.inMotion.length > 0) ||
    (showAll &&
      (groups.delivered.length > 0 || groups.archivedOrLost.length > 0));

  function toggleRow(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function toggleSelectMode() {
    setSelectMode((prev) => {
      const next = !prev;
      if (!next) setSelected(new Set());
      return next;
    });
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
        alert(`Failed: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    });
  }

  function rowSoftDelete(row: QuoteListRow) {
    if (!confirm(`Move "${row.name}" to trash?`)) return;
    startTransition(async () => {
      try {
        await softDeleteQuote(row.id);
      } catch (e) {
        alert(`Failed: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    });
  }

  return (
    <div className="mt-4">
      {/* Search + Select toggle row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-2">
        <div className="relative flex-1">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, lane, commodity, ID..."
            className="block w-full border border-black bg-white px-3 py-2 pr-10 text-[14px] text-black placeholder:text-black/55 focus:border-black focus:outline-none"
            aria-label="Search quotes"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-black"
              aria-label="Clear search"
            >
              ×
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={toggleSelectMode}
          className={
            "inline-flex items-center justify-center border-2 border-black px-4 py-2 font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] transition-colors " +
            (selectMode
              ? "bg-black text-white"
              : "bg-white text-black hover:bg-black hover:text-white")
          }
        >
          {selectMode ? "Select · on" : "Select"}
        </button>
      </div>

      {/* Bulk action bar — sticky when active */}
      {selectMode && selected.size > 0 ? (
        <div className="sticky top-0 z-20 mt-3 flex flex-wrap items-center justify-between gap-3 border border-black bg-[#fafaf6] px-4 py-2.5">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-black">
            {selected.size} selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={bulkSoftDelete}
              disabled={isPending}
              className="inline-flex items-center border-2 border-red-700 bg-transparent px-3.5 py-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-red-700 transition-colors hover:bg-red-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Move to trash
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex items-center border border-black bg-white px-3.5 py-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-black transition-colors hover:bg-[#f3f1e9]"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      {/* Filter chips */}
      <div className="mt-3 flex flex-wrap gap-1.5 border-b border-black/15 pb-4 sm:gap-2">
        <FilterChipBtn
          label="All"
          count={searched.length}
          active={filterChip === "all"}
          onClick={() => setFilterChip("all")}
        />
        <FilterChipBtn
          label="Needs attn"
          count={groups.needsAttention.length}
          active={filterChip === "needs"}
          onClick={() => setFilterChip("needs")}
        />
        <FilterChipBtn
          label="New"
          count={groups.newLeads.length}
          active={filterChip === "new"}
          onClick={() => setFilterChip("new")}
        />
        <FilterChipBtn
          label="Est sent"
          count={groups.estAwaiting.length}
          active={filterChip === "est"}
          onClick={() => setFilterChip("est")}
        />
        <FilterChipBtn
          label="Awaiting pay"
          count={groups.awaitingPay.length}
          active={filterChip === "pay"}
          onClick={() => setFilterChip("pay")}
        />
        <FilterChipBtn
          label="Ready"
          count={groups.readyToDispatch.length}
          active={filterChip === "ready"}
          onClick={() => setFilterChip("ready")}
        />
        <FilterChipBtn
          label="In motion"
          count={groups.inMotion.length}
          active={filterChip === "motion"}
          onClick={() => setFilterChip("motion")}
        />
      </div>

      {/* Feed */}
      <div className="mt-4 sm:mt-5">
        {/* ── Tier 1 · Needs Attention ── */}
        {showNeeds ? (
          <>
            <HeavyHeader
              label="Needs attention"
              count={groups.needsAttention.length}
              showMarker
            />
            {groups.needsAttention.length > 0 ? (
              <div className="mt-3 space-y-3 sm:mt-4 sm:space-y-4">
                {groups.needsAttention.map((row) => (
                  <AttentionCard
                    key={row.id}
                    row={row}
                    selectMode={selectMode}
                    isSelected={selected.has(row.id)}
                    onToggle={(v) => toggleRow(row.id, v)}
                    onTrash={() => rowSoftDelete(row)}
                    isPending={isPending}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        {/* ── Tier 2 medium groups ── */}
        {showNew ? (
          <MediumGroup
            label="New"
            count={groups.newLeads.length}
            rows={groups.newLeads}
            selectMode={selectMode}
            selected={selected}
            onToggle={toggleRow}
            onTrash={rowSoftDelete}
            isPending={isPending}
          />
        ) : null}
        {showEst ? (
          <MediumGroup
            label="Estimate sent · awaiting customer"
            count={groups.estAwaiting.length}
            rows={groups.estAwaiting}
            selectMode={selectMode}
            selected={selected}
            onToggle={toggleRow}
            onTrash={rowSoftDelete}
            isPending={isPending}
          />
        ) : null}
        {showPay ? (
          <MediumGroup
            label="Awaiting payment"
            count={groups.awaitingPay.length}
            rows={groups.awaitingPay}
            selectMode={selectMode}
            selected={selected}
            onToggle={toggleRow}
            onTrash={rowSoftDelete}
            isPending={isPending}
          />
        ) : null}
        {showReady ? (
          <MediumGroup
            label="Ready to dispatch"
            count={groups.readyToDispatch.length}
            rows={groups.readyToDispatch}
            selectMode={selectMode}
            selected={selected}
            onToggle={toggleRow}
            onTrash={rowSoftDelete}
            isPending={isPending}
          />
        ) : null}

        {/* ── Tier 3 · In motion ── */}
        {showMotion ? (
          <CompactGroup
            label="In motion"
            count={groups.inMotion.length}
            rows={groups.inMotion}
          />
        ) : null}

        {/* ── Tier 4 · Collapsed history ── */}
        {showAll ? (
          <>
            <CollapsibleSection
              label="Delivered"
              count={groups.delivered.length}
              expanded={deliveredExpanded}
              onToggle={() => setDeliveredExpanded((v) => !v)}
              rows={groups.delivered}
            />
            <CollapsibleSection
              label="Archived · Lost"
              count={groups.archivedOrLost.length}
              expanded={archivedExpanded}
              onToggle={() => setArchivedExpanded((v) => !v)}
              rows={groups.archivedOrLost}
              muted
            />
          </>
        ) : null}

        {/* Empty state when nothing renders */}
        {!hasAnyResult ? (
          <div className="mt-6 border border-black/30 bg-[#fafaf6] px-4 py-6 text-center">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-black/55">
              {searchQuery.trim().length > 0
                ? "No leads match your search"
                : "No leads in this view"}
            </p>
            {searchQuery.trim().length > 0 || filterChip !== "all" ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setFilterChip("all");
                }}
                className="mt-3 inline-flex items-center border border-black bg-white px-3 py-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-black transition-colors hover:bg-[#f3f1e9]"
              >
                Clear filters
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Headers ──────────────────────────────────────────────────────

function HeavyHeader({
  label,
  count,
  showMarker = false,
}: {
  label: string;
  count: number;
  showMarker?: boolean;
}) {
  return (
    <div className="mt-2 flex items-center justify-between gap-3 border-b-2 border-black pb-2 pt-3 sm:pt-4">
      <div className="flex items-center gap-3">
        {showMarker ? (
          <span
            aria-hidden
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center bg-red-700 font-mono text-[14px] font-bold text-white sm:h-7 sm:w-7 sm:text-[15px]"
          >
            !
          </span>
        ) : null}
        <h2 className="font-mono text-[13px] font-bold uppercase tracking-[0.22em] text-black sm:text-[15px]">
          {label}
        </h2>
        {count > 0 ? (
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-black sm:text-[13px]">
            · {count} flagged
          </span>
        ) : (
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-black/55 sm:text-[12px]">
            · All clear
          </span>
        )}
      </div>
    </div>
  );
}

function MediumHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="mt-6 flex items-baseline justify-between gap-3 border-b border-black/30 pb-2">
      <div className="flex items-baseline gap-2">
        <h2 className="font-mono text-[11.5px] font-bold uppercase tracking-[0.22em] text-black">
          {label}
        </h2>
        <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-black">
          · {count}
        </span>
      </div>
    </div>
  );
}

function LightHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="mt-5 flex items-baseline justify-between gap-3 border-b border-black/15 pb-1.5">
      <div className="flex items-baseline gap-2">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-black">
          {label}
        </h2>
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-black/65">
          · {count}
        </span>
      </div>
    </div>
  );
}

// ─── Tier 1 · Attention card ─────────────────────────────────────

function AttentionCard({
  row,
  selectMode,
  isSelected,
  onToggle,
  onTrash,
  isPending,
}: {
  row: QuoteListRow;
  selectMode: boolean;
  isSelected: boolean;
  onToggle: (v: boolean) => void;
  onTrash: () => void;
  isPending: boolean;
}) {
  const lane = laneLabel(row);
  const since = sinceLabel(row);
  const freight = freightLabel(row);
  const top = row.topUrgency;
  const urgencyCls =
    top?.severity === "alert"
      ? "border border-red-700 text-red-700"
      : "border border-black text-black";

  return (
    <div
      className={
        "relative border-2 border-black bg-white px-5 py-4 transition-colors sm:px-6 sm:py-5 " +
        (isSelected ? "bg-[#f3f1e9]" : "hover:bg-[#fafaf6]")
      }
    >
      {/* Red corner mark — admin palette sanctioned alert signal */}
      <span
        aria-hidden
        className="pointer-events-none absolute -left-0.5 -top-0.5 inline-block h-4 w-4 bg-red-700"
      />

      <div className="flex items-start justify-between gap-4">
        {selectMode ? (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onToggle(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            className="mt-2 h-4 w-4 shrink-0 cursor-pointer accent-black"
            aria-label={`Select ${row.name}`}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <Link href={`/admin/quotes/${row.id}`} className="block">
            <h3 className="truncate text-[22px] font-bold leading-tight text-black sm:text-[26px]">
              {row.name}
            </h3>
          </Link>
        </div>
        <p className="shrink-0 pt-1 font-mono text-[12px] font-bold tabular-nums text-black sm:text-[13px]">
          {since}
        </p>
      </div>

      {/* Lane zone */}
      <Link href={`/admin/quotes/${row.id}`} className="block">
        <div className="mt-3 flex items-baseline gap-3 border-t border-dashed border-black/20 pt-3">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-black">
            Lane
          </span>
          <span className="truncate font-mono text-[18px] font-bold tabular-nums text-black sm:text-[22px]">
            {lane}
          </span>
        </div>
      </Link>

      {/* Action zone */}
      <div className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center bg-black px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-white shadow-[inset_0_0_0_1.5px_#fff]">
            {LEAD_STATUS_LABELS[row.lead_status]}
          </span>
          {top ? (
            <span
              className={
                "inline-flex items-center bg-white px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] " +
                urgencyCls
              }
            >
              {top.label}
            </span>
          ) : null}
          {freight ? (
            <span className="inline-flex items-center border border-black/40 bg-white px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-black">
              {freight}
            </span>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2">
          {selectMode ? null : (
            <button
              type="button"
              onClick={onTrash}
              disabled={isPending}
              className="inline-flex items-center border border-black bg-white px-3 py-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-black transition-colors hover:bg-[#f3f1e9] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={`Move ${row.name} to trash`}
            >
              Trash
            </button>
          )}
          <Link
            href={`/admin/quotes/${row.id}`}
            className="inline-flex items-center bg-black px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-white shadow-[inset_0_0_0_2.5px_#ffffff] transition-colors hover:bg-zinc-800"
          >
            Open lead →
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Tier 2 · Medium card group ─────────────────────────────────

function MediumGroup({
  label,
  count,
  rows,
  selectMode,
  selected,
  onToggle,
  onTrash,
  isPending,
}: {
  label: string;
  count: number;
  rows: QuoteListRow[];
  selectMode: boolean;
  selected: Set<string>;
  onToggle: (id: string, v: boolean) => void;
  onTrash: (row: QuoteListRow) => void;
  isPending: boolean;
}) {
  if (count === 0) return null;
  return (
    <>
      <MediumHeader label={label} count={count} />
      <div className="mt-3 space-y-2 sm:mt-3.5">
        {rows.map((row) => (
          <MediumCard
            key={row.id}
            row={row}
            selectMode={selectMode}
            isSelected={selected.has(row.id)}
            onToggle={(v) => onToggle(row.id, v)}
            onTrash={() => onTrash(row)}
            isPending={isPending}
          />
        ))}
      </div>
    </>
  );
}

function MediumCard({
  row,
  selectMode,
  isSelected,
  onToggle,
  onTrash,
  isPending,
}: {
  row: QuoteListRow;
  selectMode: boolean;
  isSelected: boolean;
  onToggle: (v: boolean) => void;
  onTrash: () => void;
  isPending: boolean;
}) {
  const lane = laneLabel(row);
  const since = sinceLabel(row);
  const freight = freightLabel(row);

  return (
    <div
      className={
        "border border-black bg-white px-4 py-3 transition-colors sm:px-4 sm:py-3.5 " +
        (isSelected ? "bg-[#f3f1e9]" : "hover:bg-[#fafaf6]")
      }
    >
      <div className="flex items-start justify-between gap-3">
        {selectMode ? (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onToggle(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            className="mt-1.5 h-4 w-4 shrink-0 cursor-pointer accent-black"
            aria-label={`Select ${row.name}`}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <Link href={`/admin/quotes/${row.id}`} className="block">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="truncate text-[15.5px] font-bold leading-tight text-black sm:text-[17px]">
                {row.name}
              </h3>
              <p className="shrink-0 font-mono text-[11px] font-bold tabular-nums text-black">
                {since}
              </p>
            </div>
            <p className="mt-1 truncate font-mono text-[12.5px] font-bold tabular-nums text-black sm:text-[13px]">
              {lane}
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={row.lead_status} />
                {freight ? (
                  <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-black">
                    {freight}
                  </span>
                ) : null}
              </div>
              <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-black">
                Open →
              </span>
            </div>
          </Link>
        </div>
        {selectMode ? null : (
          <button
            type="button"
            onClick={onTrash}
            disabled={isPending}
            className="shrink-0 self-start font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-black/55 transition-colors hover:text-black disabled:opacity-50"
            aria-label={`Move ${row.name} to trash`}
            title="Move to trash"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Tier 3 · Compact rows (In motion) ───────────────────────────

function CompactGroup({
  label,
  count,
  rows,
}: {
  label: string;
  count: number;
  rows: QuoteListRow[];
}) {
  if (count === 0) return null;
  return (
    <>
      <LightHeader label={label} count={count} />
      <ul className="mt-1">
        {rows.map((row) => (
          <CompactRow key={row.id} row={row} />
        ))}
      </ul>
    </>
  );
}

function CompactRow({ row }: { row: QuoteListRow }) {
  const lane = laneLabel(row);
  const since = sinceLabel(row);
  return (
    <li>
      <Link
        href={`/admin/quotes/${row.id}`}
        className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 border-t border-dashed border-black/15 px-1 py-2.5 transition-colors hover:bg-[#f3f1e9] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:gap-x-4 sm:py-2"
      >
        <span className="truncate text-[14px] font-bold text-black sm:text-[14.5px]">
          {row.name}
        </span>
        <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-black sm:order-3 sm:text-right">
          {LEAD_STATUS_LABELS[row.lead_status]}
        </span>
        <span className="col-span-2 truncate font-mono text-[11.5px] font-bold tabular-nums text-black sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:order-2">
          {lane}
        </span>
        <span className="font-mono text-[10.5px] font-bold tabular-nums text-black sm:col-start-4 sm:order-4">
          {since}
        </span>
      </Link>
    </li>
  );
}

// ─── Tier 4 · Collapsed history ──────────────────────────────────

function CollapsibleSection({
  label,
  count,
  expanded,
  onToggle,
  rows,
  muted = false,
}: {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  rows: QuoteListRow[];
  muted?: boolean;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className="mt-3 flex w-full items-center justify-between gap-3 border border-black/25 bg-[#fafaf6] px-4 py-2.5 transition-colors hover:bg-[#f3f1e9]"
        aria-expanded={expanded}
      >
        <div className="flex items-baseline gap-2">
          <span
            className={
              "font-mono text-[11px] font-bold uppercase tracking-[0.22em] " +
              (muted ? "text-black/55" : "text-black/65")
            }
          >
            {label}
          </span>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-black/55">
            · {count}
          </span>
        </div>
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-black">
          {expanded ? "− Hide" : "+ Show"}
        </span>
      </button>
      {expanded && rows.length > 0 ? (
        <ul className="mt-1">
          {rows.map((row) => (
            <CompactRow key={row.id} row={row} />
          ))}
        </ul>
      ) : null}
    </>
  );
}

// ─── Filter chip button ─────────────────────────────────────────

function FilterChipBtn({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] transition-colors " +
        (active
          ? "border-black bg-black text-white"
          : "border-black/40 bg-white text-black hover:bg-[#f3f1e9]")
      }
    >
      <span>{label}</span>
      <span
        className={
          "font-mono text-[10px] font-bold tabular-nums " +
          (active ? "text-white/85" : "text-black/65")
        }
      >
        {count}
      </span>
    </button>
  );
}
