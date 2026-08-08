import { DataList, type DataListColumn } from "@/components/tms-v2/ui/DataList";
import { Money } from "@/components/tms-v2/ui/Money";
import { rpm } from "@/lib/dispatch/format";
import { formatCentralDate } from "@/lib/domain/dates";
import { withReturnTo } from "@/lib/nav/return-to";
import type { AnalyticsTrip } from "@/lib/data/analytics";

/**
 * Trip Analysis (Brent's Phase 2 item 5) — "Trip, Date/range, Loads, Gross,
 * Net, Miles, Deadhead, Net/mi", reusing `computeTripNet`'s all-in trip
 * financials verbatim (never a second mileage/money calc). Personal-
 * conveyance miles surface ONLY here (Option C) — a trip is the one place PC
 * has a real, unambiguous denominator (start/end odometer + the gaps between
 * its own loads); Performance's top-level mileage KPIs never include it.
 */
export function TripPerformanceTable({ trips, fromPath }: { trips: AnalyticsTrip[]; fromPath: string }) {
  const columns: DataListColumn<AnalyticsTrip>[] = [
    { key: "name", header: "Trip", sortable: false, render: (t) => <span className="font-medium">{t.name ?? "Unnamed trip"}</span> },
    {
      key: "dateRange",
      header: "Date range",
      sortable: false,
      render: (t) => {
        const start = t.startedAt ? formatCentralDate(t.startedAt) : "—";
        const end = t.endedAt ? formatCentralDate(t.endedAt) : t.status === "active" ? "Active" : "—";
        return `${start} – ${end}`;
      },
    },
    { key: "loads", header: "Loads", align: "right", sortable: false, render: (t) => String(t.financials.loads) },
    { key: "gross", header: "Gross", align: "right", sortable: false, render: (t) => <Money value={t.financials.gross} tone="none" /> },
    { key: "net", header: "Net", align: "right", sortable: false, render: (t) => <Money value={t.financials.net} /> },
    {
      key: "miles",
      header: "Miles",
      align: "right",
      sortable: false,
      hideOnMobile: true,
      render: (t) => Math.round(t.financials.loadedMiles + t.financials.deadheadMiles).toLocaleString("en-US"),
    },
    {
      key: "deadhead",
      header: "Deadhead",
      align: "right",
      sortable: false,
      hideOnMobile: true,
      render: (t) => Math.round(t.financials.deadheadMiles).toLocaleString("en-US"),
    },
    {
      key: "pcMiles",
      header: "PC miles",
      align: "right",
      sortable: false,
      render: (t) => Math.round(t.financials.pcMiles).toLocaleString("en-US"),
    },
    {
      key: "netRpm",
      header: "Net/mi",
      align: "right",
      sortable: false,
      render: (t) => rpm(t.financials.loadedMiles > 0 ? t.financials.net / t.financials.loadedMiles : null),
    },
  ];

  return (
    <DataList
      columns={columns}
      rows={trips}
      rowKey={(t) => t.id}
      getHref={(t) => withReturnTo(`/tms-v2/trips/${t.id}`, fromPath)}
      emptyMessage="No trips touched this period."
    />
  );
}
