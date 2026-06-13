import Link from "next/link";
import {
  LOAD_DISPLAY_STATUS_CLASSES,
  LOAD_DISPLAY_STATUS_LABELS,
  LOAD_DISPLAY_STATUS_RAIL,
  type LoadDisplayStatus,
} from "@/lib/dispatch/loads-view";
import type { AttentionRow } from "@/lib/dispatch/dashboard-view";

/**
 * Owner Dashboard — visual layer.
 *
 * Server component, no client interactivity. Matches the Loads page's
 * visual system exactly: same dark surface, same card border treatment,
 * same status pills, same status rail style, same density.
 *
 * Layout (top → bottom):
 *   1. Page header (eyebrow + month label, no banner)
 *   2. 6-card KPI strip
 *   3. Needs attention (the page's center of gravity)
 *   4. Current load
 *   5. Recent quotes + Recent applications (50/50)
 */

export type DashboardData = {
  monthLabel: string;
  kpis: {
    grossMtd: number;
    /** null when expenses aren't tracked yet — renders as "—". */
    netMtd: number | null;
    activeLoads: number;
    openQuotes: number;
    arOpen: number;
    applications: number;
  };
  attentionRows: ReadonlyArray<AttentionRow>;
  attentionTotal: number;
  currentLoad: CurrentLoadData | null;
  recentQuotes: ReadonlyArray<RecentQuoteRow>;
  recentApplications: ReadonlyArray<RecentApplicationRow>;
};

type CurrentLoadData = {
  leadId: string;
  laneLabel: string;
  customerName: string;
  rateDisplay: string | null;
  displayStatus: LoadDisplayStatus;
  pickupDate: string | null;
  nextActionVerb: string;
};

type RecentQuoteRow = {
  leadId: string;
  ageLabel: string;
  customerName: string;
  laneLabel: string;
  rateDisplay: string | null;
  displayStatus: LoadDisplayStatus;
};

type RecentApplicationRow = {
  id: string;
  ageLabel: string;
  name: string;
  role: string;
};

export function DashboardView({ data }: { data: DashboardData }) {
  return (
    <div className="min-h-screen border-t border-zinc-800 bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <header className="mb-4">
          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.24em] text-zinc-500">
            Dashboard
          </div>
          <h1 className="mt-1 text-[20px] font-semibold leading-none tracking-tight text-white">
            {data.monthLabel} <span className="text-zinc-500">· MTD</span>
          </h1>
        </header>

        <KpiStrip kpis={data.kpis} />

        <NeedsAttentionCard
          rows={data.attentionRows}
          total={data.attentionTotal}
        />

        <CurrentLoadCard load={data.currentLoad} />

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <RecentQuotesCard rows={data.recentQuotes} />
          <RecentApplicationsCard rows={data.recentApplications} />
        </div>
      </div>
    </div>
  );
}

function KpiStrip({ kpis }: { kpis: DashboardData["kpis"] }) {
  return (
    <div className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
      <KpiCard label="Gross" value={formatUsd(kpis.grossMtd)} />
      <KpiCard label="Net" value={kpis.netMtd != null ? formatUsd(kpis.netMtd) : "—"} />
      <KpiCard label="Loads" value={String(kpis.activeLoads)} />
      <KpiCard label="Quotes" value={String(kpis.openQuotes)} />
      <KpiCard label="AR Open" value={formatUsd(kpis.arOpen)} />
      <KpiCard label="Apps" value={String(kpis.applications)} />
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/40 px-2.5 py-2">
      <div className="font-mono text-[8.5px] font-medium uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-[15px] font-semibold tabular-nums leading-none text-white">
        {value}
      </div>
    </div>
  );
}

