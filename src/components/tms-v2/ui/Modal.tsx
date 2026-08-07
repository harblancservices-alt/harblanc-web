"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { IconX } from "@/lib/nav/icons";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Override the dialog's max-width class — defaults to `max-w-lg`
   * (every existing caller). Add Load's richer, multi-section form needed
   * a bit more breathing room on desktop (~600px) without widening every
   * other modal in the app that uses this same shared component. */
  maxWidthClassName?: string;
};

/** Centered modal — Esc + backdrop click both close. Used sparingly per
 * v2-design.md's cross-cutting win #1 (inline-edit over modal-then-edit),
 * but kept as one shared implementation for the cases that genuinely need
 * it (BOL signer, Log Service, Applications detail). */
export function Modal({ open, onClose, title, children, maxWidthClassName = "max-w-lg" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full ${maxWidthClassName} rounded-xl border border-line bg-card p-5 shadow-e3`}
      >
        {title ? (
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[17px] font-semibold text-fg">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-fg-muted hover:text-fg"
            >
              <IconX className="h-5 w-5" />
            </button>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
