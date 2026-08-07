"use client";

import { Button } from "@/components/tms-v2/ui/Button";
import { downloadCsv } from "@/lib/csv";
import type { LoadWithFinancials } from "@/lib/data/loads";

const HEADER = ["Load #", "Broker", "Origin", "Destination", "Pickup", "Delivery", "Trip", "Status", "Rate", "Net"];

function row(l: LoadWithFinancials): string[] {
  return [
    l.loadNumber ?? l.id.slice(0, 8),
    l.brokerName ?? "",
    l.origin ?? "",
    l.destination ?? "",
    l.pickupDate ?? "",
    l.deliveryDate ?? "",
    l.tripName ?? "",
    l.status,
    l.financials.gross.toFixed(2),
    l.financials.net.toFixed(2),
  ];
}

/** Downloads the currently-visible (period + filter scoped) rows as CSV —
 * same slice the board shows, same figures, matching legacy's LoadBoardView
 * exportCsv() but reading directly off tms-v2's own LoadWithFinancials
 * rows instead of a separate admin-only card shape. */
export function ExportLoadsCsvButton({ rows }: { rows: LoadWithFinancials[] }) {
  function onExport() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`load-board-${stamp}.csv`, HEADER, rows.map(row));
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={onExport} disabled={rows.length === 0}>
      Export CSV
    </Button>
  );
}
