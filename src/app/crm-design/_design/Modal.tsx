"use client";

import { useEffect } from "react";
import { IconX } from "./icons";
import { TEXT } from "./ui";

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "480px",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="cd-animate-fade fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="cd-animate-rise flex max-h-[85vh] w-full flex-col overflow-hidden rounded-[var(--cd-radius-lg)] border border-[var(--cd-border)] bg-[var(--cd-surface)] shadow-[var(--cd-shadow-lg)]"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--cd-border)] px-5 py-4">
          <div className="min-w-0">
            <h2 className={`${TEXT.sectionTitle} text-[15px] text-[var(--cd-text)]`}>{title}</h2>
            {subtitle && <p className={`mt-0.5 ${TEXT.micro} text-[var(--cd-text-muted)]`}>{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--cd-text-subtle)] transition-colors hover:bg-[var(--cd-surface-2)] hover:text-[var(--cd-text)]"
            aria-label="Close"
          >
            <IconX width={16} height={16} />
          </button>
        </div>
        <div className="cd-scroll flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-[var(--cd-border)] px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}
