"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DataList, type DataListColumn } from "@/components/tms-v2/ui/DataList";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { Money } from "@/components/tms-v2/ui/Money";
import { markLoadPaid, markLoadUnpaid } from "@/actions/tms-v2/loads";
import { withReturnTo } from "@/lib/nav/return-to";
import type { MutationResult } from "@/lib/demo/mutation";
import type { CarrierReceivableRow } from "@/lib/data/receivables";

const UNDO_WINDOW_MS = 4000;

function initials(name: string | null): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Mobile's load-card treatment (Brent's ask: not the bare bordered DataList
 * row) — same rounded-card/avatar/trailing-amount family as LoadCard.tsx/
 * TripCard.tsx, sized to receivables' own fields. Whole card opens Load
 * Detail; Mark paid stops propagation, same pattern as the desktop row. */
function ReceivableCard({
  row,
  onMarkPaid,
  busy,
  fromPath,
}: {
  row: CarrierReceivableRow;
  onMarkPaid: () => void;
  busy: boolean;
  fromPath: string;
}) {
  return (
    <div className="relative rounded-xl border border-line bg-card p-3.5 shadow-e1 transition-shadow hover:shadow-e2">
      <Link
        href={withReturnTo(`/tms-v2/loads/${row.loadId}`, fromPath)}
        aria-label={`Open load ${row.loadNumber ?? row.loadId.slice(0, 8)}`}
        className="absolute inset-0 z-0"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-elevated text-[13px] font-semibold text-fg-muted">
            {initials(row.brokerName)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-fg">{row.brokerName ?? "No broker"}</p>
            <p className="truncate text-[12px] text-fg-muted">#{row.loadNumber ?? row.loadId.slice(0, 8)}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <Money value={row.amount} tone={row.overdue ? "negative" : "auto"} className="text-[14px] font-semibold" />
          <span className={`text-[11px] ${row.overdue ? "font-medium text-bad" : "text-fg-muted"}`}>
            {row.bucket === "unaged" ? "No delivery date" : `${row.daysOutstanding}d out`}
          </span>
        </div>
      </div>
      <div className="relative z-10 mt-3 flex justify-end" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onMarkPaid}
          disabled={busy}
          className="h-8 shrink-0 rounded-md border border-line-strong bg-card px-3 text-[12px] font-medium text-fg hover:bg-elevated disabled:opacity-50"
        >
          {busy ? "Saving…" : "Mark paid"}
        </button>
      </div>
    </div>
  );
}

/** Per-row Mark paid + a 4s inline Undo (same pattern as Today's Needs
 * Attention dismiss/undo) — closes the QA gap that Receivables had no
 * in-place undo. A load leaves the outstanding-A/R query the moment it's
 * paid, so without this the only recovery from a mis-tap was navigating
 * to Load Detail and toggling it back there. */
export function ReceivablesListClient({ rows, fromPath }: { rows: CarrierReceivableRow[]; fromPath: string }) {
  const router = useRouter();
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [pendingUndo, setPendingUndo] = useState<CarrierReceivableRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function onMarkPaid(row: CarrierReceivableRow) {
    setBusyId(row.loadId);
    setError(null);
    const result: MutationResult = await markLoadPaid(row.loadId);
    setBusyId(null);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setHiddenIds((prev) => new Set(prev).add(row.loadId));
    setPendingUndo(row);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => {
      setPendingUndo((cur) => (cur?.loadId === row.loadId ? null : cur));
    }, UNDO_WINDOW_MS);
    router.refresh();
  }

  async function onUndo() {
    if (!pendingUndo) return;
    const row = pendingUndo;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setPendingUndo(null);
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(row.loadId);
      return next;
    });
    const result: MutationResult = await markLoadUnpaid(row.loadId);
    if (!result.ok) setError(result.reason);
    router.refresh();
  }

  const columns: DataListColumn<CarrierReceivableRow>[] = [
    { key: "broker", header: "Broker", render: (r) => <span className="font-medium text-fg">{r.brokerName ?? "—"}</span> },
    { key: "loadNumber", header: "Load #", render: (r) => r.loadNumber ?? "—" },
    { key: "lane", header: "Lane", render: (r) => `${r.origin ?? "—"} → ${r.destination ?? "—"}`, hideOnMobile: true },
    {
      key: "delivery",
      header: "Delivered",
      render: (r) => (r.deliveryDate ? <DateTimeCST value={r.deliveryDate} mode="date" /> : "—"),
      hideOnMobile: true,
    },
    {
      key: "days",
      header: "Days out",
      render: (r) => <span className={r.overdue ? "font-medium text-bad" : "text-fg"}>{r.bucket === "unaged" ? "—" : r.daysOutstanding}</span>,
      align: "right",
    },
    { key: "amount", header: "Amount", render: (r) => <Money value={r.amount} tone={r.overdue ? "negative" : "auto"} />, align: "right" },
    {
      key: "markPaid",
      header: "",
      render: (r) => (
        <div className="flex flex-col items-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onMarkPaid(r);
            }}
            disabled={busyId === r.loadId}
            className="h-7 shrink-0 rounded-md border border-line-strong bg-card px-2.5 text-[12px] font-medium text-fg hover:bg-elevated disabled:opacity-50"
          >
            {busyId === r.loadId ? "Saving…" : "Mark paid"}
          </button>
        </div>
      ),
      align: "right",
    },
  ];

  const visibleRows = rows.filter((r) => !hiddenIds.has(r.loadId));

  return (
    <div className="flex flex-col gap-3">
      {pendingUndo ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-line-strong bg-elevated px-3 py-2 text-[13px]">
          <span className="text-fg-muted">
            Marked load {pendingUndo.loadNumber ?? pendingUndo.loadId.slice(0, 8)} paid
          </span>
          <button type="button" onClick={onUndo} className="font-medium text-accent hover:underline">
            Undo
          </button>
        </div>
      ) : null}
      {error ? <p className="text-[13px] font-medium text-bad">{error}</p> : null}

      {/* Mobile — load-card list, not the bare DataList row. */}
      <div className="flex flex-col gap-2.5 lg:hidden">
        {visibleRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong bg-card px-4 py-10 text-center shadow-e1">
            <p className="text-[13px] text-fg-muted">No outstanding carrier receivables — every delivered or TONU'd load is paid.</p>
          </div>
        ) : (
          visibleRows.map((r) => (
            <ReceivableCard key={r.loadId} row={r} busy={busyId === r.loadId} onMarkPaid={() => onMarkPaid(r)} fromPath={fromPath} />
          ))
        )}
      </div>

      {/* Desktop — unchanged DataList table. */}
      <div className="hidden lg:block">
        <DataList
          columns={columns}
          rows={visibleRows}
          rowKey={(r) => r.loadId}
          getHref={(r) => withReturnTo(`/tms-v2/loads/${r.loadId}`, fromPath)}
          emptyMessage="No outstanding carrier receivables — every delivered or TONU'd load is paid."
        />
      </div>
    </div>
  );
}
