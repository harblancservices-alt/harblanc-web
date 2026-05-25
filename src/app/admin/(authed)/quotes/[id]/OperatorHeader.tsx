"use client";

import { useState } from "react";
import {
  IconArrowRight,
  IconCalendar,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconCopy,
  IconEdit,
  IconMail,
  IconPhone,
  IconUser,
} from "./icons";

/**
 * Phase REBUILD-2 P1 correction — Operator Header restructured to
 * match the dispatch-ticket visual reference.
 *
 * Two stacked cards inside the section, each carrying a red 4px
 * left border:
 *   1. Lane card  — horizontal lane row + status pill,
 *                   metadata strip below with calendar / clock /
 *                   request ID
 *   2. Contact card — three operational rows (Customer, Phone,
 *                   Email), each with icon + label + value +
 *                   edit, copy, and chevron action buttons.
 *
 * Edit button is visually present but its server-action wiring lands
 * in REBUILD-2 P2. Copy button writes the row’s current value to
 * the clipboard with a 1500ms checkmark flash. Chevron is the same
 * tap-to-call/mail action as clicking the value area on phone/email
 * rows; on the customer row it sits inert as a structural marker.
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

export function OperatorHeader({ customer, identity, lane }: OperatorHeaderProps) {
  const phoneHref = `tel:${customer.phone.replace(/[^\d+]/g, "")}`;
  const mailHref = `mailto:${customer.email}`;

  return (
    <div className="space-y-2">
      {/* Card 1: Lane + metadata */}
      <section className="overflow-hidden rounded border border-zinc-400 border-l-4 border-l-red-600 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-5 sm:py-3.5">
          {lane.hasLane ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-2xl font-bold tracking-tight text-black sm:text-3xl">
                {lane.pickupLabel}
              </span>
              <IconArrowRight className="h-5 w-5 shrink-0 self-center text-red-600 sm:h-6 sm:w-6" />
              <span className="text-2xl font-bold tracking-tight text-black sm:text-3xl">
                {lane.deliveryLabel}
              </span>
              <span className="font-mono text-xs text-black">
                {lane.pickupZip ?? ""}
                <span aria-hidden className="mx-1.5 text-red-600">&rarr;</span>
                {lane.deliveryZip ?? ""}
              </span>
              {lane.miles != null ? (
                // Highlighted mileage chip — the lane length is the
                // first thing the operator checks against the rate
                // they're about to quote, so it gets its own pill
                // with HARBLANC red accent instead of riding the
                // ZIP strip in muted mono.
                <span className="inline-flex shrink-0 items-center gap-1 border-2 border-red-600 bg-red-50 px-2 py-0.5 font-mono text-[13px] font-bold tabular-nums text-red-700">
                  {lane.miles.toLocaleString()}
                  <span className="text-[10px] uppercase tracking-[0.12em] text-red-700">
                    mi
                  </span>
                </span>
              ) : null}
            </div>
          ) : (
            <span className="text-xl font-bold text-black sm:text-2xl">
              Lane pending
            </span>
          )}
          <span
            className={
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold " +
              identity.statusPillClasses
            }
          >
            <span aria-hidden className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
            {identity.statusLabel}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-zinc-300 bg-white px-3 py-2 sm:px-5">
          <span className="inline-flex items-center gap-1.5 font-mono text-xs text-black">
            <IconCalendar className="h-3.5 w-3.5 shrink-0 text-black" />
            Received {identity.receivedRelative}
          </span>
          <span aria-hidden className="hidden h-3 w-px shrink-0 bg-zinc-400 sm:inline-block" />
          <span className="inline-flex items-center gap-1.5 font-mono text-xs text-black">
            <IconClock className="h-3.5 w-3.5 shrink-0 text-black" />
            {identity.receivedFull}
          </span>
          <span aria-hidden className="hidden h-3 w-px shrink-0 bg-zinc-400 sm:inline-block" />
          <span className="inline-flex flex-1 items-center justify-end gap-1.5 font-mono text-xs text-black">
            <span className="text-[10px] font-semibold uppercase tracking-wider">
              Req ID
            </span>
            <span className="font-semibold">{identity.requestId}</span>
            <RowCopyButton value={identity.requestIdFull} ariaLabel="request ID" />
          </span>
        </div>
      </section>

      {/* Card 2: Customer / Phone / Email rows */}
      <section className="overflow-hidden rounded border border-zinc-400 border-l-4 border-l-red-600 bg-white">
        <ContactRow
          icon={<IconUser className="h-5 w-5 shrink-0 text-red-600" />}
          label="Customer"
          value={customer.name}
          copyAriaLabel="customer name"
        />
        <ContactRow
          icon={<IconPhone className="h-5 w-5 shrink-0 text-red-600" />}
          label="Phone"
          value={customer.phone}
          mono
          primaryHref={phoneHref}
          copyAriaLabel="phone"
        />
        <ContactRow
          icon={<IconMail className="h-5 w-5 shrink-0 text-red-600" />}
          label="Email"
          value={customer.email}
          breakAll
          primaryHref={mailHref}
          copyAriaLabel="email"
          last
        />
      </section>
    </div>
  );
}

