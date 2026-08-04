"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { StatusTag, type StatusTone } from "@/components/ui/StatusTag";
import { markLoadPaid } from "../../loads/actions";

/**
 * Linked-loads list — a calm, hairline-divided list (not the old boxed load
 * cards). Collapses to the first VISIBLE_COUNT loads with a "View all N
 * loads" expander when the trip has more than that — every load stays on
 * this same page, nothing links out to a page that doesn't exist.
 */

export type TripLoadItem = {
  id: string;
  broker: string;
  origin: string;
  destination: string;
  loadNumber: string | null;
  dateLabel: string | null;
  miles: number | null;
  statusTone: StatusTone;
  statusLabel: string;
  rate: number;
  net: number;
  pct: number | null;
  unpaid: boolean;
  paid: boolean;
};

const VISIBLE_COUNT = 5;

function usd(n: number): string {
  const r = Math.round(n);
  return (r < 0 ? "-$" : "$") + Math.abs(r).toLocaleString("en-US");
}

export function TripLoadsList({ loads }: { loads: TripLoadItem[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? loads : loads.slice(0, VISIBLE_COUNT);
  const hiddenCount = loads.length - visible.length;

  return (
    <div>
      <div className="divide-y divide-line rounded-xl border border-line-strong bg-card px-4 shadow-e1 sm:px-5">
        {visible.map((l) => (
          <TripLoadRow key={l.id} load={l} />
        ))}
      </div>
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 text-[12.5px] font-semibold text-accent hover:underline"
        >
          View all {loads.length} loads
        </button>
      ) : null}
    </div>
  );
}

function TripLoadRow({ load: l }: { load: TripLoadItem }) {
  const tone = l.net < 0 ? "text-bad" : "text-ok";
  const metaParts = [
    l.loadNumber ? `#${l.loadNumber}` : null,
    l.dateLabel,
    l.miles != null ? `${l.miles.toLocaleString()} mi` : null,
  ].filter(Boolean);

  return (
    <div className="py-3 first:pt-3.5 last:pb-3.5">
      <Link
        href={"/admin/dispatch/loads/" + l.id}
        prefetch={false}
        className="flex items-start justify-between gap-3 rounded-md"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[15px] font-bold leading-tight text-fg">
              {l.broker || "—"}
            </span>
            <StatusTag tone={l.statusTone}>{l.statusLabel}</StatusTag>
          </div>
          <div className="mt-0.5 truncate text-[12.5px] text-fg-muted">
            {l.origin || "—"} <span className="text-fg-muted">→</span>{" "}
            {l.destination || "—"}
          </div>
          {metaParts.length > 0 ? (
            <div className="mt-1 truncate font-mono text-[11px] font-semibold tabular-nums text-fg-muted">
              {metaParts.join(" · ")}
            </div>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[14px] font-bold tabular-nums text-fg">
            {usd(l.rate)}
          </div>
          <div
            className={
              "mt-0.5 font-mono text-[11px] font-bold tabular-nums " + tone
            }
          >
            {usd(l.net)}
            {l.pct != null ? ` · ${Math.round(l.pct)}%` : ""}
          </div>
        </div>
      </Link>

      {l.unpaid || l.paid ? (
        <div className="mt-2 flex justify-end">
          {l.unpaid ? (
            <form action={markLoadPaid.bind(null, l.id)}>
              <Button variant="primary" size="xs" type="submit">
                Mark paid
              </Button>
            </form>
          ) : (
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-ok">
              Paid
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
