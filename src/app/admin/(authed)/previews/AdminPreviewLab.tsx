"use client";

import { useEffect, useState } from "react";

/**
 * Admin Preview Lab — read-only viewer.
 *
 * Receives pre-rendered email HTML from the server component and renders
 * a grid of preview cards. Each card has a Preview button that opens a
 * full-screen modal with the asset visible inside an iframe.
 *
 * Two asset kinds:
 *   - email   → renders the HTML string with srcDoc inside the iframe
 *   - route   → renders a same-origin route inside the iframe (used by
 *               the Confirm Shipment Details preview, which has its own
 *               admin-only route at /admin/previews/confirm-shipment)
 *
 * No server actions fire from this UI. The component never imports the
 * email renderers itself — it just displays strings the server already
 * built. Same posture as PreviewModal in the quotes workspace.
 */

/**
 * Classification drives the visual badge in the card header and the
 * pill in the modal header — independent of how the asset renders
 * (email srcDoc vs same-origin route iframe).
 *
 *   customer_email → outbound asset the recipient sees in their inbox
 *   customer_page  → customer-facing page they visit in a browser
 *   in_house_doc   → internal carrier paperwork. The BOL ships through
 *                    the email pipeline today but it is conceptually
 *                    in-house operational paperwork, not a customer
 *                    email — the classification reflects that.
 */
export type PreviewClassification =
  | "customer_email"
  | "customer_page"
  | "in_house_doc";

type PreviewTargetBase = {
  id: string;
  /** Optional ordering prefix rendered as `1. Title`. */
  order?: number;
  title: string;
  subtitle: string;
  classification: PreviewClassification;
};

export type PreviewTarget =
  | (PreviewTargetBase & {
      kind: "email";
      subject: string;
      to: string;
      html: string;
    })
  | (PreviewTargetBase & {
      kind: "route";
      route: string;
    });

function classificationLabel(c: PreviewClassification): string {
  switch (c) {
    case "customer_email":
      return "Email";
    case "customer_page":
      return "Page";
    case "in_house_doc":
      return "In-house";
  }
}

function classificationClasses(c: PreviewClassification): string {
  // Compact freight/TMS pill: pick a treatment per kind so the three
  // surfaces (outbound email / customer page / internal doc) are
  // visually distinct at a glance.
  switch (c) {
    case "customer_email":
      // Red — signals an asset that leaves the building for a customer.
      return "border border-red-700 bg-red-50 text-red-800";
    case "customer_page":
      // Neutral — customer-facing but a page they visit, not a send.
      return "border border-zinc-400 bg-white text-black";
    case "in_house_doc":
      // Inverted black — internal paperwork, distinct from anything
      // labeled "customer".
      return "border border-black bg-black text-white";
  }
}

function formatTitle(t: PreviewTargetBase): string {
  return t.order != null ? `${t.order}. ${t.title}` : t.title;
}

export function AdminPreviewLab({
  targets,
}: {
  targets: ReadonlyArray<PreviewTarget>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const active = openId
    ? targets.find((t) => t.id === openId) ?? null
    : null;

  // Esc closes the modal. Bound only while open so we don't intercept Esc
  // elsewhere.
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpenId(null);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);

  return (
    <div>
      {/* Safety strip */}
      <p className="mb-4 flex items-center gap-2 border border-zinc-300 bg-zinc-100 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-black">
        <span
          aria-hidden
          className="inline-block h-[12px] w-1 shrink-0 bg-red-600"
        />
        Preview only &middot; no emails sent &middot; no records changed
      </p>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {targets.map((t) => (
          <li
            key={t.id}
            className="flex flex-col border border-zinc-400 border-l-4 border-l-red-600 bg-white"
          >
            <div className="flex items-center justify-between gap-3 border-b border-zinc-300 px-4 py-2.5">
              <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-black">
                {formatTitle(t)}
              </h2>
              <span
                className={
                  "shrink-0 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] " +
                  classificationClasses(t.classification)
                }
              >
                {classificationLabel(t.classification)}
              </span>
            </div>
            <div className="flex-1 px-4 py-3 text-sm text-black">
              <p>{t.subtitle}</p>
              {t.kind === "email" ? (
                <dl className="mt-3 grid grid-cols-[60px_minmax(0,1fr)] gap-x-3 gap-y-1 font-mono text-[11px]">
                  <dt className="text-zinc-600 uppercase tracking-[0.12em]">
                    To
                  </dt>
                  <dd className="truncate text-black">{t.to}</dd>
                  <dt className="text-zinc-600 uppercase tracking-[0.12em]">
                    Subj
                  </dt>
                  <dd className="truncate text-black">{t.subject}</dd>
                </dl>
              ) : (
                <p className="mt-3 font-mono text-[11px] text-zinc-700">
                  Route &middot; {t.route}
                </p>
              )}
            </div>
            <div className="flex justify-end border-t border-zinc-300 px-4 py-2.5">
              <button
                type="button"
                onClick={() => setOpenId(t.id)}
                className="inline-flex items-center justify-center border border-zinc-400 bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:border-red-600 hover:text-red-700"
              >
                Preview
              </button>
            </div>
          </li>
        ))}
      </ul>

      {active ? (
        <Modal target={active} onClose={() => setOpenId(null)} />
      ) : null}
    </div>
  );
}

