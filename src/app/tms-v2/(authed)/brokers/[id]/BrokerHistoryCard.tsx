import Link from "next/link";
import type { ReactNode } from "react";
import { StatusPill } from "@/components/tms-v2/ui/StatusPill";
import { Money } from "@/components/tms-v2/ui/Money";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { MarkPaidCell } from "@/components/tms-v2/MarkPaidCell";
import { RECEIVABLE_OVERDUE_DAYS } from "@/lib/domain/money";
import { withReturnTo } from "@/lib/nav/return-to";
import type { BrokerLoadHistoryRow } from "@/lib/data/broker-profile";
import { LoadDocButtons } from "./LoadDocButtons";

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

function Chip({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap rounded-full bg-elevated px-2 py-0.5 text-[11px] text-fg-muted">{children}</span>;
}

/** One load in the broker's history — same rounded-card family as the Load
 * Board's LoadCard (v2-design.md), replacing the old cramped Rate/Net/
 * Margin stat-boxes and always-accent aging chip with a plain money line
 * and an aging indicator that only turns red once it's genuinely overdue
 * (RECEIVABLE_OVERDUE_DAYS, the same 40-day threshold Receivables uses),
 * staying neutral/muted before that. Net's color comes from Money's
 * default "auto" tone (green when positive, red only when actually
 * negative) rather than a forced color. The card links to the load;
 * MarkPaidCell (a Client Component) already calls preventDefault()/
 * stopPropagation() internally so it submits without navigating — this
 * file stays a plain Server Component and must NOT attach its own event
 * handler to a bare element (an earlier `<span onClick={...}>` wrapper
 * here did exactly that and crashed the RSC render for every broker with
 * an unpaid delivered/tonu load — audit trail: the "some brokers, not
 * others" crash report).
 *
 * href fixed 2026-08-08 (found during the back-button navigation audit):
 * this pointed at `/tms-v2/loads?id=${id}` — the OLD context-drawer
 * pattern from before the Load Board drawer was removed in favor of full
 * Load Detail pages (commit a6cbdcb). That query param has been dead ever
 * since; tapping a broker's load-history card silently opened the Load
 * Board instead of the load. Now a real `/tms-v2/loads/${id}` link, with
 * `from` (lib/nav/return-to.ts) so its back button returns to this broker
 * profile. */
export function BrokerHistoryCard({ load: l, fromPath }: { load: BrokerLoadHistoryRow; fromPath: string }) {
  const marginPct = l.financials.gross > 0 ? Math.round((l.financials.net / l.financials.gross) * 100) : null;
  const age = daysSince(l.deliveryDate);
  const unpaid = (l.status === "delivered" || l.status === "tonu") && l.paymentStatus !== "paid";
  const overdue = unpaid && age != null && age > RECEIVABLE_OVERDUE_DAYS;

  return (
    <Link
      href={withReturnTo(`/tms-v2/loads/${l.id}`, fromPath)}
      className="block rounded-xl border border-line bg-card p-3.5 shadow-e1 transition-shadow hover:shadow-e2"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-[14px] font-semibold leading-tight text-fg">
          {l.origin ?? "—"} → {l.destination ?? "—"}
        </span>
        <StatusPill status={l.status} domain="load" className="shrink-0" />
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {l.loadNumber ? <Chip>#{l.loadNumber}</Chip> : null}
        {l.equipment ? <Chip>{l.equipment}</Chip> : null}
        {l.deliveryDate ? (
          <Chip>
            <DateTimeCST value={l.deliveryDate} mode="date" />
          </Chip>
        ) : null}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[13px]">
          <Money value={l.financials.gross} tone="none" className="font-semibold" />
          <span className="text-fg-subtle">·</span>
          <Money value={l.financials.net} className="font-semibold" />
          {marginPct != null ? <span className="text-[12px] text-fg-muted">{marginPct}%</span> : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <LoadDocButtons documents={l.documents} />

          {unpaid ? (
            <span className="flex shrink-0 items-center gap-2">
              {age != null ? (
                <span className={`text-[11px] font-semibold tabular-nums ${overdue ? "text-bad" : "text-fg-muted"}`}>{age}d</span>
              ) : null}
              <MarkPaidCell loadId={l.id} />
            </span>
          ) : l.paymentStatus === "paid" ? (
            <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-ok">Paid</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
