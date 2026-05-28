"use client";

import { useState } from "react";
import { IconCheck, IconCopy } from "./icons";

/**
 * HARBLANC freight-document operator header.
 *
 * Two stacked blocks below the BACK TO QUOTES link on every quote detail page:
 *
 *   Block 1 (lane manifest) - 4px red left bar, paper bg, hard 90deg edges.
 *     - "LANE / PICKUP > DELIVERY" mono caption
 *     - Lane numerals in real monospace with red arrow between (Plex Mono)
 *     - Optional city sub-line below + mileage stamp when resolved
 *     - Status STAMP BOX on the right (red bordered, mono caps) - replaces
 *       the previous Stripe-style yellow pill
 *     - Meta strip (Received / Date / REQ ID) under a thin top rule, with
 *       copy button on the REQ ID
 *
 *   Block 2 (shipper of record) - 4px red left bar, paper bg, hard edges.
 *     - Single bordered block with three rows: CUSTOMER / PHONE / EMAIL
 *     - Phone and email rows are clickable (tel:/mailto:) and announce the
 *       action as text ("TAP TO CALL" / "DRAFT EMAIL") in mono red - no
 *       chevron / edit icon clutter
 *     - Customer row keeps the copy-to-clipboard affordance
 *
 * The dead Edit and Chevron icon buttons from the prior REBUILD-2 P1 chrome
 * have been removed. The clipboard copy with 1.5s checkmark flash is kept.
 * Prop interface is unchanged so page.tsx's buildOperatorHeaderProps does
 * not need to update.
 */

export type OperatorHeaderProps = {
  customer: {
    name: string;
    phone: string;
    email: string;
  };
  identity: {
    requestId: string;
    requestIdFull: string;
    receivedRelative: string;
    receivedFull: string;
    statusLabel: string;
    /**
     * Retained on the prop type for backwards compatibility with the
     * existing builder in page.tsx; not consumed in the freight-document
     * rendering (the status renders as a stamp box, not a pill).
     */
    statusPillClasses: string;
  };
  lane: {
    pickupLabel: string;
    deliveryLabel: string;
    pickupZip: string | null;
    deliveryZip: string | null;
    miles: number | null;
    hasLane: boolean;
  };
};

