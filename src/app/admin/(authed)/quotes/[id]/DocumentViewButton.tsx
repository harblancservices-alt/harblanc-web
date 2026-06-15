"use client";

import { useEffect, useState } from "react";
import type { SentDocumentRow } from "./tabs/DocumentsTab";

/**
 * DocumentViewButton — the single "View" affordance per sent document.
 *
 * Clicking it opens a popup with the document preview. Range proposals
 * are email-only and render their actual sent email HTML (auto-sized to
 * the content so the whole document flows full-length as one card, with
 * no internal iframe scrollbar). Finalized quotes / BOLs render their
 * PDF route in a tall viewer. Below the preview sit the Download (PDF
 * docs only) and Resend actions, with a recipient-email field next to
 * Resend so the operator can override who the resend goes to. The render
 * and these actions form ONE operations card. Click the dark backdrop or
 * press Escape to close.
 *
 * `resendAction` is the bound server action (resendEstimate /
 * resendFinalizedQuote / resendBol already `.bind`-ed to this doc id),
 * passed down from DocumentsTab so the form posts straight to it.
 */
export function DocumentViewButton({
  doc,
  resendAction,
}: {
  doc: SentDocumentRow;
  resendAction: (formData: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  // Auto-measured height for the email render so the iframe is exactly as
  // tall as its content (no internal scrollbar). PDFs keep a fixed-height
  // viewport since their content can't be measured cross-document.
  const [emailHeight, setEmailHeight] = useState(0);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View ${doc.label}`}
        className="inline-flex items-center rounded-md border border-blue-300 bg-blue-50 px-3 py-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-blue-700 transition-colors hover:bg-blue-100"
      >
        View
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${doc.label} preview`}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 p-3 sm:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="my-2 w-full max-w-3xl overflow-hidden rounded-md border border-line-strong bg-card shadow-2xl sm:my-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 bg-bar px-4 py-2.5">
              <span className="truncate font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-bar-fg">
                {doc.label}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-sm border border-white/25 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-bar-fg transition-colors hover:bg-white/10"
              >
                Close
              </button>
            </div>

            {/* Preview. Range proposals are email-only: render the actual
                sent email HTML (emailHtml), auto-sized to its content.
                Everything else renders its PDF route in a tall viewer. The
                internal estimate PDF is never shown — it exposes the
                fuel-surcharge breakdown the customer must not see. */}
            {doc.emailHtml ? (
              <iframe
                title={`${doc.label} email`}
                srcDoc={doc.emailHtml}
                scrolling="no"
                className="block w-full border-0 bg-white"
                style={{ height: emailHeight > 0 ? `${emailHeight}px` : "600px" }}
                onLoad={(e) => {
                  const ifr = e.currentTarget;
                  const idoc = ifr.contentDocument;
                  if (!idoc) return;
                  const measure = () => {
                    const root: HTMLElement | null =
                      idoc.body?.querySelector("table") ??
                      idoc.body ??
                      idoc.documentElement;
                    if (!root) return;
                    const h = Math.ceil(root.getBoundingClientRect().height);
                    if (h > 0) setEmailHeight(h);
                  };
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                      measure();
                      const imgs = idoc.images;
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
            ) : doc.pdfHref ? (
              <iframe
                title={`${doc.label} preview`}
                src={doc.pdfHref}
                className="block h-[82vh] w-full border-0 bg-card"
              />
            ) : (
              <div className="px-6 py-10 text-center font-mono text-[12px] uppercase tracking-[0.12em] text-fg-subtle">
                No preview available for this document
              </div>
            )}

            {/* Actions — download (PDF docs only) + resend + recipient email.
                Attached directly under the render so the document and its
                actions read as one operations card. */}
            <div className="flex flex-wrap items-center gap-3 border-t border-line bg-elevated px-4 py-3">
              {doc.pdfHref ? (
                <a
                  href={doc.pdfHref}
                  download
                  className="inline-flex items-center rounded-md border border-orange-300 bg-orange-50 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-orange-700 transition-colors hover:bg-orange-100"
                >
                  Download
                </a>
              ) : null}

              <form action={resendAction} className="flex flex-1 items-center gap-2">
                <button
                  type="submit"
                  className="inline-flex shrink-0 items-center rounded-md border border-red-300 bg-red-50 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-red-700 transition-colors hover:bg-red-100"
                >
                  Resend
                </button>
                <input
                  type="email"
                  name="recipient_email"
                  defaultValue={doc.recipient ?? ""}
                  placeholder="recipient@email.com"
                  aria-label="Resend recipient email"
                  className="min-w-0 flex-1 rounded-md border border-line-strong bg-card px-2.5 py-1.5 font-mono text-[12px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
                />
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
