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

function Avatar({
  selectable,
  selected,
  brokerName,
  size = "h-9 w-9",
}: {
  selectable: boolean;
  selected: boolean;
  brokerName: string | null;
  size?: string;
}) {
  if (selectable) {
    return (
      <span
        aria-hidden
        className={`flex ${size} shrink-0 items-center justify-center rounded-full border-2 text-[13px] font-semibold ${
          selected ? "border-accent bg-accent text-white" : "border-line-strong bg-elevated text-fg-muted"
        }`}
      >
        {selected ? "✓" : ""}
      </span>
    );
  }
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-elevated text-[13px] font-semibold text-fg-muted`}>
      {initials(brokerName)}
    </span>
  );
}

function ChipsRow({ load }: { load: LoadWithFinancials }) {
  return (
    <>
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
    </>
  );
}

/** The rich load card Brent wants back — broker avatar, status pill, lane,
 * info chips, and the shipment timeline, mirroring legacy admin's board/
 * LoadCard.tsx modernized into v2 tokens. Stretched-link card normally;
 * in select mode (bulk delete) the avatar becomes a checkbox and the
 * whole card toggles selection instead of navigating.
 *
 * Mobile-scoped layout split (standing rule): mobile renders Brent's
 * chosen "Option C" — avatar on the left, the LANE as the bold headline
 * (broker demoted to the secondary line under it, rate right-aligned
 * beside it), then chips, then the timeline, with generous padding.
 * Desktop keeps the original broker-headline layout unchanged until the
 * later dedicated PC pass.
 */
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
    <div className="relative rounded-xl border border-line bg-card shadow-e1 transition-shadow hover:shadow-e2">
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

      {/* Mobile — Option C. Deliberately NOT `relative z-10`: this content
          has no interactive controls of its own, so it must stay a plain,
          unpositioned layer — the absolutely-positioned stretched Link/
          select-button above already paints above static content by
          default and needs to stay the click target for the whole card.
          Giving this wrapper its own stacking context (as an earlier pass
          did) put it ABOVE that overlay and swallowed every tap. */}
      <div className="flex flex-col gap-4 p-4 lg:hidden">
        <div className="flex items-start gap-3">
          <Avatar selectable={selectable} selected={selected} brokerName={load.brokerName} size="h-11 w-11" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate text-[15px] font-semibold text-fg">
                {load.origin ?? "—"} → {load.destination ?? "—"}
              </p>
              <StatusPill status={load.status} domain="load" className="shrink-0" />
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-[13px] text-fg-muted">{load.brokerName ?? "No broker"}</p>
              <Money value={load.financials.gross} tone="none" className="shrink-0 text-[14px] font-semibold" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <ChipsRow load={load} />
        </div>

        <LoadTimeline stage={stage} cancelled={cancelled} paid={load.paymentStatus === "paid"} />
      </div>

      {/* Desktop — same click-through fix as the mobile block above, no
          layout change (later PC pass still owns everything else here). */}
      <div className="hidden p-3.5 lg:block">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar selectable={selectable} selected={selected} brokerName={load.brokerName} />
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

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <ChipsRow load={load} />
        </div>

        <div className="mt-3">
          <LoadTimeline stage={stage} cancelled={cancelled} paid={load.paymentStatus === "paid"} />
        </div>
      </div>
    </div>
  );
}
