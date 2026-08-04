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
