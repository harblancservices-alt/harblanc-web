"use client";

import { Button } from "@/components/tms-v2/ui/Button";
import { downloadCsv } from "@/lib/csv";
import type { RecurringExpenseRow } from "@/lib/data/recurring-expenses";
import { RECURRING_FREQUENCY_LABEL } from "@/lib/domain/expenses";

const HEADER = ["Vendor", "Category", "Description", "Amount", "Payment Method", "Frequency", "Next Charge", "Status", "Start Date", "End Date"];

function row(e: RecurringExpenseRow): string[] {
  return [
    e.vendor || e.name,
    e.category ?? "",
    e.notes ?? "",
    e.amount.toFixed(2),
    e.cardName ?? "",
    RECURRING_FREQUENCY_LABEL[e.frequency],
    e.nextChargeDateIso ?? "",
    e.archived ? "Archived" : "Active",
    e.startDate ?? "",
    e.endDate ?? "",
  ];
}

/** Downloads every row matching the ledger's current filters (not just the
 * displayed page) as CSV — same column set as legacy's ExpensesView
 * exportCsv(). */
export function ExportExpensesCsvButton({ rows }: { rows: RecurringExpenseRow[] }) {
  function onExport() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`expenses-${stamp}.csv`, HEADER, rows.map(row));
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={onExport} disabled={rows.length === 0}>
      Export CSV
    </Button>
  );
}
