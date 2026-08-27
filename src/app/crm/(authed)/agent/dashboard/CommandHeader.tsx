"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Micro } from "../../accounts/[id]/desktop/file/chrome";
import type { DashboardSummary } from "../dashboardSummary";

/**
 * THE COMMAND HEADER — greeting, the day in one sentence, the queue button
 * and the five operational metrics.
 *
 * ── ONE DARK REGION, AS ON THE COMPANY FILE ───────────────────────────
 *
 * The reference draws this header dark AND every panel header below it
 * dark. That is exactly the arrangement Brent rejected on the company page
 * two days ago — "we need a better color scheme this is hard on the eyes" —
 * when a dark sidebar plus a dark header plus four dark card bands left
 * nowhere to rest. The resolution there was to spend the weight once: the
 * page header stays dark and everything below separates with edges.
 *
 * The same rule is applied here, because the brief says to reuse the
 * company file's design language and that language IS this decision. So the
 * command header is dark, matching the reference, and the panel headers
 * below are the tinted strips the company file uses. Flagged for Brent
 * rather than done silently — if he wants the dark bands back, it is one
 * change in the shared SectionHead.
 *
 * ── THE METRICS ARE OPERATIONAL, NOT ANALYTICS ────────────────────────
 *
 * Each is a count of rows that exist right now, computed by
 * dashboardSummary.ts. There is no aggregation layer, no time series and
 * nothing stored. A zero renders as a zero with a plain sub-line, because
 * on the live data most of them ARE zero today.
 */

function MetricCard({
  label,
  value,
  sub,
  alarm,
}: {
  label: string;
  value: number;
  sub: string | null;
  alarm?: boolean;
}) {
  return (
    <div
      className={`min-w-[150px] flex-1 border bg-graphite-2 px-3 py-2.5 ${
        // The one metric allowed to shout. Red means late across the whole
        // CRM, and being behind is the only thing on this strip that is a
        // problem rather than a fact.
        alarm ? "border-bad" : "border-white/12"
      }`}
    >
      <Micro className={alarm ? "block text-bad" : "block text-white/50"}>{label}</Micro>
      <div
        className={`mt-1 text-[22px] font-extrabold leading-none crm-num ${
          alarm ? "text-bad" : "text-white"
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-1 truncate text-[11px] text-white/50">{sub}</div>}
    </div>
  );
}

export function CommandHeader({
  name,
  summary,
  queueHref,
  createBar,
}: {
  name: string;
  summary: DashboardSummary;
  /** Where "Work the queue" goes — the first item's company, or null when
   * there is nothing queued, in which case the button is not a link. */
  queueHref: string | null;
  /** The existing creation dialogs, handed down rather than rebuilt. */
  createBar: ReactNode;
}) {
  return (
    <header>
      <div className="bg-graphite px-5 py-4">
        <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
          <div className="min-w-0">
            <h1 className="text-[26px] font-extrabold leading-none tracking-[-0.02em] text-white">
              {summary.greeting}, {name}.
            </h1>
            <p className="mt-2 text-[12.5px] text-white/60">{summary.line}</p>
          </div>

          {/* The one primary action on the page. */}
          <div className="shrink-0">
            {queueHref ? (
              <Link
                href={queueHref}
                prefetch={false}
                className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-accent-hover"
              >
                Work the queue · <span className="crm-num">{summary.queueCount}</span>
                <span aria-hidden>→</span>
              </Link>
            ) : (
              <span
                className="inline-flex cursor-default items-center gap-2 rounded-md border border-white/15 px-4 py-2.5 text-[13px] font-bold text-white/40"
                title="Nothing is queued — no overdue work, nothing due today and nothing waiting to be triaged."
              >
                Queue is empty
              </span>
            )}
          </div>

          <div className="ml-auto flex min-w-0 flex-wrap gap-2">
            {summary.metrics.map((m) => (
              <MetricCard
                key={m.key}
                label={m.label}
                value={m.value}
                sub={m.sub}
                alarm={m.alarm}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Create bar ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line-strong bg-card px-5 py-2.5">
        <Micro className="text-fg-muted">Create</Micro>
        {createBar}
        <span className="ml-auto hidden text-[11.5px] text-fg-subtle xl:block">
          Admin workloads and BOL Center arrivals land in triage automatically
        </span>
      </div>
    </header>
  );
}
