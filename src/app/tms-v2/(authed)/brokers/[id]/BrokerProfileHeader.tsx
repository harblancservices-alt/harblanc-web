import type { ReactNode } from "react";
import { Money } from "@/components/tms-v2/ui/Money";
import { formatMoney } from "@/lib/domain/money";
import { BrokerStatusPill } from "../_lib/broker-status";
import type { BrokerIdentity } from "@/lib/data/broker-profile";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/**
 * Broker profile header — Brent's final spec (neither legacy's nor V2's
 * prior top, both explicitly rejected): avatar/initials + name + status
 * pill + factoring flag + MC/DOT line, then a hairline, then a money row
 * (A/R owed emphasized amber when > 0, total revenue, loads run). No
 * call/email buttons anywhere in the header — deliberately left out per
 * that spec, not an oversight.
 */
export function BrokerProfileHeader({
  identity,
  loadsCount,
  gross,
  arOutstanding,
  actions,
}: {
  identity: BrokerIdentity;
  loadsCount: number;
  gross: number;
  arOutstanding: number;
  actions?: ReactNode;
}) {
  const idLine = [identity.mcNumber ? `MC ${identity.mcNumber}` : null, identity.dotNumber ? `DOT ${identity.dotNumber}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="rounded-xl border border-line bg-card shadow-e1">
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-elevated text-[15px] font-semibold text-fg-muted">
            {initials(identity.name)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[17px] font-semibold text-fg">{identity.name}</h1>
              <BrokerStatusPill status={identity.status} />
              {identity.factoring ? (
                <span className="inline-flex items-center rounded-full bg-elevated px-2 py-0.5 text-[11px] font-medium text-fg-muted">Factoring</span>
              ) : null}
            </div>
            {idLine ? <p className="mt-0.5 text-[13px] text-fg-muted">{idLine}</p> : null}
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>

      <div className="mt-3.5 grid grid-cols-3 divide-x divide-line border-t border-line">
        <div className="px-4 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">A/R owed</p>
          <p className={`font-mono text-[16px] font-semibold tabular-nums ${arOutstanding > 0 ? "text-warn" : "text-fg"}`}>
            {formatMoney(arOutstanding)}
          </p>
        </div>
        <div className="px-4 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">Total revenue</p>
          <Money value={gross} tone="none" className="text-[15px] font-semibold" />
        </div>
        <div className="px-4 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">Loads run</p>
          <p className="text-[15px] font-semibold tabular-nums text-fg">{loadsCount}</p>
        </div>
      </div>
    </div>
  );
}
