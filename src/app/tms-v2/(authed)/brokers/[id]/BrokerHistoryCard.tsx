import Link from "next/link";
import { StatusPill } from "@/components/tms-v2/ui/StatusPill";
import { Money } from "@/components/tms-v2/ui/Money";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { MarkPaidCell } from "@/components/tms-v2/MarkPaidCell";
import type { BrokerLoadHistoryRow } from "@/lib/data/broker-profile";

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const then = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.floor((today - then) / 86_400_000);
  return days >= 0 ? days : null;
}

/** One load in the broker's history — mirrors legacy's LoadHistoryCard
 * (lane leading, status pill on the right, equipment/date/age as meta
 * chips, a Rate·Net·Margin stat module) in V2 tokens. The card links to
 * the load; Mark paid stops propagation so it submits without navigating. */
export function BrokerHistoryCard({ load: l }: { load: BrokerLoadHistoryRow }) {
  const marginPct = l.financials.gross > 0 ? Math.round((l.financials.net / l.financials.gross) * 100) : null;
  const age = daysSince(l.deliveryDate);
  const unpaid = (l.status === "delivered" || l.status === "tonu") && l.paymentStatus !== "paid";

  return (
    <Link
      href={`/tms-v2/loads?id=${l.id}`}
      className="block rounded-lg border border-line-strong bg-card p-3 shadow-e1 transition-shadow hover:shadow-e2"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-[14px] font-semibold leading-tight text-fg">
          {l.origin ?? "—"} → {l.destination ?? "—"}
        </span>
        <StatusPill status={l.status} domain="load" className="shrink-0" />
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {l.loadNumber ? (
          <span className="rounded border border-line-strong bg-elevated px-1.5 py-0.5 font-mono text-[11px] font-semibold text-fg">
            #{l.loadNumber}
          </span>
        ) : null}
        {l.equipment ? (
          <span className="rounded border border-line-strong bg-elevated px-1.5 py-0.5 font-mono text-[11px] font-semibold text-fg">
            {l.equipment}
          </span>
        ) : null}
        {l.deliveryDate ? (
          <span className="rounded border border-line-strong bg-elevated px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-fg">
            <DateTimeCST value={l.deliveryDate} mode="date" />
          </span>
        ) : null}
        {age != null ? (
          <span className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums text-accent">
            {age}d
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="flex w-fit items-stretch overflow-hidden rounded-md border border-line-strong bg-elevated">
          <div className="px-2.5 py-1.5">
            <div className="text-[9px] font-bold uppercase tracking-wide text-fg-subtle">Rate</div>
            <Money value={l.financials.gross} tone="none" className="mt-0.5 text-[13px] font-bold" />
          </div>
          <div className="border-l border-line-strong px-2.5 py-1.5">
            <div className="text-[9px] font-bold uppercase tracking-wide text-fg-subtle">Net</div>
            <Money value={l.financials.net} className="mt-0.5 text-[13px] font-bold" />
          </div>
          <div className="border-l border-line-strong px-2.5 py-1.5">
            <div className="text-[9px] font-bold uppercase tracking-wide text-fg-subtle">Margin</div>
            <div className="mt-0.5 text-[13px] font-bold tabular-nums text-fg">{marginPct != null ? `${marginPct}%` : "—"}</div>
          </div>
        </div>
        {unpaid ? (
          <span onClick={(e) => e.preventDefault()} className="shrink-0">
            <MarkPaidCell loadId={l.id} />
          </span>
        ) : l.paymentStatus === "paid" ? (
          <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-ok">Paid</span>
        ) : null}
      </div>
    </Link>
  );
}
