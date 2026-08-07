import Link from "next/link";
import type { ReactNode } from "react";
import { StatusPill } from "@/components/tms-v2/ui/StatusPill";
import { Money } from "@/components/tms-v2/ui/Money";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { loadTimelineStage } from "@/lib/domain/status";
import type { LoadWithFinancials } from "@/lib/data/loads";
import { LoadTimeline } from "./LoadTimeline";

function initials(name: string | null): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap rounded-full bg-elevated px-2 py-0.5 text-[11px] text-fg-muted">{children}</span>;
}

/** The rich load card Brent wants back — broker avatar, status pill, lane,
 * info chips, and the shipment timeline, mirroring legacy admin's board/
 * LoadCard.tsx modernized into v2 tokens. Stretched-link card normally;
 * in select mode (bulk delete) the avatar becomes a checkbox and the
 * whole card toggles selection instead of navigating. */
export function LoadCard({
  load,
  href,
  selectable = false,
  selected = false,
  onToggle,
}: {
  load: LoadWithFinancials;
  href: string;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const stage = loadTimelineStage(load.status, load.paymentStatus);
  const cancelled = load.status === "tonu";

  return (
    <div className="relative rounded-xl border border-line bg-card p-3.5 shadow-e1 transition-shadow hover:shadow-e2">
      {selectable ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={selected ? "Deselect load" : "Select load"}
          className="absolute inset-0 z-0"
        />
      ) : (
        <Link href={href} aria-label={`Open load ${load.loadNumber ?? load.id.slice(0, 8)}`} className="absolute inset-0 z-0" />
      )}

      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {selectable ? (
            <span
              aria-hidden
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-[13px] font-semibold ${
                selected ? "border-accent bg-accent text-white" : "border-line-strong bg-elevated text-fg-muted"
              }`}
            >
              {selected ? "✓" : ""}
            </span>
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-elevated text-[13px] font-semibold text-fg-muted">
              {initials(load.brokerName)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-fg">{load.brokerName ?? "No broker"}</p>
            <p className="truncate text-[12px] text-fg-muted">
              {load.origin ?? "—"} → {load.destination ?? "—"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusPill status={load.status} domain="load" />
          <Money value={load.financials.gross} tone="none" className="text-[13px] font-semibold" />
        </div>
      </div>

      <div className="relative z-10 mt-2.5 flex flex-wrap gap-1.5">
        <Chip>#{load.loadNumber ?? load.id.slice(0, 8)}</Chip>
        {load.pickupDate ? (
          <Chip>
            <DateTimeCST value={load.pickupDate} mode="date" />
            {load.deliveryDate ? (
              <>
                {" → "}
                <DateTimeCST value={load.deliveryDate} mode="date" />
              </>
            ) : null}
          </Chip>
        ) : null}
        {load.financials.loadedMiles > 0 ? <Chip>{Math.round(load.financials.loadedMiles).toLocaleString()} mi</Chip> : null}
        {load.tripName ? <Chip>{load.tripName}</Chip> : null}
      </div>

      <div className="relative z-10 mt-3">
        <LoadTimeline stage={stage} cancelled={cancelled} />
      </div>
    </div>
  );
}
