"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { relativeTime } from "@/lib/admin/format";
import { softDeleteQuote, softDeleteQuotes } from "./actions";
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
            className="block w-full border border-line bg-card px-3 py-2 pr-10 text-[14px] text-fg placeholder:text-fg-subtle focus:border-line focus:outline-none"
            aria-label="Search quotes"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-fg"
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
            "inline-flex items-center justify-center border-2 border-line px-4 py-2 font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] transition-colors " +
            (selectMode
              ? "bg-canvas text-fg"
              : "bg-card text-fg hover:bg-canvas hover:text-fg")
          }
        >
          {selectMode ? "Select · on" : "Select"}
        </button>
      </div>

      {/* Bulk action bar — sticky when active */}
      {selectMode && selected.size > 0 ? (
        <div className="sticky top-0 z-20 mt-3 flex flex-wrap items-center justify-between gap-3 border border-line bg-[#fafaf6] px-4 py-2.5">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-fg">
            {selected.size} selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={bulkSoftDelete}
              disabled={isPending}
              className="inline-flex items-center border-2 border-red-300 bg-transparent px-3.5 py-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-red-700 transition-colors hover:bg-red-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Move to trash
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex items-center border border-line bg-card px-3.5 py-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-fg transition-colors hover:bg-[#f3f1e9]"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      {/* Filter chips */}
      <div className="mt-3 flex flex-wrap gap-1.5 border-b border-line pb-4 sm:gap-2">
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
              <div className="mt-3 space-y-2.5 sm:mt-4">
                {groups.needsAttention.map((row) => (
                  <LeadCard
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
          <div className="mt-6 border border-line/30 bg-[#fafaf6] px-4 py-6 text-center">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-fg-subtle">
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
                className="mt-3 inline-flex items-center border border-line bg-card px-3 py-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-fg transition-colors hover:bg-[#f3f1e9]"
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
    <div className="mt-2 flex items-center justify-between gap-3 border-b-2 border-line pb-2 pt-3 sm:pt-4">
      <div className="flex items-center gap-3">
        {showMarker ? (
          <span
            aria-hidden
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center bg-red-700 font-mono text-[14px] font-bold text-white sm:h-7 sm:w-7 sm:text-[15px]"
          >
            !
          </span>
        ) : null}
        <h2 className="font-mono text-[13px] font-bold uppercase tracking-[0.22em] text-fg sm:text-[15px]">
          {label}
        </h2>
        {count > 0 ? (
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-fg sm:text-[13px]">
            · {count} flagged
          </span>
        ) : (
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-fg-subtle sm:text-[12px]">
            · All clear
          </span>
        )}
      </div>
    </div>
  );
}

function MediumHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="mt-6 flex items-baseline justify-between gap-3 border-b border-line/30 pb-2">
      <div className="flex items-baseline gap-2">
        <h2 className="font-mono text-[11.5px] font-bold uppercase tracking-[0.22em] text-fg">
          {label}
        </h2>
        <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-fg">
          · {count}
        </span>
      </div>
    </div>
  );
}

function LightHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="mt-5 flex items-baseline justify-between gap-3 border-b border-line pb-1.5">
      <div className="flex items-baseline gap-2">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-fg">
          {label}
        </h2>
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-fg/65">
          · {count}
        </span>
      </div>
    </div>
  );
}

// ─── Lead card — standardized site card style ────────────────────
//
// One card shape for every lead (Needs-attention and Medium tiers), matching
// the cards used on the loads list, applications, broker loads, and the
// dashboard: rounded-md border border-line bg-card p-3 shadow-sm, a mono
// status pill, mono lane, muted freight, and a footer with Trash + Open lead.
// The urgency chip only shows when a lead is flagged; an alert-severity flag
// tints the card border red.

// Lead-status → pill colours, in the same family as the load-status pills.
const LEAD_PILL: Partial<Record<LeadStatus, string>> = {
  new: "bg-amber-100 text-amber-700",
  contacted: "bg-amber-100 text-amber-700",
  estimate_sent: "bg-blue-100 text-blue-700",
  awaiting_confirmation: "bg-blue-100 text-blue-700",
  awaiting_payment: "bg-indigo-100 text-indigo-700",
  ready_to_dispatch: "bg-green-100 text-green-700",
  dispatched: "bg-blue-100 text-blue-700",
  picked_up: "bg-blue-100 text-blue-700",
  in_transit: "bg-blue-100 text-blue-700",
  delivered: "bg-green-100 text-green-700",
  archived: "bg-elevated text-fg-muted",
  lost: "bg-elevated text-fg-muted",
};

