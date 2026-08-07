"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DataList, type DataListColumn } from "@/components/tms-v2/ui/DataList";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { Money } from "@/components/tms-v2/ui/Money";
import { markLoadPaid, markLoadUnpaid } from "@/actions/tms-v2/loads";
import type { MutationResult } from "@/lib/demo/mutation";
import type { CarrierReceivableRow } from "@/lib/data/receivables";

const UNDO_WINDOW_MS = 4000;

/** Per-row Mark paid + a 4s inline Undo (same pattern as Today's Needs
 * Attention dismiss/undo) — closes the QA gap that Receivables had no
 * in-place undo. A load leaves the outstanding-A/R query the moment it's
 * paid, so without this the only recovery from a mis-tap was navigating
 * to Load Detail and toggling it back there. */
export function ReceivablesListClient({ rows }: { rows: CarrierReceivableRow[] }) {
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

      <DataList
        columns={columns}
        rows={visibleRows}
        rowKey={(r) => r.loadId}
        getHref={(r) => `/tms-v2/loads/${r.loadId}`}
        emptyMessage="No outstanding carrier receivables — every delivered or TONU'd load is paid."
      />
    </div>
  );
}