function Modal({
  target,
  onClose,
}: {
  target: PreviewTarget;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/85"
      role="dialog"
      aria-modal="true"
      aria-label={`${target.title} preview`}
    >
      {/* Header */}
      <header className="relative flex shrink-0 items-center gap-3 border-b-2 border-red-600 bg-white px-3 py-2.5 sm:px-5 sm:py-3">
        <span
          aria-hidden
          className="inline-block h-5 w-1 shrink-0 bg-red-600"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-black sm:text-[12px]">
            {formatTitle(target)}
          </p>
          <p className="mt-0.5 truncate font-mono text-[10px] text-black sm:text-[11px]">
            {target.kind === "email" ? (
              <>
                <span>{target.to}</span>
                <span className="px-1.5 text-zinc-400">&middot;</span>
                <span className="text-zinc-700">{target.subject}</span>
              </>
            ) : (
              <span className="text-zinc-700">{target.route}</span>
            )}
          </p>
        </div>
        {/* Classification badge — matches the card. Distinct from the
            "Preview only" pill because some assets (BOL) are in-house
            even outside preview mode. */}
        <span
          className={
            "hidden shrink-0 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] sm:inline-block " +
            classificationClasses(target.classification)
          }
        >
          {classificationLabel(target.classification)}
        </span>
        <span className="hidden shrink-0 items-center gap-1.5 border border-zinc-300 bg-zinc-100 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-black sm:inline-flex">
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full bg-red-600"
          />
          Preview only
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          title="Close (Esc)"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center border border-zinc-300 bg-white text-black transition-colors hover:border-red-600 hover:bg-red-50 hover:text-red-700"
        >
          {/* Close icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden
          >
            <path d="M18 6L6 18" />
            <path d="M6 6l12 12" />
          </svg>
        </button>
      </header>

      {/* Body — iframe in both modes. srcDoc for emails (so the HTML
          renders in its own document with its own stylesheet, exactly
          like an email client), src= for routes (so the customer page
          renders in its actual layout under our admin shell). */}
      <main className="relative flex-1 overflow-auto bg-neutral-200 px-2 py-3 sm:px-6 sm:py-6">
        <div className="mx-auto w-full max-w-[1100px] bg-white shadow-[0_2px_0_0_#dc2626,0_0_0_1px_#d4d4d8]">
          {target.kind === "email" ? (
            <iframe
              title={`${target.title} email preview`}
              srcDoc={target.html}
              sandbox="allow-same-origin"
              className="block h-[calc(100vh-180px)] min-h-[400px] w-full border-0 bg-white sm:h-[calc(100vh-110px)]"
            />
          ) : (
            <iframe
              title={`${target.title} page preview`}
              src={target.route}
              // allow-scripts so the React page boots inside the iframe.
              // No allow-forms / allow-top-navigation — defensive even
              // though the embedded preview route disables its form.
              sandbox="allow-scripts allow-same-origin"
              className="block h-[calc(100vh-180px)] min-h-[400px] w-full border-0 bg-white sm:h-[calc(100vh-110px)]"
            />
          )}
        </div>
      </main>
    </div>
  );
}
