"use client";

import { useRouter } from "next/navigation";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";

/**
 * A <tr> that navigates to `href` on click — the "whole row is a click
 * target" affordance shared by every CRM list table. Clicks on any nested
 * interactive element (a link, button, select, or input already inside the
 * row) are left alone instead of also triggering the row navigation. The row
 * itself is also keyboard-operable (Enter) once focused, layered on top of
 * whatever real links already live inside it.
 */
export function ClickableRow({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  function isInteractive(target: EventTarget | null): boolean {
    return target instanceof HTMLElement
      ? Boolean(target.closest("a, button, select, input, textarea"))
      : false;
  }

  function onClick(e: ReactMouseEvent<HTMLTableRowElement>) {
    if (isInteractive(e.target)) return;
    router.push(href);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLTableRowElement>) {
    if (isInteractive(e.target)) return;
    if (e.key === "Enter") {
      e.preventDefault();
      router.push(href);
    }
  }

  return (
    <tr
      tabIndex={0}
      role="link"
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`cursor-pointer outline-none transition-colors hover:bg-inset focus-visible:bg-inset focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 ${className ?? ""}`}
    >
      {children}
    </tr>
  );
}
