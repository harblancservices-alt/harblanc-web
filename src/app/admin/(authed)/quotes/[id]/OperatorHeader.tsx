"use client";

import { useState } from "react";
import { IconCheck, IconCopy } from "./icons";
import { formatPhoneDisplay } from "@/lib/admin/form-utils";

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
      {/* Block 1 (was Block 2) - Shipper of record */}
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
          value={formatPhoneDisplay(customer.phone) || customer.phone}
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
          actionHref={mailHref}
          actionLabel="Draft email"
          ariaLabel="email"
          dashed
        />
      </section>

      {/* Block 2 - Lane manifest (compact)
           One short card:
             Row A: ZIPs + arrow on the left, mileage + Map button on the right
             Row B: city sub-line (cities truncate on narrow widths)
             Row C: refined meta (received · date · ID) in a single line */}
      <section className="border border-black border-l-4 border-l-red-700 bg-[#fafaf6]">
        {lane.hasLane ? (
          <div className="px-4 py-3 sm:px-5">
            {/* Row A — ZIPs + Map cluster */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="font-mono text-xl font-medium tabular-nums text-black sm:text-2xl">
                {lane.pickupZip ?? "----"}
              </span>
              <span aria-hidden className="font-mono text-lg text-red-700 sm:text-xl">
                &rarr;
              </span>
              <span className="font-mono text-xl font-medium tabular-nums text-black sm:text-2xl">
                {lane.deliveryZip ?? "----"}
              </span>
              <div className="ml-auto flex items-center gap-2">
                {lane.miles != null ? (
                  <span className="inline-flex items-baseline gap-1 font-mono text-sm font-bold tabular-nums text-black">
                    {lane.miles.toLocaleString()}
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-black">
                      mi
                    </span>
                  </span>
                ) : null}
                {lane.pickupZip && lane.deliveryZip ? (
                  <a
                    href={`https://maps.apple.com/?saddr=${encodeURIComponent(lane.pickupZip)}&daddr=${encodeURIComponent(lane.deliveryZip)}&dirflg=d`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open route in Maps"
                    className="inline-flex items-center gap-1.5 bg-red-700 px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-red-600"
                  >
                    <IconPin className="h-3 w-3" />
                    Map
                  </a>
                ) : null}
              </div>
            </div>
            {/* Row B — city sub-line, truncates */}
            <p className="mt-1 truncate text-[13px] text-black">
              {lane.pickupLabel}
              <span aria-hidden className="mx-1.5 text-red-700">&rarr;</span>
              {lane.deliveryLabel}
            </p>
            {lane.miles == null ? (
              <p className="mt-1 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-red-700">
                Miles unavailable
              </p>
            ) : null}
          </div>
        ) : (
          <div className="px-4 py-3 sm:px-5">
            <p className="font-mono text-lg font-medium text-black sm:text-xl">
              Lane pending
            </p>
          </div>
        )}

        {/* Row C — meta footer, one line of dotted-separator data */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-black/15 bg-[#f3f1e9] px-4 py-1.5 sm:px-5">
          <span className="font-mono text-[11px] font-medium text-black">
            {identity.receivedRelative}
          </span>
          <span aria-hidden className="text-black/30">·</span>
          <span className="font-mono text-[11px] font-medium text-black">
            {identity.receivedFull}
          </span>
          <span aria-hidden className="text-black/30">·</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-red-700">
              ID
            </span>
            <span className="font-mono text-[11px] font-medium text-black">
              {identity.requestId}
            </span>
            <CopyButton value={identity.requestIdFull} ariaLabel="request ID" />
          </span>
        </div>
      </section>
    </div>
  );
}

function ContactRow({
  label,
  value,
  mono,
  actionHref,
  actionLabel,
  ariaLabel,
  dashed,
}: {
  label: string;
  value: string;
  mono?: boolean;
  actionHref?: string;
  actionLabel?: string;
  ariaLabel: string;
  dashed?: boolean;
}) {
  // Always truncate with ellipsis — break-all (the old "breakAll" branch)
  // shredded the email mid-word on narrow mobile widths
  // (dispatch@har / blancservice / s.com). The copy button next to the
  // value still grabs the full address so nothing is lost.
  const valueCls =
    "text-[16px] text-black truncate " + (mono ? "font-mono " : "");

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
          // Hidden on mobile — the whole row is already a tap target via
          // the anchor wrap around `inner`, so the affordance still works.
          // Frees up ~85px on the right so the value stops getting clipped.
          <a
            href={actionHref}
            className="hidden font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-red-700 hover:underline sm:inline-block"
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

/** Map-pin glyph for the inline MAP pill in the lane meta strip. */
function IconPin({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 21s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}
