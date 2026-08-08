import { DataList, type DataListColumn, type DataListSort } from "@/components/tms-v2/ui/DataList";
import { Money } from "@/components/tms-v2/ui/Money";
import { rpm } from "@/lib/dispatch/format";
import type { PartyStat } from "@/lib/dispatch/performance";
import type { PartySortKey } from "../_lib/party-sort";

/**
 * Full broker/lane analysis table (audit §J items 4-5 / Phase 7) — no
 * artificial row cap (the old page hardcoded `brokerStats(loads, 6)`),
 * every column Brent asked for, sortable via real server-rendered links
 * (DataList's house pattern, v2-architecture.md §2), and each row links to
 * a same-page drill-down of its constituent loads instead of a bare
 * unranked leaderboard.
 */
export function PartyTable({
  title,
  rows,
  sort,
  rowHref,
  nameLabel,
}: {
  title: string;
  rows: PartyStat[];
  sort: DataListSort;
  rowHref: (name: string) => string;
  nameLabel: string;
}) {
  const columns: DataListColumn<PartyStat>[] = [
    { key: "name", header: nameLabel, sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "loads", header: "Loads", align: "right", sortable: true, render: (r) => String(r.loads) },
    { key: "gross", header: "Gross", align: "right", sortable: true, render: (r) => <Money value={r.gross} tone="none" /> },
    { key: "net", header: "Net", align: "right", sortable: true, render: (r) => <Money value={r.net} /> },
    {
      key: "avgGrossPerLoad",
      header: "Avg Gross/Load",
      align: "right",
      sortable: true,
      hideOnMobile: true,
      render: (r) => <Money value={r.avgGrossPerLoad} tone="none" />,
    },
    {
      key: "avgNetPerLoad",
      header: "Avg Net/Load",
      align: "right",
      sortable: true,
      hideOnMobile: true,
      render: (r) => <Money value={r.avgNetPerLoad} tone="none" />,
    },
    {
      key: "loadedMiles",
      header: "Loaded Miles",
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
    { key: "grossRpm", header: "Gross/Mile", align: "right", sortable: true, hideOnMobile: true, render: (r) => rpm(r.grossRpm) },
    { key: "netRpm", header: "Net/Mile", align: "right", sortable: true, render: (r) => rpm(r.netRpm) },
  ];

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
      <DataList
        columns={columns}
        rows={rows}
        rowKey={(r) => r.name}
        getHref={(r) => rowHref(r.name)}
        sort={sort}
        emptyMessage="No loads in this period yet."
      />
    </section>
  );
}

export type { PartySortKey };
