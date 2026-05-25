"use client";

import { useEffect } from "react";
import { IconSend, IconX } from "./icons";

/**
 * Phase REBUILD-2 P2-preview — Quote Range Preview Modal.
 *
 * A near-fullscreen, in-page document viewer that renders the exact
 * persisted preview_html the Send pipeline would ship. The intent is
 * that an operator sees a freight document, not an "email builder
 * preview". Visual rhythm matches the rest of the admin shell:
 *   - dark backdrop (mostly opaque) over the workspace
 *   - white document area at typical email width (~640px)
 *   - sticky top bar carrying HARBLANC red accent + title + meta +
 *     primary action (Send) + close
 *   - bottom-left "stale" / failure banner when applicable
 *   - vertical scrolling inside the document column; horizontal
 *     overflow guarded by overflow-x-auto in case the email body has
 *     a wide table
 *
 * Why an iframe (srcDoc), not a div + dangerouslySetInnerHTML:
 *   - the email's <style>/<table style> chrome (Public Sans stack,
 *     0.22em tracking, regulatory band, etc.) MUST render in
 *     isolation. If we paint the email's HTML into the admin DOM,
 *     Tailwind utility resets (preflight) collide with the email's
 *     inline styles and the document loses its letterhead/banding.
 *     An iframe gives the email its own document with its own
 *     <html><body>, full email-client rendering, no cross-talk.
 *   - srcDoc keeps it same-origin so postMessage / a script could
 *     hook in later if needed; today the iframe is purely a
 *     read-only viewer.
 *
 * State surface (driven by parent):
 *   building   — server action in-flight, no html yet
 *   rebuilding — server action in-flight, but a previous html is
 *                still on display behind the spinner
 *   ready      — html is current
 *   failed     — last build attempt failed, errorMessage is set
 *   stale      — html is from before the operator's last edit
 *                (parent fingerprints the rate-affecting fields)
 *
 * Send button is shown when onSend is provided AND state is ready
 * AND not stale. If the operator edits anything mid-preview, the
 * Send button disables and a "Rebuild preview" prompt surfaces.
 */

export type PreviewModalState =
  | "building"
  | "rebuilding"
  | "ready"
  | "failed"
  | "stale";

export type PreviewModalProps = {
  open: boolean;
  onClose: () => void;
  state: PreviewModalState;
  html: string | null;
  subject: string | null;
  to: string | null;
  errorMessage: string | null;
  /** Triggers a re-run of the preview build action. */
  onRebuild: () => void;
  /** Optional send hook. When omitted the Send button is hidden. */
  onSend?: () => void;
  sendPending?: boolean;
};

