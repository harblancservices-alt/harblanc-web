"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { StatusTag, type StatusTone } from "@/components/ui/StatusTag";
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

export function QuoteListTable({ rows }: { rows: QuoteListRow[] }) {
  const [searchQuery, setSearchQuery] = useState("");
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

  const hasAnyResult =
    groups.needsAttention.length > 0 ||
    groups.newLeads.length > 0 ||
    groups.estAwaiting.length > 0 ||
    groups.awaitingPay.length > 0 ||
    groups.readyToDispatch.length > 0 ||
    groups.inMotion.length > 0 ||
    groups.delivered.length > 0 ||
    groups.archivedOrLost.length > 0;

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
            className="block w-full rounded-md border border-line-strong bg-card px-3 py-2 pr-10 text-[14px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/40"
            aria-label="Search quotes"
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
        <Button
          variant={selectMode ? "cancel" : "destructive"}
          type="button"
          onClick={toggleSelectMode}
        >
          {selectMode ? "Select · on" : "Select"}
        </Button>
      </div>

      {/* Bulk action bar — sticky when active */}
      {selectMode && selected.size > 0 ? (
        <div className="sticky top-0 z-20 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-inset px-4 py-2.5 shadow-e1">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-ink">
            {selected.size} selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              type="button"
              onClick={bulkSoftDelete}
              disabled={isPending}
            >
              Move to trash
            </Button>
            <Button
              variant="cancel"
              size="sm"
              type="button"
              onClick={clearSelection}
            >
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      {/* Feed — all active leads, grouped (no filter pills) */}
      <div className="mt-4 border-t border-line pt-4 sm:mt-5">
        {/* ── Tier 1 · Needs Attention ── */}
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

        {/* ── Tier 2 medium groups ── */}
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

        {/* ── Tier 3 · In motion ── */}
        <CompactGroup
          label="In motion"
          count={groups.inMotion.length}
          rows={groups.inMotion}
        />

        {/* ── Tier 4 · Collapsed history ── */}
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

        {/* Empty state when nothing renders */}
        {!hasAnyResult ? (
          <div className="mt-6 rounded-md border border-dashed border-line-strong bg-card px-4 py-8 text-center shadow-e1">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-ink-3">
              {searchQuery.trim().length > 0
                ? "No leads match your search"
                : "No active leads."}
            </p>
            {searchQuery.trim().length > 0 ? (
              <Button
                variant="cancel"
                size="sm"
                type="button"
                onClick={() => setSearchQuery("")}
                className="mt-3"
              >
                Clear search
              </Button>
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
    <div className="mt-2 flex items-center justify-between gap-3 border-b-2 border-line-strong pb-2 pt-3 sm:pt-4">
      <div className="flex items-center gap-3">
        {showMarker ? (
          <span
            aria-hidden
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-bad font-mono text-[14px] font-bold text-white sm:h-7 sm:w-7 sm:text-[15px]"
          >
            !
          </span>
        ) : null}
        <h2 className="font-mono text-[13px] font-bold uppercase tracking-[0.22em] text-ink sm:text-[15px]">
          {label}
        </h2>
        {count > 0 ? (
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-ink-2 sm:text-[13px]">
            · {count} flagged
          </span>
        ) : (
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-ink-3 sm:text-[12px]">
            · All clear
          </span>
        )}
      </div>
    </div>
  );
}

function MediumHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="mt-6 flex items-baseline justify-between gap-3 border-b border-line pb-2">
      <div className="flex items-baseline gap-2">
        <h2 className="font-mono text-[11.5px] font-bold uppercase tracking-[0.22em] text-ink">
          {label}
        </h2>
        <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-ink-3">
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
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-ink">
          {label}
        </h2>
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
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

// Lead-status → V2 StatusTag tone, in the same family as the load-status tags.
const LEAD_TONE: Partial<Record<LeadStatus, StatusTone>> = {
  new: "amber",
  contacted: "amber",
  estimate_sent: "steel",
  awaiting_confirmation: "steel",
  awaiting_payment: "steel",
  ready_to_dispatch: "green",
  dispatched: "steel",
  picked_up: "steel",
  in_transit: "steel",
  delivered: "green",
  archived: "slate",
  lost: "slate",
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
  const tone: StatusTone = LEAD_TONE[row.lead_status] ?? "slate";
  const href = `/admin/quotes/${row.id}`;

  return (
    <div
      className={
        "rounded-md border bg-card p-3 shadow-e1 transition-colors " +
        (isSelected
          ? "border-line bg-inset"
          : alert
            ? "border-bad/40 hover:bg-inset"
            : "border-line hover:bg-inset")
      }
    >
      <div className="flex items-start gap-2.5">
        {selectMode ? (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onToggle(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-accent"
            aria-label={`Select ${row.name}`}
          />
        ) : null}

        <Link href={href} className="block min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <StatusTag tone={tone} hideDot className="shrink-0">
                {LEAD_STATUS_LABELS[row.lead_status]}
              </StatusTag>
              <h3 className="truncate text-[14px] font-semibold text-ink">
                {row.name}
              </h3>
            </span>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-fg-subtle">
              {since}
            </span>
          </div>

          <p className="mt-1 truncate font-mono text-[12px] tabular-nums text-ink-2">
            {lane}
          </p>

          {top || freight ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {top ? (
                <StatusTag tone={alert ? "red" : "amber"} hideDot>
                  {top.label}
                </StatusTag>
              ) : null}
              {freight ? (
                <span className="truncate text-[11px] text-ink-2">
                  {freight}
                </span>
              ) : null}
            </div>
          ) : null}
        </Link>
      </div>

      {selectMode ? null : (
        <div className="mt-2.5 flex items-center justify-end gap-2 border-t border-line pt-2.5">
          <Button
            variant="destructive"
            size="sm"
            type="button"
            onClick={onTrash}
            disabled={isPending}
            aria-label={`Move ${row.name} to trash`}
          >
            Trash
          </Button>
          <Button variant="navigate" size="sm" href={href}>
            Open lead →
          </Button>
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
        className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 border-t border-dashed border-line px-1 py-2.5 transition-colors hover:bg-inset sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:gap-x-4 sm:py-2"
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
        className="mt-3 flex w-full items-center justify-between gap-3 rounded-md border border-line bg-inset px-4 py-2.5 transition-colors hover:bg-card"
        aria-expanded={expanded}
      >
        <div className="flex items-baseline gap-2">
          <span
            className={
              "font-mono text-[11px] font-bold uppercase tracking-[0.22em] " +
              (muted ? "text-ink-3" : "text-ink-2")
            }
          >
            {label}
          </span>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
            · {count}
          </span>
        </div>
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-accent">
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

