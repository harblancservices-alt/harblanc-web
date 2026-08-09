"use client";

import { useEffect } from "react";

/**
 * The CRM's one modal shell — a bottom-sheet on mobile, a centred dialog on
 * desktop, matching the premium .crm-light chrome (a softly rounded card on
 * the e3 shadow over a dimmed scrim). Every CRM dialog (company create/edit,
 * contact add/edit, tag create) renders through this so the overlay
 * behaviour, escape-to-close, and scroll-lock stay identical everywhere.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** When true, backdrop/escape/cancel won't dismiss (a save is in flight). */
  busy?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={() => !busy && onClose()}
      role="presentation"
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-lg border border-line bg-card p-5 shadow-e3 sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold text-fg">{title}</h2>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            className="rounded-md border border-fg-subtle px-2.5 py-1 text-[13px] font-medium text-fg-muted transition-colors hover:bg-inset hover:text-fg"
          >
            Cancel
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