// âââ Contact row ââââââââââââââââââââââââââââââââââââââââââââââââââââ

function ContactRow({
  icon,
  label,
  value,
  primaryHref,
  copyAriaLabel,
  mono,
  breakAll,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  primaryHref?: string;
  copyAriaLabel: string;
  mono?: boolean;
  breakAll?: boolean;
  last?: boolean;
}) {
  const borderClass = last ? "" : "border-b border-zinc-300";
  const valueClass =
    "text-[15px] font-bold text-black " +
    (mono ? "font-mono " : "") +
    (breakAll ? "break-all " : "truncate ");

  const body = (
    <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 sm:px-5">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-black">
          {label}
        </p>
        <p className={valueClass}>{value}</p>
      </div>
    </div>
  );

  return (
    <div className={"flex items-stretch " + borderClass}>
      {primaryHref ? (
        <a
          href={primaryHref}
          className="flex min-w-0 flex-1 transition-colors hover:bg-zinc-50"
        >
          {body}
        </a>
      ) : (
        body
      )}
      <div className="flex shrink-0 items-center gap-1 pr-2 sm:pr-2.5">
        <RowIconButton
          icon={<IconEdit className="h-3.5 w-3.5" />}
          ariaLabel={`Edit ${label} (REBUILD-2 P2)`}
          disabled
        />
        <RowCopyButton value={value} ariaLabel={copyAriaLabel} />
        <RowIconButton
          icon={<IconChevronRight className="h-4 w-4" />}
          ariaLabel={primaryHref ? `Open ${label}` : `Expand ${label}`}
          asLinkHref={primaryHref}
        />
      </div>
    </div>
  );
}

// âââ Small action buttons âââââââââââââââââââââââââââââââââââââââââââ

function RowIconButton({
  icon,
  ariaLabel,
  disabled,
  asLinkHref,
}: {
  icon: React.ReactNode;
  ariaLabel: string;
  disabled?: boolean;
  asLinkHref?: string;
}) {
  const cls =
    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-zinc-300 bg-white transition-colors " +
    (disabled
      ? "cursor-not-allowed text-zinc-400"
      : "text-black hover:border-zinc-400 hover:bg-zinc-50");
  if (asLinkHref && !disabled) {
    return (
      <a href={asLinkHref} aria-label={ariaLabel} className={cls}>
        {icon}
      </a>
    );
  }
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      className={cls}
    >
      {icon}
    </button>
  );
}

function RowCopyButton({
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
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
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
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border transition-colors " +
        (disabled
          ? "cursor-not-allowed border-zinc-300 bg-white text-zinc-400"
          : copied
            ? "border-emerald-600 bg-emerald-50 text-emerald-700"
            : "border-zinc-300 bg-white text-black hover:border-zinc-400 hover:bg-zinc-50")
      }
    >
      {copied ? (
        <IconCheck className="h-3.5 w-3.5" />
      ) : (
        <IconCopy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
