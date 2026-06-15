"use client";

import { useEffect, useState } from "react";
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

  // Auto-sized iframe height. Initial 0 so the iframe isn't a phantom
  // viewport-tall block before measurement. Set on load to the email
  // root's exact rendered height. The outer <main> has overflow-auto so
  // any overflow scrolls the modal, not the iframe — iframes scroll
  // terribly on mobile (iOS needs two-finger swipe).
  const [iframeHeight, setIframeHeight] = useState<number>(0);

  // Reset measurement when the html payload changes so a rebuild
  // re-measures rather than keeping the previous height.
  useEffect(() => {
    setIframeHeight(0);
  }, [html]);

  if (!open) return null;

  const showSendButton = !!onSend && state === "ready";
  const sendDisabled = sendPending || state !== "ready";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/55"
      role="dialog"
      aria-modal="true"
      aria-label="Quote range preview"
      onClick={onClose}
    >
      {/* ─── Sticky top bar ─── */}
      <header
        className="relative flex shrink-0 items-center gap-3 border-b border-line bg-card px-3 py-2.5 sm:px-5 sm:py-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Red accent bar (matches admin section-title pattern) */}
        <span
          aria-hidden
          className="inline-block h-5 w-1 shrink-0 bg-canvas"
        />

        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-fg sm:text-[13px]">
            Quote range preview
          </p>
          {/* Meta strip — subject + recipient. Tabular numerics so it
              reads like a dispatch document header, not a SaaS modal
              title. */}
          {state !== "building" && (subject || to) ? (
            <p className="mt-0.5 truncate font-mono text-[11px] text-fg sm:text-[12px]">
              {to ? <span>{to}</span> : null}
              {to && subject ? <span className="px-1.5 text-fg-subtle">·</span> : null}
              {subject ? <span className="text-fg">{subject}</span> : null}
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
            className="hidden shrink-0 items-center gap-1.5 border border-amber-300/70 bg-amber-50 px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-amber-700 transition-colors hover:bg-amber-100 sm:inline-flex"
          >
            <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-amber-700" />
            Stale — rebuild
          </button>
        ) : null}

        {state === "rebuilding" ? (
          <span className="hidden shrink-0 items-center gap-1.5 border border-line-strong bg-card px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg sm:inline-flex">
            <Spinner className="h-3 w-3" />
            Rebuilding
          </span>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          title="Close (Esc)"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center border border-line-strong bg-card text-fg transition-colors hover:border-line-strong hover:bg-elevated hover:text-fg"
        >
          <IconX className="h-4 w-4" />
        </button>
      </header>

      {/* ─── Mobile-only secondary action row ─── */}
      {state === "stale" || state === "rebuilding" ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-line-strong bg-panel px-3 py-2 sm:hidden">
          {state === "stale" ? (
            <button
              type="button"
              onClick={onRebuild}
              className="inline-flex items-center gap-1.5 border border-amber-300/70 bg-amber-50 px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-amber-700"
            >
              Stale — rebuild
            </button>
          ) : null}
          {state === "rebuilding" ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg">
              <Spinner className="h-3 w-3" />
              Rebuilding preview
            </span>
          ) : null}
        </div>
      ) : null}

      {/* ─── Document area ─── */}
      <main className="relative flex-1 overflow-auto px-2 py-3 sm:px-6 sm:py-6">
        {state === "building" ? (
          <BuildingState />
        ) : state === "failed" ? (
          <FailedState message={errorMessage} onRetry={onRebuild} />
        ) : html ? (
          <div className="mx-auto w-full max-w-[680px] bg-card shadow-[0_2px_0_0_#dc2626,0_0_0_1px_#d4d4d8]" onClick={(e) => e.stopPropagation()}>
            <iframe
              title="Quote range document preview"
              srcDoc={html}
              sandbox="allow-same-origin"
              scrolling="no"
              className="block w-full border-0 bg-card"
              style={{ height: iframeHeight > 0 ? `${iframeHeight}px` : "400px" }}
              onLoad={(e) => {
                const ifr = e.currentTarget;
                const doc = ifr.contentDocument;
                if (!doc) return;
                const measure = () => {
                  // Measure the email root (first <table> in body) — same
                  // pattern as EmailComparisonLab. Avoids html/body baseline
                  // phantom space.
                  const root: HTMLElement | null =
                    doc.body?.querySelector("table") ??
                    doc.body ??
                    doc.documentElement;
                  if (!root) return;
                  const h = Math.ceil(root.getBoundingClientRect().height);
                  if (h > 0) setIframeHeight(h);
                };
                // Two RAFs so fonts + initial images + layout settle.
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    measure();
                    // Re-measure once per late-loading <img>.
                    const imgs = doc.images;
                    for (let i = 0; i < imgs.length; i++) {
                      const img = imgs[i]!;
                      if (!img.complete) {
                        img.addEventListener("load", measure, { once: true });
                        img.addEventListener("error", measure, { once: true });
                      }
                    }
                  });
                });
              }}
            />

            {/* Operations panel — attached directly to the bottom of the
                render so the document and its actions read as ONE card. */}
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line bg-card px-4 py-3">
              {to ? (
                <span className="mr-auto min-w-0 truncate font-mono text-[11px] text-fg-subtle sm:text-[12px]">
                  To: <span className="text-fg">{to}</span>
                </span>
              ) : null}

              {state === "stale" ? (
                <button
                  type="button"
                  onClick={onRebuild}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-amber-700 transition-colors hover:bg-amber-100"
                >
                  <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-amber-700" />
                  Rebuild preview
                </button>
              ) : null}

              {showSendButton ? (
                <button
                  type="button"
                  onClick={onSend}
                  disabled={sendDisabled}
                  className="inline-flex shrink-0 items-center gap-2 rounded-md border border-red-700 bg-red-600 px-5 py-2.5 text-[13px] font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sendPending ? (
                    <>
                      <Spinner className="h-4 w-4" />
                      Sending
                    </>
                  ) : (
                    <>
                      <IconSend className="h-4 w-4" />
                      Send range
                    </>
                  )}
                </button>
              ) : null}
            </div>
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
    <div className="mx-auto flex h-full max-w-[680px] flex-col items-center justify-center gap-3 bg-card px-6 py-12">
      <Spinner className="h-6 w-6 text-fg" />
      <p className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-fg">
        Building preview
      </p>
      <p className="max-w-sm text-center text-xs text-fg">
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
    <div className="mx-auto flex max-w-[680px] flex-col items-start gap-3 border border-line-strong bg-card/70 px-5 py-5">
      <p className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-fg">
        Preview failed
      </p>
      <p className="text-[15px] text-fg">
        {message ??
          "The preview build did not return a document. Check the rate fields and try again."}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 border border-line-strong bg-card px-3 py-1.5 font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-fg transition-colors hover:bg-elevated"
      >
        Try again
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-[680px] border border-line-strong bg-card px-5 py-12 text-center">
      <p className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-fg">
        No preview yet
      </p>
      <p className="mt-2 text-xs text-fg">
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
