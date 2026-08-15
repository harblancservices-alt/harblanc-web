"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { IconX } from "@/lib/nav/icons";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Optional line under the title — e.g. naming the specific record a
   * form is acting on ("Grease/Lube" under "Log a service"). Only renders
   * when `title` is also set. */
  subtitle?: string | null;
  children: ReactNode;
  /** Override the dialog's max-width class — defaults to `max-w-lg`
   * (every existing caller). Add Load's richer, multi-section form needed
   * a bit more breathing room on desktop (~600px) without widening every
   * other modal in the app that uses this same shared component. */
  maxWidthClassName?: string;
  /** Optional fixed action band (Cancel/Save) that stays visible below the
   * scrollable body — for a caller whose form runs long, so the buttons
   * are never scrolled out of view along with the fields. When omitted
   * (every caller except LoadFormModal today), the dialog keeps its
   * original single-scrolling-body shape. */
  footer?: ReactNode;
};

/** Centered modal — Esc + backdrop click both close. Used sparingly per
 * v2-design.md's cross-cutting win #1 (inline-edit over modal-then-edit),
 * but kept as one shared implementation for the cases that genuinely need
 * it (BOL signer, Log Service, Applications detail).
 *
 * Height-clamped to 90dvh (dvh, not vh — vh doesn't shrink for mobile
 * browser chrome, so a tall form could still get clipped under an
 * address bar even while "fitting" the layout viewport) and split into a
 * fixed header / scrollable body / optional fixed footer, so a form
 * taller than the screen never hides its title or its action buttons
 * off-screen — only the FIELDS scroll. Audit trail: LoadFormModal's Add
 * Load form (the richest one in the app) was getting clipped top and
 * bottom on both mobile and desktop before this. */
export function Modal({ open, onClose, title, subtitle, children, maxWidthClassName = "max-w-lg", footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Scroll-bleed lock: without this, scrolling to the top/bottom of the
  // modal's own body can "chain" into whatever scroll container sits
  // behind it in the DOM (PageScroll's list, a parent drawer, …) even
  // though that background is visually hidden — a real, reported bug on
  // mobile. overscroll-contain on the body (below) stops the chaining;
  // this is the belt-and-suspenders half, freezing the background
  // container outright while any modal is open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 touch-none bg-black/50 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative flex max-h-[90dvh] w-full ${maxWidthClassName} flex-col rounded-xl border border-line bg-card shadow-e3`}
      >
        {title ? (
          <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold text-fg">{title}</h2>
              {subtitle ? <p className="mt-0.5 truncate text-[12.5px] font-medium text-fg-muted">{subtitle}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="ml-3 shrink-0 text-fg-muted hover:text-fg"
            >
              <IconX className="h-5 w-5" />
            </button>
          </div>
        ) : null}
        <div className="no-scrollbar min-h-0 flex-1 overscroll-contain overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="shrink-0 border-t border-line px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}
