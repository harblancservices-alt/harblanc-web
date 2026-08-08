import type { ReactNode } from "react";
import { Money } from "@/components/tms-v2/ui/Money";
import type { MoneyTone } from "@/lib/domain/money";

/**
 * Small page-local pieces for Load Detail — colocated here rather than
 * added to components/tms-v2/ui, since v2-architecture.md's <MoneyRow>
 * primitive hasn't shipped yet and this phase's scope is the loads route
 * only (no shared UI-kit additions). One flat money/detail row, matching
 * the design's hairline-first house rule (no card-per-field).
 */
export function MoneyLine({
  label,
  value,
  tone = "auto",
  bold = false,
}: {
  label: string;
  value: number;
  tone?: MoneyTone | "auto" | "none";
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className={`text-[14px] ${bold ? "font-semibold text-fg" : "text-fg-muted"}`}>{label}</span>
      <Money value={value} tone={tone} className={bold ? "text-[16px] font-semibold" : undefined} />
    </div>
  );
}

export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="shrink-0 text-[13px] text-fg-muted">{label}</span>
      <span className="truncate text-[14px] text-fg">{empty ? "—" : value}</span>
    </div>
  );
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="text-[15px] font-semibold text-fg">{children}</h2>;
}

/** Small stat used in the command-bar KPI strip — a headline figure plus an
 * optional secondary line (e.g. "$1.85/mi"), mirroring legacy /admin's
 * dispatch/loads/[id] command-bar tiles (Revenue/Net/Total mi/Deadhead,
 * each with a $/mi or fuel-$ sub-value) rather than the plain KpiTile the
 * page used before. */
export function CommandStat({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-lg p-3 ${accent ? "border border-accent/50 bg-bar-fg/5" : ""}`}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-bar-fg/60">{label}</div>
      <div className="mt-0.5 text-[19px] font-semibold leading-tight tabular-nums text-bar-fg">{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] font-medium text-bar-fg/60">{sub}</div> : null}
    </div>
  );
}
