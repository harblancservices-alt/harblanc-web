"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import type { LoadRow } from "../LoadBoardView";
import { BADGE, STAGES, badgeOf, initials, stageOf } from "./shared";
import {
  BoxIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  DollarIcon,
  FlagIcon,
  InvoiceIcon,
  PhoneIcon,
  PinIcon,
  RoadIcon,
  TimelineIcon,
  TruckIcon,
} from "./icons";

/**
 * One load, as a premium logistics card — the single load renderer the board
 * draws at every width, exactly as before: a phone load and a desktop load are
 * the same object, not two designs to keep in sync.
 *
 * Reads top to bottom as: who the load is for → what it is → what it's worth →
 * where it is → what to do about it.
 *
 * Every figure comes from the server. `net` is the canonical per-load net
 * (loadNet); `rate` already accounts for a cancelled load earning only its
 * TONU. The card derives two ratios from those and nothing else.
 *
 * NAVIGATION. The card body taps through to the load detail via a stretched
 * overlay link rather than a wrapping anchor — the action row holds links of
 * its own, which cannot legally nest inside one. The action row sits at z-10,
 * above the overlay, so pressing Call Broker never doubles as opening the load.
 * In delete mode the overlay is replaced by a select button and the actions are
 * withdrawn, so the whole card is one unambiguous target.
 */
export function LoadCard({
  row: r,
  selectMode,
  isSel,
  onToggle,
}: {
  row: LoadRow;
  selectMode: boolean;
  isSel: boolean;
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const badge = BADGE[badgeOf(r)];
  const stage = stageOf(r);
  const brokerHref = r.brokerId ? `/admin/dispatch/brokers/${r.brokerId}` : null;

  return (
    <article
      className={
        "relative flex flex-col overflow-hidden rounded-2xl border shadow-e2 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-e3 " +
        (isSel ? "border-bad bg-bad-bg" : "border-line bg-card")
      }
    >
      <div className="p-4 sm:p-5">
        {/* ── Identity ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-graphite text-[14px] font-bold tracking-[0.02em] text-white shadow-e1"
            >
              {initials(r.broker)}
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-[18px] font-bold leading-tight tracking-[-0.01em] text-fg sm:text-[22px]">
                {r.broker}
              </h3>
              <p className="mt-1 truncate text-[12.5px] text-fg-muted sm:text-[13px]">
                {r.origin} <span className="text-fg-subtle">→</span>{" "}
                {r.destination}
              </p>
            </div>
          </div>

          <span
            className={
              "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] leading-none " +
              badge.pill
            }
          >
            {badge.label}
          </span>
        </div>

        {/* ── Metadata pills ────────────────────────────────────────────── */}
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
          <Pill tone="steel" icon={<InvoiceIcon className="h-3 w-3" />}>
            #{r.loadNumber}
          </Pill>
          <Pill tone="neutral" icon={<CalendarIcon className="h-3 w-3" />}>
            {r.pickup} <span className="opacity-50">→</span> {r.delivery}
          </Pill>
          {r.loadedMiles != null ? (
            <Pill tone="steel" icon={<RoadIcon className="h-3 w-3" />}>
              {r.loadedMiles.toLocaleString()} mi
            </Pill>
          ) : null}
          {r.trip ? (
            <Pill tone="neutral" icon={<TruckIcon className="h-3 w-3" />}>
              {r.trip}
            </Pill>
          ) : null}
        </div>

        {/* ── Shipment timeline ─────────────────────────────────────────── */}
        <Timeline stage={stage} cancelled={r.status === "cancelled"} />

        {/* ── More: the columns the old board's table carried that the card
            doesn't show at rest. Kept off-screen until asked for rather than
            dropped. */}
        {open ? (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-xl bg-inset px-3.5 py-3 shadow-e1">
            <Detail label="Equipment" value={r.equipment || "—"} />
            <Detail
              label="Deadhead"
              value={r.dhMiles > 0 ? `${Math.round(r.dhMiles).toLocaleString()} mi` : "—"}
            />
            <Detail label="Trip" value={r.trip || "—"} />
            <Detail
              label="Payment"
              value={r.paymentStatus === "paid" ? "Paid" : "Unpaid"}
            />
          </dl>
        ) : null}
      </div>

      {/* ── Actions ────────────────────────────────────────────────────────
          Above the stretched link (z-10) so a tap here never doubles as
          navigation. Withdrawn in delete mode, where the whole card is a
          single select target. */}
      {selectMode ? null : (
        <div className="relative z-10 mt-auto grid grid-cols-3 gap-2 border-t border-line px-4 py-3 sm:px-5">
          <Button
            href={`/admin/dispatch/loads/${r.id}`}
            prefetch={false}
            variant="navigate"
            size="md"
            fullWidth
            className="px-1.5! text-[11px]! sm:px-3! sm:text-[12px]!"
          >
            <span className="min-w-0 truncate">View Details</span>
          </Button>
          {brokerHref ? (
            <Button
              href={brokerHref}
              prefetch={false}
              variant="navigate"
              size="md"
              fullWidth
              leftIcon={<PhoneIcon className="h-3.5 w-3.5 shrink-0" />}
              className="px-1.5! text-[11px]! sm:px-3! sm:text-[12px]!"
            >
              <span className="min-w-0 truncate">Call Broker</span>
            </Button>
          ) : (
            <Button
              variant="navigate"
              size="md"
              fullWidth
              disabled
              title="No broker profile linked to this load"
              leftIcon={<PhoneIcon className="h-3.5 w-3.5 shrink-0" />}
              className="px-1.5! text-[11px]! sm:px-3! sm:text-[12px]!"
            >
              <span className="min-w-0 truncate">Call Broker</span>
            </Button>
          )}
          <Button
            type="button"
            variant="navigate"
            size="md"
            fullWidth
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="px-1.5! text-[11px]! sm:px-3! sm:text-[12px]!"
          >
            <span className="min-w-0 truncate">More</span>
            <ChevronDownIcon
              className={
                "h-3.5 w-3.5 shrink-0 transition-transform duration-150 " +
                (open ? "rotate-180" : "")
              }
            />
          </Button>
        </div>
      )}

      {/* Stretched target. Rendered last so it stacks under the action row. */}
      {selectMode ? (
        <button
          type="button"
          aria-pressed={isSel}
          aria-label={`Select load ${r.loadNumber}`}
          onClick={() => onToggle(r.id)}
          className="absolute inset-0 z-20 rounded-2xl focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          {/* Visual checkbox — the whole card is the hit target, so this is an
              indicator pinned to the corner rather than a control of its own. */}
          <span
            aria-hidden
            className={
              "absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-md border-2 shadow-e1 " +
              (isSel
                ? "border-bad bg-bad text-white"
                : "border-line-strong bg-white text-transparent")
            }
          >
            <CheckIcon className="h-3.5 w-3.5" />
          </span>
        </button>
      ) : (
        <Link
          href={`/admin/dispatch/loads/${r.id}`}
          prefetch={false}
          aria-label={`Open load ${r.loadNumber}`}
          className="absolute inset-x-0 top-0 bottom-[58px] rounded-t-2xl focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        />
      )}
    </article>
  );
}

