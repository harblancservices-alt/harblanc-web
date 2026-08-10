"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Admin's modal shell — new, not wired into any screen yet. Admin's existing
 * dialogs (BrokerDetail's ContactModal, AddExpenseDialog, LogServiceModal,
 * etc.) each hand-roll `fixed inset-0 ... p-3 sm:p-8` with a centered card
 * and their own header bar; this extracts that same look (header bar on
 * `bg-elevated`, `border-line`, `shadow-xl`, `rounded-lg`, `max-w-lg`) into
 * one component and adds a bottom-sheet-on-mobile / `fullScreen` mobile
 * variant on top, mirroring the CRM's `_shell/Modal.tsx`.
 *
 * Existing hand-rolled dialogs are left as-is for now — swapping one over to
 * this shell is a per-screen decision (their desktop chrome must be checked
 * against this component's defaults first), not something this file does by
 * existing.
 */
export function AdminModal({
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
  /** When true, backdrop/escape/close won't dismiss (a save is in flight). */
  busy?: boolean;
  /** Wider shell (max-w-3xl instead of max-w-lg) for content-heavy dialogs. */
  wide?: boolean;
  /** Mobile-only: below `sm` the sheet goes edge-to-edge (full viewport
   * height, no rounding) instead of a centered capped dialog — for
   * content-heavy forms (LogServiceModal, Quote edit-shipment-details) that
   * need real room on a phone. Desktop (`sm:` and up) is unaffected — same
   * centered, rounded, capped dialog as always. */
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
      className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-black/40 p-0 sm:items-start sm:p-8"
      onClick={() => !busy && onClose()}
      role="presentation"
    >
      <div
        className={`w-full overflow-hidden border border-line bg-card shadow-xl sm:rounded-lg ${
          fullScreen ? "h-[100dvh] max-h-[100dvh] rounded-none" : "max-h-[92vh] rounded-t-lg"
        } sm:max-h-[92vh] ${wide ? "max-w-3xl" : "max-w-lg"}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-line bg-elevated px-4 py-2.5">
          <span className="min-w-0 truncate font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-fg">
            {title}
          </span>
          <Button
            type="button"
            variant="cancel"
            size="sm"
            onClick={() => !busy && onClose()}
            aria-label="Close"
            className="shrink-0 px-2 text-[18px]"
          >
            ×
          </Button>
        </div>
        <div className="overflow-y-auto p-4" style={{ maxHeight: "calc(92vh - 45px)" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
