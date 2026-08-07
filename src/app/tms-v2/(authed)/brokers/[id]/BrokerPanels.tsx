import type { ReactNode } from "react";
import { Money } from "@/components/tms-v2/ui/Money";

/** Small presentational primitives for the broker profile's Overview/
 * Documents tabs — mirrors legacy's Panel/Row/AgeRow (BrokerDetail.tsx)
 * in V2 tokens, since Brent explicitly liked that layout and only wanted
 * the top of the page changed. */
export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card shadow-e1">
      <div className="border-b border-line px-3.5 py-2.5 text-[13px] font-semibold text-fg">{title}</div>
      <div className="divide-y divide-line">{children}</div>
    </div>
  );
}

export function Row({ label, value, muted = false }: { label: string; value: ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2 text-[13px]">
      <span className="text-fg-muted">{label}</span>
      <span className={muted ? "italic text-fg-subtle" : "font-medium text-fg"}>{value}</span>
    </div>
  );
}

export function AgeRow({ label, count, amount }: { label: string; count: number; amount: number }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2 text-[13px]">
      <span className="text-fg-muted">
        {label} <span className="text-fg-subtle">({count})</span>
      </span>
      <Money value={amount} tone={amount > 0 ? "negative" : "none"} className="font-medium" />
    </div>
  );
}
