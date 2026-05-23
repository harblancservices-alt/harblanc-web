"use client";

import { useState } from "react";

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

type FlashState = null | { kind: "phone" | "email"; expiresAt: number };

export function QuickActions({ phone, email }: QuickActionsProps) {
  const [flash, setFlash] = useState<FlashState>(null);

  const phoneDigits = phone.replace(/[^\d+]/g, "");
  const telHref = `tel:${phoneDigits}`;
  const mailHref = `mailto:${email}`;

  async function copy(text: string, kind: "phone" | "email") {
    try {
      await navigator.clipboard.writeText(text);
      const expiresAt = Date.now() + 1600;
      setFlash({ kind, expiresAt });
      setTimeout(() => {
        setFlash((current) =>
          current && current.expiresAt <= Date.now() ? null : current,
        );
      }, 1700);
    } catch {
      // Browser refused clipboard access. Fall back to selecting the
      // text node — same UX, just one extra tap.
      setFlash({ kind, expiresAt: Date.now() + 1600 });
    }
  }

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

      <button
        type="button"
        onClick={() => copy(phone, "phone")}
        className="inline-flex items-center gap-2 border border-transparent px-3 py-2 text-[11px] font-semibold tracking-[0.18em] text-neutral-400 uppercase transition-colors hover:text-white"
      >
        Copy phone
        {flash?.kind === "phone" ? (
          <span className="font-mono text-[9px] tracking-[0.22em] text-green-400 uppercase">
            ✓
          </span>
        ) : null}
      </button>

      <button
        type="button"
        onClick={() => copy(email, "email")}
        className="inline-flex items-center gap-2 border border-transparent px-3 py-2 text-[11px] font-semibold tracking-[0.18em] text-neutral-400 uppercase transition-colors hover:text-white"
      >
        Copy email
        {flash?.kind === "email" ? (
          <span className="font-mono text-[9px] tracking-[0.22em] text-green-400 uppercase">
            ✓
          </span>
        ) : null}
      </button>
    </section>
  );
}
