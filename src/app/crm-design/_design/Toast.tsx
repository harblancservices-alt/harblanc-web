"use client";

import { useStore } from "../_lib/store";
import { IconCheck, IconInfo, IconAlertTriangle } from "./icons";

const TONE_STYLE: Record<string, string> = {
  success: "border-[var(--cd-success)]/25 bg-[var(--cd-success-soft)] text-[var(--cd-success)]",
  info: "border-[var(--cd-accent)]/25 bg-[var(--cd-accent-soft)] text-[var(--cd-accent)]",
  danger: "border-[var(--cd-danger)]/25 bg-[var(--cd-danger-soft)] text-[var(--cd-danger)]",
};

const TONE_ICON: Record<string, React.ReactNode> = {
  success: <IconCheck width={16} height={16} />,
  info: <IconInfo width={16} height={16} />,
  danger: <IconAlertTriangle width={16} height={16} />,
};

/** Toast host — one consistent success/info/danger shape, mounted once at
 * the app-shell root. Every mock action in the prototype (save, generate
 * document, suspend user, ...) routes through store.pushToast rather than
 * a page inventing its own confirmation UI. */
export function ToastHost() {
  const { toasts } = useStore();
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[200] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`cd-animate-rise pointer-events-auto flex max-w-sm items-center gap-2 rounded-[var(--cd-radius-md)] border px-3.5 py-2.5 text-[13px] font-medium shadow-[var(--cd-shadow-lg)] ${TONE_STYLE[t.kind]}`}
        >
          {TONE_ICON[t.kind]}
          {t.message}
        </div>
      ))}
    </div>
  );
}