function LeadCard({
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
  const alert = top?.severity === "alert";
  const pill = LEAD_PILL[row.lead_status] ?? "bg-elevated text-fg-muted";
  const href = `/admin/quotes/${row.id}`;

  return (
    <div
      className={
        "rounded-md border bg-card p-3 shadow-sm transition-colors " +
        (isSelected
          ? "border-line bg-elevated"
          : alert
            ? "border-red-200 hover:bg-elevated"
            : "border-line hover:bg-elevated")
      }
    >
      <div className="flex items-start gap-2.5">
        {selectMode ? (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onToggle(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-black"
            aria-label={`Select ${row.name}`}
          />
        ) : null}

        <Link href={href} className="block min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={
                  "shrink-0 rounded-sm px-1.5 py-[1px] font-mono text-[10px] font-bold uppercase tracking-[0.06em] " +
                  pill
                }
              >
                {LEAD_STATUS_LABELS[row.lead_status]}
              </span>
              <h3 className="truncate text-[14px] font-semibold text-fg">
                {row.name}
              </h3>
            </span>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-fg-subtle">
              {since}
            </span>
          </div>

          <p className="mt-1 truncate font-mono text-[12px] tabular-nums text-fg-muted">
            {lane}
          </p>

          {top || freight ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {top ? (
                <span
                  className={
                    "rounded-sm px-1.5 py-[1px] font-mono text-[10px] font-bold uppercase tracking-[0.06em] " +
                    (alert
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700")
                  }
                >
                  {top.label}
                </span>
              ) : null}
              {freight ? (
                <span className="truncate text-[11px] text-fg-muted">
                  {freight}
                </span>
              ) : null}
            </div>
          ) : null}
        </Link>
      </div>

      {selectMode ? null : (
        <div className="mt-2.5 flex items-center justify-end gap-2 border-t border-line pt-2.5">
          <button
            type="button"
            onClick={onTrash}
            disabled={isPending}
            className="rounded-md border border-red-300 bg-card px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`Move ${row.name} to trash`}
          >
            Trash
          </button>
          <Link
            href={href}
            className="rounded-md border border-red-700 bg-red-600 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-red-700"
          >
            Open lead →
          </Link>
        </div>
      )}
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
      <div className="mt-3 space-y-2.5 sm:mt-3.5">
        {rows.map((row) => (
          <LeadCard
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
        className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 border-t border-dashed border-line px-1 py-2.5 transition-colors hover:bg-[#f3f1e9] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:gap-x-4 sm:py-2"
      >
        <span className="truncate text-[14px] font-bold text-fg sm:text-[14.5px]">
          {row.name}
        </span>
        <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-fg sm:order-3 sm:text-right">
          {LEAD_STATUS_LABELS[row.lead_status]}
        </span>
        <span className="col-span-2 truncate font-mono text-[11.5px] font-bold tabular-nums text-fg sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:order-2">
          {lane}
        </span>
        <span className="font-mono text-[10.5px] font-bold tabular-nums text-fg sm:col-start-4 sm:order-4">
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
        className="mt-3 flex w-full items-center justify-between gap-3 border border-line/25 bg-[#fafaf6] px-4 py-2.5 transition-colors hover:bg-[#f3f1e9]"
        aria-expanded={expanded}
      >
        <div className="flex items-baseline gap-2">
          <span
            className={
              "font-mono text-[11px] font-bold uppercase tracking-[0.22em] " +
              (muted ? "text-fg-subtle" : "text-fg/65")
            }
          >
            {label}
          </span>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-fg-subtle">
            · {count}
          </span>
        </div>
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-fg">
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
          ? "border-line bg-canvas text-fg"
          : "border-line/40 bg-card text-fg hover:bg-[#f3f1e9]")
      }
    >
      <span>{label}</span>
      <span
        className={
          "font-mono text-[10px] font-bold tabular-nums " +
          (active ? "text-fg/85" : "text-fg/65")
        }
      >
        {count}
      </span>
    </button>
  );
}
