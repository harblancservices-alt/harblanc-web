"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { IconX } from "@/lib/nav/icons";

type SlideOverProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
};

/** Right-edge slide-in panel — same open/close contract as <Modal>, for
 * surfaces that want more working width (a document preview, a longer
 * form) than a centered modal comfortably gives. */
export function SlideOver({ open, onClose, title, children }: SlideOverProps) {
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
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex h-full w-full max-w-md flex-col border-l border-line bg-card p-5 shadow-e3"
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
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
