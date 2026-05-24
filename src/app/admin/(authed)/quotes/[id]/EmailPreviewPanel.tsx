"use client";

import { useEffect, useRef, useState } from "react";

/**
 * EmailPreviewPanel — inline preview of a rendered email.
 *
 * Phase 3C-fix: iframe now auto-sizes to its content height so the full
 * email is visible inside the admin page with no internal scrollbar.
 * Re-measures when the desktop/mobile width toggle changes (reflowing
 * the email content changes its height).
 *
 * srcDoc + sandbox="allow-same-origin" lets us reach into contentDocument
 * for measurement while keeping the email isolated from the admin app.
 */

export type EmailPreviewData = {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  preheader: string;
  html: string;
};

type WidthMode = "desktop" | "mobile";

const MIN_HEIGHT = 600;
const HEIGHT_BUFFER = 24;

export function EmailPreviewPanel({ preview }: { preview: EmailPreviewData }) {
  const [width, setWidth] = useState<WidthMode>("desktop");
  const [height, setHeight] = useState<number>(MIN_HEIGHT);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  /** Read scrollHeight from the iframe's body + html and lift state. */
  function measure() {
    const node = iframeRef.current;
    if (!node) return;
    const doc = node.contentDocument;
    if (!doc) return;
    const next = Math.max(
      MIN_HEIGHT,
      doc.documentElement?.scrollHeight ?? 0,
      doc.body?.scrollHeight ?? 0,
    );
    setHeight(next + HEIGHT_BUFFER);
  }

  // Re-measure when the viewport width changes (mobile/desktop toggle
  // reflows the email content, which changes its height).
  useEffect(() => {
    // Wait a tick so the new width is applied before measuring.
    const id = requestAnimationFrame(() => measure());
    return () => cancelAnimationFrame(id);
  }, [width]);

  // Re-measure if the preview content itself changes (Brent rebuilds
  // the preview without unmounting the component).
  useEffect(() => {
    const id = requestAnimationFrame(() => measure());
    return () => cancelAnimationFrame(id);
  }, [preview.html]);

  return (
    <section className="border border-zinc-300 bg-zinc-50">
      {/* Frame title bar */}
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-2">
        <p className="font-mono text-xs tracking-[0.12em] text-red-600 uppercase">
          Preview &nbsp;/&nbsp; not yet sent
        </p>
        <div className="flex items-center gap-1">
          {(["desktop", "mobile"] as const).map((m) => {
            const isActive = m === width;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setWidth(m)}
                className={
                  "border px-2.5 py-1 font-mono text-xs tracking-[0.12em] uppercase transition-colors " +
                  (isActive
                    ? "border-red-600 bg-red-50 text-red-800"
                    : "border-zinc-300 bg-white text-zinc-600 hover:text-zinc-900")
                }
              >
                {m}
              </button>
            );
          })}
        </div>
      </header>

      {/* Email header strip — mail-app style */}
      <div className="space-y-1 border-b border-zinc-200 bg-zinc-100 px-4 py-3">
        <HeaderRow label="From" value={preview.from} />
        <HeaderRow label="To" value={preview.to} />
        <HeaderRow label="Reply-to" value={preview.replyTo} />
        <HeaderRow label="Subject" value={preview.subject} emphasize />
        {preview.preheader ? (
          <HeaderRow label="Preview" value={preview.preheader} muted />
        ) : null}
      </div>

      {/* Rendered HTML body in a sandboxed iframe.
          Height is content-driven (see measure()), so the email never
          scrolls inside the panel — the admin page scrolls instead. */}
      <div className="bg-neutral-200 p-2 sm:p-4">
        <div
          className="mx-auto bg-white shadow-sm"
          style={{
            width: width === "mobile" ? "min(380px, 100%)" : "100%",
            maxWidth: width === "mobile" ? "380px" : "100%",
            transition: "max-width 150ms ease",
          }}
        >
          <iframe
            ref={iframeRef}
            srcDoc={preview.html}
            title="Email preview"
            sandbox="allow-same-origin"
            scrolling="no"
            onLoad={() => measure()}
            style={{
              width: "100%",
              height: `${height}px`,
              border: "0",
              display: "block",
              background: "#ffffff",
              // Defense-in-depth — even if scrolling="no" is dropped by
              // a strict client, overflow:hidden kills any inner bar.
              overflow: "hidden",
            }}
          />
        </div>
      </div>
    </section>
  );
}

function HeaderRow({
  label,
  value,
  emphasize,
  muted,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="grid grid-cols-[80px_minmax(0,1fr)] items-baseline gap-3">
      <span className="font-mono text-xs tracking-[0.12em] text-zinc-500 uppercase">
        {label}
      </span>
      <span
        className={
          "min-w-0 break-words text-sm " +
          (emphasize
            ? "font-semibold text-zinc-900"
            : muted
              ? "text-zinc-600"
              : "text-zinc-800")
        }
      >
        {value}
      </span>
    </div>
  );
}
