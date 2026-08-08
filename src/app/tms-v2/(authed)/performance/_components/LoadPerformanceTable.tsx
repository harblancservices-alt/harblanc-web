import { DataList, type DataListColumn, type DataListSort } from "@/components/tms-v2/ui/DataList";
import { Money } from "@/components/tms-v2/ui/Money";
import { rpm } from "@/lib/dispatch/format";
import { withReturnTo } from "@/lib/nav/return-to";
import type { LoadTableRow } from "../_lib/load-table";

/**
 * The analytical Load Board (audit §J item 3 / Phase 8) — "the Load Board
 * turned into analytics," the literal new build item the spec calls for.
 * The page hands this an already server-fetched, range-bounded row set
 * (Performance's own `getAnalyticsLoads(range)` call, capped at 2000 and
 * scoped to the selected period) — never the whole load history, and never
 * re-aggregated client-side (this stays a plain server component).
 */
export function LoadPerformanceTable({ rows, sort, fromPath }: { rows: LoadTableRow[]; sort: DataListSort; fromPath: string }) {
  const columns: DataListColumn<LoadTableRow>[] = [
    { key: "loadNumber", header: "Load#", sortable: true, render: (r) => (r.loadNumber ? `#${r.loadNumber}` : "—") },
    { key: "date", header: "Date", sortable: true, render: (r) => r.date ?? "—" },
    { key: "origin", header: "Origin", sortable: true, hideOnMobile: true, render: (r) => r.origin },
    { key: "destination", header: "Dest", sortable: true, hideOnMobile: true, render: (r) => r.destination },
    { key: "broker", header: "Broker", sortable: true, render: (r) => r.broker },
    { key: "rate", header: "Gross", align: "right", sortable: true, render: (r) => <Money value={r.rate} tone="none" /> },
    { key: "net", header: "Net", align: "right", sortable: true, render: (r) => <Money value={r.net} /> },
    {
      key: "loadedMiles",
      header: "Loaded mi",
      align: "right",
      sortable: true,
      hideOnMobile: true,
      render: (r) => Math.round(r.loadedMiles).toLocaleString("en-US"),
    },
    {
      key: "deadheadMiles",
      header: "Deadhead",
      align: "right",
      sortable: true,
      hideOnMobile: true,
      render: (r) => Math.round(r.deadheadMiles).toLocaleString("en-US"),
    },
    {
      key: "totalMiles",
      header: "Total mi",
      align: "right",
      sortable: true,
      hideOnMobile: true,
      render: (r) => Math.round(r.totalMiles).toLocaleString("en-US"),
    },
    { key: "grossRpm", header: "Gross/loaded-mi", align: "right", sortable: true, hideOnMobile: true, render: (r) => rpm(r.grossRpm) },
    { key: "netRpm", header: "Net/loaded-mi", align: "right", sortable: true, render: (r) => rpm(r.netRpm) },
    { key: "tripName", header: "Trip", sortable: true, hideOnMobile: true, render: (r) => r.tripName ?? "—" },
  ];

  return (
    <DataList
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      getHref={(r) => withReturnTo(`/tms-v2/loads/${r.id}`, fromPath)}
      sort={sort}
      emptyMessage="No loads match this period/filter."
    />
  );
}
