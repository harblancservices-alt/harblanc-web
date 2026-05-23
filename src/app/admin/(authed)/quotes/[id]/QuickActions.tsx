"use client";

/**
 * One-tap dispatch actions bar — sits at the top of the workspace tab.
 *
 * Goal: reduce dispatch friction. Brent should be able to call, email,
 * or copy contact info without leaving the page. Built deliberately
 * understated — compact mono-cap row, no decorative buttons, no
 * iconography that competes with the workspace below.
 *
 * Phase 4A intentionally does not include "Mark booked" here — that
 * transition belongs to the StatusSelector dropdown so the same UI
 * carries every status change.
 */

export type QuickActionsProps = {
  phone: string;
  email: string;
};

export function QuickActions({ phone, email }: QuickActionsProps) {
  // Phase W2: Copy phone / Copy email buttons + their clipboard helper
  // and flash state were removed. The Call and Email anchors below
  // already render the phone / email text inline, which browsers expose
  // for selection / copy via right-click or triple-click — sufficient
  // for the dispatch workflow without dedicated copy buttons.

  const phoneDigits = phone.replace(/[^\d+]/g, "");
  const telHref = `tel:${phoneDigits}`;
  const mailHref = `mailto:${email}`;

  return (
    <section
      aria-label="Quick dispatch actions"
      className="flex flex-wrap items-stretch gap-2.5 border border-neutral-700 bg-neutral-800 p-3 shadow-md shadow-black/30"
    >
      <a
        href={telHref}
        className="inline-flex w-full items-center gap-2.5 border border-neutral-500 bg-neutral-700 px-4 py-3 text-[11px] font-semibold tracking-[0.18em] text-white uppercase transition-colors hover:border-red-500 hover:bg-neutral-600 sm:w-auto"
      >
        <span aria-hidden className="inline-block h-2 w-1 bg-red-600" />
        Call
        <span className="font-mono text-xs tracking-normal text-neutral-200 normal-case">
          {phone}
        </span>
      </a>

      <a
        href={mailHref}
        className="inline-flex w-full items-center gap-2.5 border border-neutral-500 bg-neutral-700 px-4 py-3 text-[11px] font-semibold tracking-[0.18em] text-white uppercase transition-colors hover:border-red-500 hover:bg-neutral-600 sm:w-auto"
      >
        <span aria-hidden className="inline-block h-2 w-1 bg-red-600" />
        Email
        <span
          className="max-w-[16ch] truncate font-mono text-xs tracking-normal text-neutral-200 normal-case"
          title={email}
        >
          {email}
        </span>
      </a>

    </section>
  );
}
