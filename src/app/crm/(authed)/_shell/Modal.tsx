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
  wide,
  fullScreen,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** When true, backdrop/escape/cancel won't dismiss (a save is in flight). */
  busy?: boolean;
  /** Wider shell (max-w-6xl instead of max-w-lg) for content-heavy dialogs
   * like the RC/BOL document editors — everything else about the shell
   * (scrim, bottom-sheet-on-mobile, escape/scroll-lock) stays identical. */
  wide?: boolean;
  /** Mobile-only: below `sm` the sheet goes edge-to-edge (full viewport
   * height, no rounding) instead of the capped 92vh bottom sheet — for
   * content-heavy forms (BOL line items, shipment workspace sections) that
   * need real room on a phone. Desktop (`sm:` and up) is completely
   * unaffected — same capped, rounded, centered dialog as always. */
  fullScreen?: boolean;
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
        className={`w-full overflow-y-auto border border-line bg-card p-4 shadow-e3 sm:max-h-[92vh] sm:rounded-lg ${fullScreen ? "h-[100dvh] max-h-[100dvh] rounded-none" : "max-h-[92vh] rounded-t-lg"} ${wide ? "max-w-6xl" : "max-w-lg"}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold text-fg">{title}</h2>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            className="rounded-[5px] border border-fg-subtle px-2.5 py-1 text-[12.5px] font-medium text-fg-muted transition-colors hover:bg-inset hover:text-fg"
          >
            Cancel
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