export function PreviewModal({
  open,
  onClose,
  state,
  html,
  subject,
  to,
  errorMessage,
  onRebuild,
  onSend,
  sendPending,
}: PreviewModalProps) {
  // Escape closes the modal. Bound only while open so we don't
  // intercept Esc from elsewhere on the page.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while the modal is open so the operator
  // can't accidentally scroll the workspace behind the document.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  const showSendButton = !!onSend && state === "ready";
  const sendDisabled = sendPending || state !== "ready";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/85"
      role="dialog"
      aria-modal="true"
      aria-label="Quote range preview"
    >
      {/* ─── Sticky top bar ─── */}
      <header
        className="relative flex shrink-0 items-center gap-3 border-b-2 border-red-600 bg-white px-3 py-2.5 sm:px-5 sm:py-3"
      >
        {/* Red accent bar (matches admin section-title pattern) */}
        <span
          aria-hidden
          className="inline-block h-5 w-1 shrink-0 bg-red-600"
        />

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-black sm:text-[12px]">
            Quote range preview
          </p>
          {/* Meta strip — subject + recipient. Tabular numerics so it
              reads like a dispatch document header, not a SaaS modal
              title. */}
          {state !== "building" && (subject || to) ? (
            <p className="mt-0.5 truncate font-mono text-[10px] text-black sm:text-[11px]">
              {to ? <span>{to}</span> : null}
              {to && subject ? <span className="px-1.5 text-zinc-400">·</span> : null}
              {subject ? <span className="text-zinc-700">{subject}</span> : null}
            </p>
          ) : null}
        </div>

        {/* Stale-banner pill — surfaces inline in the header so the
            operator doesn't have to scroll to discover that the
            preview is out-of-date. */}
        {state === "stale" ? (
          <button
            type="button"
            onClick={onRebuild}
            className="hidden shrink-0 items-center gap-1.5 border border-amber-700 bg-amber-100 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-amber-900 transition-colors hover:bg-amber-200 sm:inline-flex"
          >
            <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-amber-700" />
            Stale — rebuild
          </button>
        ) : null}

        {state === "rebuilding" ? (
          <span className="hidden shrink-0 items-center gap-1.5 border border-zinc-300 bg-zinc-100 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-black sm:inline-flex">
            <Spinner className="h-3 w-3" />
            Rebuilding
          </span>
        ) : null}

        {showSendButton ? (
          <button
            type="button"
            onClick={onSend}
            disabled={sendDisabled}
            className="inline-flex shrink-0 items-center gap-1.5 border border-red-700 bg-red-600 px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4"
          >
            {sendPending ? (
              <>
                <Spinner className="h-3.5 w-3.5" />
                Sending
              </>
            ) : (
              <>
                <IconSend className="h-3.5 w-3.5" />
                Send range
              </>
            )}
          </button>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          title="Close (Esc)"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center border border-zinc-300 bg-white text-black transition-colors hover:border-red-600 hover:bg-red-50 hover:text-red-700"
        >
          <IconX className="h-4 w-4" />
        </button>
      </header>

      {/* ─── Mobile-only secondary action row ─── */}
      {state === "stale" || state === "rebuilding" ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-300 bg-zinc-50 px-3 py-2 sm:hidden">
          {state === "stale" ? (
            <button
              type="button"
              onClick={onRebuild}
              className="inline-flex items-center gap-1.5 border border-amber-700 bg-amber-100 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-amber-900"
            >
              Stale — rebuild
            </button>
          ) : null}
          {state === "rebuilding" ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-black">
              <Spinner className="h-3 w-3" />
              Rebuilding preview
            </span>
          ) : null}
        </div>
      ) : null}

      {/* ─── Document area ─── */}
      <main className="relative flex-1 overflow-auto bg-neutral-200 px-2 py-3 sm:px-6 sm:py-6">
        {state === "building" ? (
          <BuildingState />
        ) : state === "failed" ? (
          <FailedState message={errorMessage} onRetry={onRebuild} />
        ) : html ? (
          <div className="mx-auto w-full max-w-[680px] bg-white shadow-[0_2px_0_0_#dc2626,0_0_0_1px_#d4d4d8]">
            <iframe
              title="Quote range document preview"
              srcDoc={html}
              sandbox="allow-same-origin"
              className="block h-[calc(100vh-180px)] min-h-[400px] w-full border-0 bg-white sm:h-[calc(100vh-110px)]"
            />
          </div>
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
}

// ─── Sub-states ──────────────────────────────────────────────────────────────

function BuildingState() {
  return (
    <div className="mx-auto flex h-full max-w-[680px] flex-col items-center justify-center gap-3 bg-white px-6 py-12">
      <Spinner className="h-6 w-6 text-red-600" />
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-black">
        Building preview
      </p>
      <p className="max-w-sm text-center text-xs text-zinc-700">
        Rendering the document the customer would receive.
      </p>
    </div>
  );
}

function FailedState({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-[680px] flex-col items-start gap-3 border border-red-300 bg-red-50 px-5 py-5">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-red-800">
        Preview failed
      </p>
      <p className="text-sm text-red-900">
        {message ??
          "The preview build did not return a document. Check the rate fields and try again."}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 border border-red-700 bg-white px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-red-800 transition-colors hover:bg-red-100"
      >
        Try again
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-[680px] border border-zinc-300 bg-white px-5 py-12 text-center">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-black">
        No preview yet
      </p>
      <p className="mt-2 text-xs text-zinc-700">
        Press Preview in the workspace to render a document.
      </p>
    </div>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className ?? ""}`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" opacity="0.25" />
      <path d="M12 3a9 9 0 0 1 9 9" />
    </svg>
  );
}