/* ── Timeline ────────────────────────────────────────────────────────────── */

const STAGE_ICON = [
  PinIcon,
  BoxIcon,
  TruckIcon,
  FlagIcon,
  InvoiceIcon,
  DollarIcon,
] as const;

/**
 * The six-stage shipment tracker. Stages below the current one are complete
 * (green, checked), the current one is live (blue, ringed), the rest are ahead
 * (gray). The connecting segments fill in sequence on mount via a per-index
 * transition delay, so the line reads as the load's progress being drawn rather
 * than as a static diagram.
 *
 * A cancelled load never rolled: the whole tracker greys out rather than
 * claiming a Pickup that didn't happen.
 *
 * Every colour here is a fixed fill with fixed content (green/blue + white,
 * inset + ink), so the tracker is identical under both admin themes.
 */
function Timeline({ stage, cancelled }: { stage: number; cancelled: boolean }) {
  // The tracker's RESTING state is already the true one: every circle and
  // segment renders in its final colour, and the keyframes below only sweep
  // them in. An earlier draft drove this from state raised in an effect, which
  // made the stage hostage to the animation — in a backgrounded tab (where
  // requestAnimationFrame is throttled to zero) the whole tracker sat grey and
  // silently misreported every load. Motion is decoration; the stage is data.
  const drawn = cancelled ? -1 : stage;

  return (
    <div className="mt-4">
      <div className="flex items-center gap-1.5 text-fg-subtle">
        <TimelineIcon className="h-3.5 w-3.5" />
        <span className="text-[9.5px] font-bold uppercase tracking-[0.12em]">
          Shipment Timeline
        </span>
      </div>

      <div className="mt-2.5 flex items-start">
        {STAGES.map((name, i) => {
          const Glyph = STAGE_ICON[i];
          const done = !cancelled && i < drawn;
          const current = !cancelled && i === drawn;
          const circle = done
            ? "bg-ok text-white"
            : current
              ? "bg-info text-white ring-4 ring-info/20"
              : "bg-inset text-ink-3";
          // The segment entering stage i is filled once stage i is reached.
          const before = !cancelled && i <= drawn ? "bg-ok" : "bg-inset";
          const after = !cancelled && i < drawn ? "bg-ok" : "bg-inset";
          return (
            <div
              key={name}
              className="flex min-w-0 flex-1 flex-col items-center"
            >
              <div className="flex w-full items-center">
                <span
                  aria-hidden
                  className={
                    "h-[3px] flex-1 origin-left rounded-full " +
                    (i === 0 ? "bg-transparent" : before)
                  }
                  style={{
                    animation: `lb-grow 420ms ease-out ${i * 90}ms backwards`,
                  }}
                />
                <span
                  className={
                    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full " +
                    circle
                  }
                  style={{
                    animation: `lb-pop 320ms ease-out ${i * 90}ms backwards`,
                  }}
                >
                  {done ? (
                    <CheckIcon className="h-3.5 w-3.5" />
                  ) : (
                    <Glyph className="h-3.5 w-3.5" />
                  )}
                </span>
                <span
                  aria-hidden
                  className={
                    "h-[3px] flex-1 origin-left rounded-full " +
                    (i === STAGES.length - 1 ? "bg-transparent" : after)
                  }
                  style={{
                    animation: `lb-grow 420ms ease-out ${i * 90 + 45}ms backwards`,
                  }}
                />
              </div>
              <span
                className={
                  "mt-1.5 w-full truncate px-0.5 text-center text-[8.5px] font-bold uppercase tracking-[0.04em] sm:text-[9.5px] " +
                  (done || current ? "text-fg-muted" : "text-fg-subtle")
                }
              >
                {name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

function Pill({
  tone,
  icon,
  children,
}: {
  tone: "steel" | "neutral";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span
      className={
        "inline-flex max-w-full items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold tabular-nums leading-none " +
        (tone === "steel"
          ? "bg-steel-bg text-steel"
          : "bg-inset font-semibold text-ink-2")
      }
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[9px] font-bold uppercase tracking-[0.1em] text-ink-3">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[12.5px] font-semibold text-ink">
        {value}
      </dd>
    </div>
  );
}
