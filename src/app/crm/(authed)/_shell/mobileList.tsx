"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { IconPhone, IconMail } from "./icons";
import { digitsForTel } from "./contactFields";
import { BTN_EDIT } from "./ui";

/**
 * THE PHONE LAYOUT for the four list screens.
 *
 * Brent: "I need you to order the companies list and the contact list for
 * both admin and sales agents for the mobile side only. the idea is that
 * the list is going to be easy to search and you can click to call and
 * click to email."
 *
 * This is used from a truck stop, not a desk, so the rules are different
 * from the desktop tables it sits beside:
 *
 *   SEARCH IS THE INTERFACE. Nobody scrolls 99 companies on a 390px screen.
 *   The search field is full width, at the top, and sticky — it stays put
 *   while the list moves under it, because the moment it scrolls away the
 *   list is unusable again.
 *
 *   44px TOUCH TARGETS. Apple's and Google's own floor, and the difference
 *   between calling a customer and calling the row above them. The desktop
 *   action buttons are 28px; these are not those.
 *
 *   NO TABLE. Admin's two lists are 860px and 880px minimum-width tables,
 *   which on a phone is a horizontal scrollbar and nothing else. A row is a
 *   stack: who it is, then how to reach them, then the actions.
 *
 * ── WHY DISABLED ACTIONS ARE STILL DRAWN ──────────────────────────────
 *
 * Half the rows have nothing to call. Hiding the button on those rows would
 * make every row a different width and move the call target around under
 * the thumb, which is exactly how you dial the wrong company. The slot is
 * always there; when there is nothing behind it, it is visibly dead and
 * says why on long-press.
 */

/** 44px minimum, both axes. The whole point of the mobile pass. */
const TOUCH =
  "inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-3 text-[12.5px] font-bold transition-colors";
const TOUCH_DEAD = "cursor-not-allowed border border-line bg-inset text-fg-subtle opacity-70";

export function CallAction({
  phone,
  who,
  /** Shown when there is nothing to call — the honest reason, not a shrug. */
  emptyReason,
}: {
  phone: string | null;
  /** Who the call actually reaches. Named, because on a company row the
   * number belongs to a person and Brent asked to see who before he taps. */
  who: string;
  emptyReason: string;
}) {
  if (!phone) {
    return (
      <span aria-disabled title={emptyReason} className={`${TOUCH} ${TOUCH_DEAD}`}>
        <IconPhone width={15} height={15} />
        Call
      </span>
    );
  }
  return (
    <a
      href={`tel:${digitsForTel(phone)}`}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Call ${who} on ${phone}`}
      className={`${TOUCH} ${BTN_EDIT}`}
    >
      <IconPhone width={15} height={15} />
      Call
    </a>
  );
}

export function EmailAction({
  email,
  who,
  emptyReason,
}: {
  email: string | null;
  who: string;
  emptyReason: string;
}) {
  if (!email) {
    return (
      <span aria-disabled title={emptyReason} className={`${TOUCH} ${TOUCH_DEAD}`}>
        <IconMail width={15} height={15} />
        Email
      </span>
    );
  }
  return (
    <a
      href={`mailto:${email}`}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Email ${who} at ${email}`}
      className={`${TOUCH} ${BTN_EDIT}`}
    >
      <IconMail width={15} height={15} />
      Email
    </a>
  );
}

/**
 * One row. The whole row is the link to the record; the actions sit inside
 * it and stop propagation, so a tap on Call dials rather than navigating.
 */
export function MobileRow({
  href,
  title,
  /** The line under the name — who to call, or which company they are at. */
  subtitle,
  /** Small third line: stage, city, when they were last spoken to. */
  meta,
  actions,
}: {
  href: string;
  title: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <li className="border-t border-line first:border-t-0">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <Link
          href={href}
          prefetch={false}
          className="flex min-h-11 min-w-0 flex-1 flex-col justify-center"
        >
          <span className="truncate text-[14px] font-bold text-fg">{title}</span>
          {subtitle && (
            <span className="mt-0.5 truncate text-[12.5px] text-fg-muted">{subtitle}</span>
          )}
          {meta && <span className="mt-0.5 truncate text-[11.5px] text-fg-subtle">{meta}</span>}
        </Link>
        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      </div>
    </li>
  );
}

/** The list itself, and the sticky header that holds the search box. */
export function MobileList({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col">{children}</ul>;
}

/**
 * Keeps the search field on screen while the list scrolls under it.
 * `top-0` against the page scroller — these list pages scroll the document
 * rather than an inner pane, so this is the sticky that actually works.
 */
export function MobileSearchBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-0 z-20 -mx-3 mb-1 border-b border-line bg-card px-3 py-2.5 shadow-e1">
      {children}
    </div>
  );
}

export function MobileEmpty({ children }: { children: ReactNode }) {
  return <p className="px-3 py-10 text-center text-[12.5px] text-fg-subtle">{children}</p>;
}
