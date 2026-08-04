import type { ReactNode } from "react";

type KpiTileProps = {
  label: string;
  /** Usually a <Money> or plain string/number — the primitive doesn't force
   * a formatter so non-money KPIs (load count, $/mi) can use it too. */
  value: ReactNode;
  /** Optional delta pill, e.g. "+12% vs last month". */
  delta?: ReactNode;
  deltaTone?: "positive" | "negative" | "neutral";
  /** Optional sparkline/mini-chart slot rendered under the figure. */
  children?: ReactNode;
};

const DELTA_CLASSES: Record<NonNullable<KpiTileProps["deltaTone"]>, string> = {
  positive: "text-ok",
  negative: "text-bad",
  neutral: "text-fg-muted",
};

/** One KPI card — label, figure, optional delta, optional sparkline slot.
 * Replaces the bespoke KPI markup V1 repeats per page (Dashboard, Load
 * Board, Trips, Performance) with one component. */
export function KpiTile({ label, value, delta, deltaTone = "neutral", children }: KpiTileProps) {
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <div className="text-[13px] font-medium text-fg-muted">{label}</div>
      <div className="mt-1 text-[28px] font-semibold leading-none text-fg">{value}</div>
      {delta ? (
        <div className={`mt-1.5 text-[13px] font-medium ${DELTA_CLASSES[deltaTone]}`}>{delta}</div>
      ) : null}
      {children}
    </div>
  );
}
