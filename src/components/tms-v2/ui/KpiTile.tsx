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
  /** "default" (white card) or "dark" — a graphite/bar-toned tile for the
   * one hero figure in a KPI strip that should visually outrank its
   * siblings (e.g. Trips' Net tile, Today's headline net). Reuses the
   * shell's existing --bar/--bar-fg tokens, same treatment /admin's V2
   * redesign already gives its own hero tiles. */
  emphasis?: "default" | "dark";
};

const DELTA_CLASSES: Record<NonNullable<KpiTileProps["deltaTone"]>, string> = {
  positive: "text-ok",
  negative: "text-bad",
  neutral: "text-fg-muted",
};

/** One KPI card — label, figure, optional delta, optional sparkline slot.
 * Replaces the bespoke KPI markup V1 repeats per page (Dashboard, Load
 * Board, Trips, Performance) with one component. Raised white card
 * (shadow-e1) over the gray canvas, per the 2026-08 depth pass — the
 * figure carries the primary-metric type scale (28px), label stays a
 * small uppercase-weight secondary tier so hierarchy reads at a glance. */
export function KpiTile({ label, value, delta, deltaTone = "neutral", children, emphasis = "default" }: KpiTileProps) {
  const dark = emphasis === "dark";
  return (
    <div
      className={
        dark
          ? "rounded-xl border border-line bg-bar p-4 shadow-e2"
          : "rounded-xl border border-line bg-card p-4 shadow-e1"
      }
    >
      <div className={`text-[13px] font-medium ${dark ? "text-bar-fg/70" : "text-fg-muted"}`}>{label}</div>
      <div className={`mt-1.5 text-[28px] font-semibold leading-none tabular-nums ${dark ? "text-bar-fg" : "text-fg"}`}>
        {value}
      </div>
      {delta ? (
        <div className={`mt-2 text-[13px] font-medium ${dark ? "text-bar-fg/70" : DELTA_CLASSES[deltaTone]}`}>{delta}</div>
      ) : null}
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}