export function OperatorHeader({
  customer,
  identity,
  lane,
}: OperatorHeaderProps) {
  const phoneHref = `tel:${customer.phone.replace(/[^\d+]/g, "")}`;
  const mailHref = `mailto:${customer.email}`;

  // Sub-line is only rendered when at least one zip is present. Keeps the
  // header tight when the lane is unresolved.
  const hasZipSub =
    Boolean(lane.pickupZip) || Boolean(lane.deliveryZip);

  return (
    <div className="space-y-3">
      {/* Block 1 - Lane manifest */}
      <section className="border border-black border-l-4 border-l-red-700 bg-[#fafaf6]">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-black">
              Lane &middot; Pickup &rarr; Delivery
            </p>
            {lane.hasLane ? (
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
                <span className="font-mono text-3xl font-medium tracking-tight text-black sm:text-4xl">
                  {lane.pickupLabel}
                </span>
                <span
                  aria-hidden
                  className="text-xl text-red-700"
                >
                  &rarr;
                </span>
                <span className="font-mono text-3xl font-medium tracking-tight text-black sm:text-4xl">
                  {lane.deliveryLabel}
                </span>
                {lane.miles != null ? (
                  <span className="inline-flex items-baseline gap-1 border border-red-700 px-1.5 py-0.5 font-mono text-[13px] font-medium tabular-nums text-red-700">
                    {lane.miles.toLocaleString()}
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em]">
                      mi
                    </span>
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="mt-1 font-mono text-2xl font-medium text-black sm:text-3xl">
                Lane pending
              </p>
            )}
            {hasZipSub ? (
              <p className="mt-1.5 font-mono text-[14px] font-bold text-red-700">
                {lane.pickupZip ?? "--"}
                <span aria-hidden className="mx-1.5 text-red-700">
                  &rarr;
                </span>
                {lane.deliveryZip ?? "--"}
                {lane.miles == null ? (
                  <span className="ml-3 text-[12px] font-normal text-black">
                    &middot; est. miles unavailable
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>

          {/* Status stamp box - replaces the yellow pill */}
          <div className="shrink-0 border border-red-700 px-2.5 py-1 text-center">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-black">
              Status
            </p>
            <p className="mt-0.5 font-mono text-[13px] font-bold uppercase tracking-[0.1em] text-red-700">
              {identity.statusLabel}
            </p>
          </div>
        </div>

        {/* Meta strip */}
        <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 border-t border-zinc-300 px-4 py-2.5 font-mono text-[12px] sm:grid-cols-3 sm:px-5">
          <div className="flex items-baseline gap-2">
            <span className="font-bold uppercase tracking-[0.14em] text-black">
              Received
            </span>
            <span className="text-black">
              {identity.receivedRelative}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-bold uppercase tracking-[0.14em] text-black">
              Date
            </span>
            <span className="text-black">
              {identity.receivedFull}
            </span>
          </div>
          <div className="flex items-baseline gap-2 sm:justify-end">
            <span className="font-bold uppercase tracking-[0.14em] text-black">
              Req ID
            </span>
            <span className="text-black">{identity.requestId}</span>
            <CopyButton
              value={identity.requestIdFull}
              ariaLabel="request ID"
            />
          </div>
        </div>
      </section>

      {/* Block 2 - Shipper of record */}
      <section className="border border-black border-l-4 border-l-red-700 bg-[#fafaf6]">
        <div className="flex items-center gap-2 border-b border-black bg-[#f3f1e9] px-3 py-1.5 sm:px-4">
          <span
            aria-hidden
            className="inline-block h-3.5 w-1 shrink-0 bg-red-700"
          />
          <p className="font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-black">
            Shipper of record
          </p>
        </div>
        <ContactRow
          label="Customer"
          value={customer.name}
          ariaLabel="customer name"
        />
        <ContactRow
          label="Phone"
          value={customer.phone}
          mono
          actionHref={phoneHref}
          actionLabel="Tap to call"
          ariaLabel="phone"
          dashed
        />
        <ContactRow
          label="Email"
          value={customer.email}
          mono
          breakAll
          actionHref={mailHref}
          actionLabel="Draft email"
          ariaLabel="email"
          dashed
        />
      </section>
    </div>
  );
}

function ContactRow({
  label,
  value,
  mono,
  breakAll,
  actionHref,
  actionLabel,
  ariaLabel,
  dashed,
}: {
  label: string;
  value: string;
  mono?: boolean;
  breakAll?: boolean;
  actionHref?: string;
  actionLabel?: string;
  ariaLabel: string;
  dashed?: boolean;
}) {
  const valueCls =
    "text-[16px] text-black " +
    (mono ? "font-mono " : "") +
    (breakAll ? "break-all " : "truncate ");

  const inner = (
    <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 sm:px-4">
      <div className="w-[80px] shrink-0 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-black">
        {label}
      </div>
      <div className="min-w-0 flex-1">
        <p className={valueCls}>{value}</p>
      </div>
    </div>
  );

  return (
    <div
      className={
        "flex items-stretch " +
        (dashed ? "border-t border-dashed border-zinc-300" : "")
      }
    >
      {actionHref ? (
        <a
          href={actionHref}
          className="flex min-w-0 flex-1 transition-colors hover:bg-[#f3f1e9]"
        >
          {inner}
        </a>
      ) : (
        inner
      )}
      <div className="flex shrink-0 items-center gap-2 pr-3 sm:pr-4">
        {actionHref && actionLabel ? (
          <a
            href={actionHref}
            className="font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-red-700 hover:underline"
          >
            {actionLabel}
          </a>
        ) : null}
        <CopyButton value={value} ariaLabel={ariaLabel} />
      </div>
    </div>
  );
}

function CopyButton({
  value,
  ariaLabel,
}: {
  value: string;
  ariaLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const disabled = value.trim().length === 0;

  function handleClick() {
    if (disabled) return;
    // navigator.clipboard.writeText requires a secure context (HTTPS or
    // localhost). In production both apply; the catch is defensive so a
    // misconfigured preview environment surfaces the failure in console
    // instead of silently swallowing the click.
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch((err) => {
        console.error("[CopyButton] clipboard write failed", err);
      });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label={copied ? `Copied ${ariaLabel}` : `Copy ${ariaLabel}`}
      title={copied ? "Copied" : "Copy"}
      className={
        "inline-flex h-6 w-6 shrink-0 items-center justify-center border transition-colors " +
        (disabled
          ? "cursor-not-allowed border-zinc-300 text-black"
          : copied
            ? "border-emerald-700 bg-emerald-50 text-emerald-800"
            : "border-zinc-300 bg-white text-black hover:border-black")
      }
    >
      {copied ? (
        <IconCheck className="h-3 w-3" />
      ) : (
        <IconCopy className="h-3 w-3" />
      )}
    </button>
  );
}
