import { DataList, type DataListColumn, type DataListSort } from "@/components/tms-v2/ui/DataList";
import { Money } from "@/components/tms-v2/ui/Money";
import { StatusPill } from "@/components/tms-v2/ui/StatusPill";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { formatMoney } from "@/lib/domain/money";
import { rpm } from "@/lib/dispatch/format";
import type { LoadWithFinancials } from "@/lib/data/loads";
import type { PeriodSummary } from "@/lib/dispatch/performance";

/**
 * The desktop Load Board's dense data table (Brent's approved mockup,
 * 2026-08-08) — DataList's existing sortable-header/zebra/hover table half,
 * used exactly as built (v2-architecture.md §2 house rule #5: one list
 * primitive), just wrapped in `hidden lg:block` here so it never competes
 * with the untouched mobile LoadCard grid. All money/miles come straight
 * off each row's already-computed `financials` (lib/domain/money.ts's
 * computeLoadNet, via listLoads()) — no second calculation, only display
 * formatting.
 */
export function LoadBoardDesktopTable({
  loads,
  sort,
  summary,
  periodLabel,
  getHref,
}: {
  loads: LoadWithFinancials[];
  sort: DataListSort;
  /** Period TOTALS (not just this table's visible rows — see page.tsx's
   * header comment on why those can differ once a period spans more than
   * one page) for the footer row. */
  summary: PeriodSummary;
  periodLabel: string;
  getHref: (id: string) => string;
}) {
  const columns: DataListColumn<LoadWithFinancials>[] = [
    { key: "number", header: "Load #", sortable: true, render: (l) => l.loadNumber ?? l.id.slice(0, 8) },
    { key: "status", header: "Status", sortable: true, render: (l) => <StatusPill status={l.status} domain="load" /> },
    { key: "pickup", header: "Pickup", sortable: true, render: (l) => <DateTimeCST value={l.pickupDate} mode="date" /> },
    { key: "delivery", header: "Delivery", render: (l) => <DateTimeCST value={l.deliveryDate} mode="date" /> },
    { key: "broker", header: "Broker", sortable: true, render: (l) => l.brokerName ?? "—" },
    { key: "lane", header: "Lane", render: (l) => `${l.origin ?? "—"} → ${l.destination ?? "—"}` },
    {
      key: "miles",
      header: "Miles (Ld / DH)",
      align: "right",
      sortable: true,
      render: (l) => `${Math.round(l.financials.loadedMiles).toLocaleString()} / ${Math.round(l.financials.deadheadMiles).toLocaleString()}`,
    },
    { key: "gross", header: "Gross", align: "right", sortable: true, render: (l) => <Money value={l.financials.gross} tone="none" className="tabular-nums" /> },
    { key: "net", header: "Net", align: "right", sortable: true, render: (l) => <Money value={l.financials.net} className="tabular-nums" /> },
    {
      key: "netRpm",
      header: "Net $/mi",
      align: "right",
      sortable: true,
      render: (l) => <span className="tabular-nums">{l.financials.loadedMiles > 0 ? rpm(l.financials.net / l.financials.loadedMiles) : "—"}</span>,
    },
  ];

  return (
    <DataList
      columns={columns}
      rows={loads}
      rowKey={(l) => l.id}
      getHref={(l) => getHref(l.id)}
      sort={sort}
      emptyMessage="No loads in this view."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 text-[13px]">
          <span className="font-medium text-fg-muted">
            {summary.loads} load{summary.loads === 1 ? "" : "s"} · {periodLabel}
          </span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className="text-fg-muted">
              Miles <span className="font-semibold tabular-nums text-fg">{Math.round(summary.loadedMiles + summary.deadheadMiles).toLocaleString()}</span>
            </span>
            <span className="text-fg-muted">
              Gross <span className="font-semibold tabular-nums text-fg">{formatMoney(summary.gross)}</span>
            </span>
            <span className="text-fg-muted">
              Net <span className="font-semibold tabular-nums text-ok">{formatMoney(summary.net)}</span>
            </span>
            <span className="text-fg-muted">
              Net $/mi <span className="font-semibold tabular-nums text-fg">{rpm(summary.netRpm)}</span>
            </span>
          </div>
        </div>
      }
    />
  );
}
