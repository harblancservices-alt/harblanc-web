"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usd } from "./shared";
import {
  CheckIcon,
  ChevronRightIcon,
  DollarIcon,
  RoadIcon,
  TruckIcon,
  WalletIcon,
} from "./icons";

/**
 * The six board KPIs. Same six figures the old strip carried and the same math
 * behind them — A/R (all-time, never month-scoped), the month's load count,
 * delivered count, gross, net, and revenue per mile — restyled as drill-down
 * cards: a tinted icon circle, a label, and the figure.
 *
 * THEME SAFETY drives one deliberate decision here. The card surface is themed
 * (bg-card), so the figures on it are themed too — text-fg, never text-bad or
 * text-ok, which measure ~2:1 on the dark admin card. The MEANING that used to
 * live in the numeral's color now lives in the icon circle, which is a fixed
 * tint + fixed ink and reads the same on both themes: A/R sits in red, revenue
 * and delivered in green, loads and per-mile in blue. A losing month turns the
 * Net circle red and adds a red "Loss" pill beside the label, so red still
 * marks a negative — it just does it on a surface that can carry it.
 *
 * The chevron appears only where there is somewhere to go. A/R drills into the
 * Accounts Receivable page (where loads get marked paid); the other five are
 * terminal figures, and a chevron on them would promise a screen that doesn't
 * exist.
 */
export function KpiGrid({
  arTotal,
  totalLoads,
  delivered,
  gross,
  net,
  avgNetPerMile,
  avgGrossPerMile,
}: {
  arTotal: number;
  totalLoads: number;
  delivered: number;
  gross: number;
  net: number;
  avgNetPerMile: number;
  avgGrossPerMile: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 lg:gap-3">
      <KpiCard
        icon={<DollarIcon className="h-[18px] w-[18px]" />}
        tint="bg-bad-bg text-bad"
        label="Accounts Receivable"
        value={usd(arTotal)}
        caption="Outstanding · all time"
        href="/admin/dispatch/receivables"
      />
      <KpiCard
        icon={<TruckIcon className="h-[18px] w-[18px]" />}
        tint="bg-steel-bg text-steel"
        label="Active Loads"
        value={String(totalLoads)}
        caption="On the board"
      />
      <KpiCard
        icon={<CheckIcon className="h-[18px] w-[18px]" />}
        tint="bg-ok-bg text-ok"
        label="Delivered"
        value={String(delivered)}
        caption="Completed hauls"
      />
      <KpiCard
        icon={<DollarIcon className="h-[18px] w-[18px]" />}
        tint="bg-ok-bg text-ok"
        label="Gross Revenue"
        value={usd(gross)}
        caption="Before costs"
      />
      <KpiCard
        icon={<WalletIcon className="h-[18px] w-[18px]" />}
        tint={net < 0 ? "bg-bad-bg text-bad" : "bg-ok-bg text-ok"}
        label="Net Profit"
        value={usd(net)}
        caption="After fuel & fees"
        flag={net < 0 ? "Loss" : undefined}
      />
      <KpiCard
        icon={<RoadIcon className="h-[18px] w-[18px]" />}
        tint="bg-steel-bg text-steel"
        label="Revenue Per Mile"
        value={`$${avgNetPerMile.toFixed(2)}`}
        caption="Net per loaded mile"
        secondary={`$${avgGrossPerMile.toFixed(2)} gross`}
      />
    </div>
  );
}

function KpiCard({
  icon,
  tint,
  label,
  value,
  caption,
  secondary,
  flag,
  href,
}: {
  icon: ReactNode;
  /** Fixed tint + fixed ink for the icon circle — carries the metric's meaning. */
  tint: string;
  label: string;
  value: string;
  caption: string;
  /** Second figure, for the per-mile card's gross line. */
  secondary?: string;
  /** Small tinted warning pill beside the label (a negative net). */
  flag?: string;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span
          aria-hidden
          className={
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-e1 " +
            tint
          }
        >
          {icon}
        </span>
        {href ? (
          <ChevronRightIcon className="mt-1 h-4 w-4 shrink-0 text-fg-subtle transition-transform duration-150 group-hover:translate-x-0.5" />
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="truncate text-[10px] font-bold uppercase tracking-[0.1em] text-fg-subtle">
          {label}
        </span>
        {flag ? (
          <span className="shrink-0 rounded-full bg-bad-bg px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] leading-none text-bad">
            {flag}
          </span>
        ) : null}
      </div>

      <div className="mt-1.5 truncate text-[22px] font-bold leading-none tracking-[-0.01em] tabular-nums text-fg sm:text-[26px]">
        {value}
      </div>

      <div className="mt-2 truncate text-[11px] tabular-nums text-fg-subtle">
        {secondary ?? caption}
      </div>
    </>
  );

  const surface =
    "group min-w-0 rounded-2xl border border-line bg-card p-3.5 shadow-e2 transition-all duration-150 sm:p-4";

  if (href) {
    return (
      <Link
        href={href}
        className={
          surface +
          " block hover:-translate-y-0.5 hover:shadow-e3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        }
      >
        {body}
      </Link>
    );
  }
  return <div className={surface + " hover:-translate-y-0.5 hover:shadow-e3"}>{body}</div>;
}
