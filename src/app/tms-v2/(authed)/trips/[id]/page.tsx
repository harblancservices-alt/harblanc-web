import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/tms-v2/ui/Card";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { Money } from "@/components/tms-v2/ui/Money";
import { StatusPill } from "@/components/tms-v2/ui/StatusPill";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { DataList, type DataListColumn } from "@/components/tms-v2/ui/DataList";
import { getTripById } from "@/lib/data/trips";
import { getLoadById, type LoadWithFinancials } from "@/lib/data/loads";
import { formatMoney } from "@/lib/domain/money";
import { marginTone } from "../trip-columns";
import { MarkPaidCell } from "@/components/tms-v2/MarkPaidCell";

// Trip detail reads live, request-scoped data — always fresh, matching the
// Trips list and Today.
export const dynamic = "force-dynamic";

const LINKED_LOAD_COLUMNS: DataListColumn<LoadWithFinancials>[] = [
  {
    key: "load",
    header: "Load",
    render: (l) => (
      <div>
        <div className="font-semibold text-fg">{l.loadNumber ?? l.id.slice(0, 8)}</div>
        <div className="mt-0.5 truncate text-[12px] text-fg-muted">{l.brokerName ?? "—"}</div>
      </div>
    ),
  },
  {
    key: "lane",
    header: "Lane",
    render: (l) => `${l.origin ?? "—"} → ${l.destination ?? "—"}`,
    hideOnMobile: true,
  },
  {
    key: "delivered",
    header: "Delivered",
    render: (l) => <DateTimeCST value={l.deliveryDate} mode="date" />,
    hideOnMobile: true,
  },
  { key: "status", header: "Status", render: (l) => <StatusPill status={l.status} domain="load" /> },
  { key: "rate", header: "Rate", render: (l) => <Money value={l.financials.gross} tone="none" />, align: "right" },
  { key: "net", header: "Net", render: (l) => <Money value={l.financials.net} />, align: "right" },
  {
    key: "markPaid",
    header: "",
    render: (l) =>
      (l.status === "delivered" || l.status === "tonu") && l.paymentStatus !== "paid" ? (
        <MarkPaidCell loadId={l.id} />
      ) : null,
    align: "right",
  },
];

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trip = await getTripById(id);
  if (!trip) notFound();

  const linkedLoads = (
    await Promise.all(trip.loadIds.map((loadId) => getLoadById(loadId)))
  ).filter((l): l is LoadWithFinancials => l !== null);

  const fin = trip.financials;
  const totalMiles = fin.loadedMiles + fin.deadheadMiles + fin.pcMiles;
  const dieselTotal = fin.loadDieselTotal + fin.pcDiesel;
  const tone = marginTone(fin.net, fin.profitPct);
  const marginBarPct = fin.profitPct == null ? 0 : Math.min(100, Math.max(0, fin.profitPct));

  return (
    <PageScroll>
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/tms-v2/trips"
          className="inline-flex w-fit items-center gap-1 text-[13px] font-medium text-fg-muted hover:text-fg"
        >
          ‹ All trips
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-semibold text-fg">{trip.name ?? "Untitled trip"}</h1>
              <StatusPill status={trip.status} domain="trip" />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
              <span>
                <DateTimeCST value={trip.startedAt} mode="date" />
                {trip.endedAt ? (
                  <>
                    {" → "}
                    <DateTimeCST value={trip.endedAt} mode="date" />
                  </>
                ) : null}
              </span>
              <span>· {trip.loadIds.length} load{trip.loadIds.length === 1 ? "" : "s"}</span>
              {!trip.endedAt ? (
                <span className="inline-flex w-fit items-center rounded-full border border-warn/40 bg-warn-bg px-2 py-0.5 text-[11px] font-medium text-warn">
                  Ongoing · no end
                </span>
              ) : null}
            </div>
          </div>
          <p className="text-[12px] text-fg-muted">
            Editing, close/reopen land in a later phase.
          </p>
        </div>
      </div>

      {/* HERO — net profit is the page's focal point. */}
      <Card className="p-5 sm:p-6">
        <div className="text-[12px] font-medium uppercase tracking-wide text-fg-muted">Net profit</div>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-2.5">
          <span className={`text-[40px] font-semibold leading-none tabular-nums ${fin.net < 0 ? "text-bad" : "text-ok"}`}>
            {formatMoney(fin.net)}
          </span>
          {fin.profitPct != null ? (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${
                tone === "bad" ? "bg-bad-bg text-bad" : tone === "warn" ? "bg-warn-bg text-warn" : "bg-ok-bg text-ok"
              }`}
            >
              {Math.round(fin.profitPct)}% margin
            </span>
          ) : null}
        </div>
        <div className="mt-1.5 text-[13px] text-fg-muted">
          of {formatMoney(fin.gross)} gross · after {formatMoney(fin.spent)} costs
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-elevated">
          <div
            className={`h-full ${fin.net < 0 ? "bg-bad" : "bg-ok"}`}
            style={{ width: `${marginBarPct}%` }}
          />
        </div>
      </Card>

      {/* MONEY — flat, hairline-separated columns. */}
      <section className="flex flex-col gap-2 border-b border-line pb-5">
        <h2 className="text-[13px] font-medium uppercase tracking-wide text-fg-muted">Money</h2>
        <div className="flex items-stretch">
          <MoneyStat label="Gross" value={formatMoney(fin.gross)} />
          <MoneyStat label="Spent" value={formatMoney(fin.spent)} tone="negative" sub="fuel + fees" divider />
          <MoneyStat label="Diesel" value={formatMoney(dieselTotal)} divider />
        </div>
      </section>

      {/* MILES — supporting detail. */}
      <section className="flex flex-col gap-2 border-b border-line pb-5">
        <h2 className="text-[13px] font-medium uppercase tracking-wide text-fg-muted">Miles</h2>
        <div className="text-[20px] font-semibold tabular-nums text-fg">
          {totalMiles.toLocaleString("en-US")} mi <span className="text-[12px] font-medium text-fg-muted">total</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-medium text-fg-muted">
          <span>Loaded <span className="text-fg">{fin.loadedMiles.toLocaleString("en-US")}</span></span>
          <span>Deadhead <span className="text-fg">{fin.deadheadMiles.toLocaleString("en-US")}</span></span>
          <span>PC <span className="text-fg">{fin.pcMiles.toLocaleString("en-US")}</span></span>
        </div>
      </section>

      {/* ODOMETER — read-only bookends; entry lands with the writes phase. */}
      <section className="flex flex-col gap-2 border-b border-line pb-5">
        <h2 className="text-[13px] font-medium uppercase tracking-wide text-fg-muted">Odometer</h2>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[15px] text-fg">
          <span>Start <span className="font-semibold tabular-nums">{trip.startOdometer?.toLocaleString("en-US") ?? "—"}</span></span>
          <span>End <span className="font-semibold tabular-nums">{trip.endOdometer?.toLocaleString("en-US") ?? "—"}</span></span>
        </div>
      </section>

      {trip.notes ? (
        <section className="flex flex-col gap-2 border-b border-line pb-5">
          <h2 className="text-[13px] font-medium uppercase tracking-wide text-fg-muted">Notes</h2>
          <p className="whitespace-pre-wrap text-[14px] text-fg">{trip.notes}</p>
        </section>
      ) : null}

      {/* LINKED LOADS */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold text-fg">Linked loads ({linkedLoads.length})</h2>
        <DataList
          columns={LINKED_LOAD_COLUMNS}
          rows={linkedLoads}
          rowKey={(l) => l.id}
          getHref={(l) => `/tms-v2/loads/${l.id}`}
          emptyMessage="No loads linked to this trip yet."
        />
      </section>
    </div>
    </PageScroll>
  );
}

function MoneyStat({
  label,
  value,
  tone,
  sub,
  divider = false,
}: {
  label: string;
  value: string;
  tone?: "negative";
  sub?: string;
  divider?: boolean;
}) {
  return (
    <div className={`min-w-0 flex-1 px-3 first:pl-0 last:pr-0 ${divider ? "border-l border-line" : ""}`}>
      <div className="truncate text-[12px] font-medium uppercase tracking-wide text-fg-muted">{label}</div>
      <div className={`mt-0.5 truncate text-[19px] font-semibold leading-tight tabular-nums ${tone === "negative" ? "text-bad" : "text-fg"}`}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 truncate text-[11px] font-medium text-fg-muted">{sub}</div> : null}
    </div>
  );
}