function NeedsAttentionCard({
  rows,
  total,
}: {
  rows: ReadonlyArray<AttentionRow>;
  total: number;
}) {
  return (
    <div className="mb-3 overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/40">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-3 py-2">
        <div className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-200">
          <span>Needs attention</span>
        </div>
        <span className="font-mono text-[10px] font-medium tabular-nums text-red-400">
          {total === 0 ? "All clear" : total + " items"}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="px-3 py-6 text-center font-mono text-[11px] text-zinc-500">
          No attention items right now.
        </div>
      ) : (
        rows.map((row) => <AttentionRowItem key={row.leadId} row={row} />)
      )}
      {total > rows.length ? (
        <div className="border-t border-zinc-800 bg-zinc-900/60 px-3 py-2 text-right">
          <Link
            href="/admin/loads?filter=attention"
            prefetch={false}
            className="inline-flex items-center gap-1 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-300 hover:text-white"
          >
            View all in Loads
            <ArrowRight />
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function AttentionRowItem({ row }: { row: AttentionRow }) {
  const isAlert = row.severity === "alert";
  const tintClass = isAlert ? "bg-red-950/15" : "bg-amber-950/10";
  const railColor = isAlert ? "#dc2626" : "#f59e0b";
  const subtitleClass = isAlert ? "text-red-300" : "text-amber-300";

  return (
    <Link
      href={"/admin/quotes/" + row.leadId}
      prefetch={false}
      className={
        "group grid items-center gap-2 border-b border-zinc-900 px-3 py-2 transition-colors hover:bg-zinc-900/50 " +
        tintClass
      }
      style={{
        gridTemplateColumns:
          "4px minmax(0,1fr) minmax(0,1.4fr) minmax(0,0.9fr) 14px",
      }}
    >
      <span
        aria-hidden
        className="block w-[4px] self-stretch rounded-sm"
        style={{ backgroundColor: railColor }}
      />

      <span className="min-w-0">
        <span className="block truncate text-[12px] font-medium text-zinc-100">
          {row.problemLabel}
        </span>
        <span
          className={
            "mt-[2px] block truncate font-mono text-[9px] uppercase tracking-[0.10em] " +
            subtitleClass
          }
        >
          {row.ageSubtitle}
        </span>
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[12px] font-medium text-zinc-100">
          {row.customerName}
          {row.rateDisplay ? (
            <span className="ml-1.5 text-zinc-400 tabular-nums">
              · {row.rateDisplay}
            </span>
          ) : null}
        </span>
        <span className="mt-[2px] block truncate text-[10px] text-zinc-500">
          {row.laneLabel}
          {row.flagLabels.length > 1 ? (
            <span className="ml-1.5 text-zinc-600">
              · +{row.flagLabels.length - 1} more
            </span>
          ) : null}
        </span>
      </span>

      <span className="flex items-center justify-end gap-1 text-[11px] font-medium text-zinc-100">
        <span className="truncate">{row.actionVerb}</span>
      </span>

      <span aria-hidden className="flex justify-center text-zinc-600 group-hover:text-zinc-400">
        <ArrowRight />
      </span>
    </Link>
  );
}

function CurrentLoadCard({ load }: { load: CurrentLoadData | null }) {
  return (
    <div className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/40">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-3 py-2">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-200">
          Current load
        </span>
        {load ? (
          <StatusPill status={load.displayStatus} />
        ) : (
          <span className="font-mono text-[10px] text-zinc-500">No active load</span>
        )}
      </div>
      {load ? <CurrentLoadBody load={load} /> : <CurrentLoadEmptyBody />}
    </div>
  );
}

function CurrentLoadBody({ load }: { load: CurrentLoadData }) {
  return (
    <Link
      href={"/admin/quotes/" + load.leadId}
      prefetch={false}
      className="group block px-3 py-3 transition-colors hover:bg-zinc-900/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-medium text-white">
            {load.laneLabel}
          </div>
          <div className="mt-[2px] truncate text-[10px] text-zinc-500">
            {load.customerName}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[14px] font-semibold tabular-nums text-white">
            {load.rateDisplay ?? "—"}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[60px_minmax(0,1fr)] gap-y-1.5 gap-x-3 border-t border-dashed border-zinc-800 pt-3 text-[11px]">
        <div className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-zinc-500">
          Pickup
        </div>
        <div className="text-zinc-100">{load.pickupDate ?? "—"}</div>
        <div className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-zinc-500">
          Next
        </div>
        <div className="font-medium text-white">{load.nextActionVerb}</div>
      </div>
    </Link>
  );
}

function CurrentLoadEmptyBody() {
  return (
    <div className="px-3 py-6 text-center font-mono text-[11px] text-zinc-500">
      Truck is between loads. Next pickup will surface here when scheduled.
    </div>
  );
}

function RecentQuotesCard({ rows }: { rows: ReadonlyArray<RecentQuoteRow> }) {
  return (
    <div className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/40">
      <div className="flex items-center border-b border-zinc-800 bg-zinc-900/60 px-3 py-2">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-200">
          Recent quotes
        </span>
      </div>
      {rows.length === 0 ? (
        <EmptyRow text="No quotes yet." />
      ) : (
        rows.map((row) => <RecentQuoteRowItem key={row.leadId} row={row} />)
      )}
    </div>
  );
}

function RecentQuoteRowItem({ row }: { row: RecentQuoteRow }) {
  return (
    <Link
      href={"/admin/quotes/" + row.leadId}
      prefetch={false}
      className="group grid items-center gap-2 border-b border-zinc-900 px-3 py-2 transition-colors hover:bg-zinc-900/50"
      style={{
        gridTemplateColumns: "32px minmax(0,1.4fr) 60px minmax(0,0.7fr)",
      }}
    >
      <span className="text-[10.5px] tabular-nums text-zinc-400">
        {row.ageLabel}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[11.5px] font-medium text-zinc-100">
          {row.customerName}
        </span>
        <span className="block truncate text-[9.5px] text-zinc-500">
          {row.laneLabel}
        </span>
      </span>
      <span className="block text-right text-[11px] tabular-nums text-zinc-100">
        {row.rateDisplay ?? "—"}
      </span>
      <span className="flex justify-end">
        <StatusPill status={row.displayStatus} />
      </span>
    </Link>
  );
}

function RecentApplicationsCard({
  rows,
}: {
  rows: ReadonlyArray<RecentApplicationRow>;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/40">
      <div className="flex items-center border-b border-zinc-800 bg-zinc-900/60 px-3 py-2">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-200">
          Recent applications
        </span>
      </div>
      {rows.length === 0 ? (
        <EmptyRow text="No applications yet." />
      ) : (
        rows.map((row) => <RecentApplicationRowItem key={row.id} row={row} />)
      )}
    </div>
  );
}

function RecentApplicationRowItem({ row }: { row: RecentApplicationRow }) {
  return (
    <Link
      href={"/admin/applications/" + row.id}
      prefetch={false}
      className="group grid items-center gap-2 border-b border-zinc-900 px-3 py-2 transition-colors hover:bg-zinc-900/50"
      style={{ gridTemplateColumns: "32px minmax(0,1fr) 14px" }}
    >
      <span className="text-[10.5px] tabular-nums text-zinc-400">
        {row.ageLabel}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[11.5px] font-medium text-zinc-100">
          {row.name}
        </span>
        <span className="block truncate text-[9.5px] text-zinc-500">
          {row.role}
        </span>
      </span>
      <span aria-hidden className="flex justify-center text-zinc-600 group-hover:text-zinc-400">
        <ArrowRight />
      </span>
    </Link>
  );
}

function StatusPill({ status }: { status: LoadDisplayStatus }) {
  return (
    <span
      className={
        "inline-flex w-fit items-center justify-center rounded-sm border px-1.5 py-[2px] font-mono text-[8.5px] font-medium uppercase tracking-[0.12em] " +
        LOAD_DISPLAY_STATUS_CLASSES[status]
      }
      style={{
        borderLeftColor: LOAD_DISPLAY_STATUS_RAIL[status],
      }}
    >
      {LOAD_DISPLAY_STATUS_LABELS[status]}
    </span>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="px-3 py-6 text-center font-mono text-[11px] text-zinc-500">
      {text}
    </div>
  );
}

function ArrowRight() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return "$" + Math.round(n).toLocaleString("en-US");
}
