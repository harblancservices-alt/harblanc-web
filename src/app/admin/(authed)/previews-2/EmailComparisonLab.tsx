"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * EmailComparisonLab — /admin/previews-2 staging view.
 *
 * Renders ALL email templates side-by-side at their native 600px width
 * so the operator can iterate on header, footer, typography, CTA, and
 * spacing across every template simultaneously. Once the four emails
 * are visually uniform here, the same render functions feed the main
 * /admin/previews lab automatically — no separate code path.
 *
 * Scaling pattern matches AdminPreviewLab.ResponsivePreview: the strip
 * of 4 frames is rendered at its native pixel width and then scaled
 * via CSS transform to fit the available container width.
 */

type EmailItem = {
  id: string;
  title: string;
  subject: string;
  html: string;
};

const FRAME_WIDTH = 600;
const FRAME_GAP = 32;

export function EmailComparisonLab({ emails }: { emails: EmailItem[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapWidth, setWrapWidth] = useState<number>(0);
  // Each iframe reports its rendered content height; we use the MAX across
  // all iframes as the strip's native height. That way the strip is exactly
  // tall enough to fit the tallest email — no scrollbars, no clipping.
  const [iframeHeights, setIframeHeights] = useState<Record<string, number>>(
    {},
  );

  const stripNativeWidth =
    emails.length * FRAME_WIDTH + (emails.length - 1) * FRAME_GAP;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const compute = () => setWrapWidth(el.clientWidth);
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale =
    wrapWidth > 0 ? Math.min(1, wrapWidth / stripNativeWidth) : 1;

  // Native strip height: tallest iframe + 80px breathing room for the
  // column labels above each frame.
  const tallestIframe = Math.max(900, ...Object.values(iframeHeights));
  const nativeHeight = tallestIframe + 80;

  // Tell parent the visual (scaled) height so the page sizes correctly
  // and no outer scrollbar appears.
  const scaledHeight = nativeHeight * scale;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-200">
      {/* ── Header bar ─────────────────────────────────────────────── */}
      <header className="border-b border-zinc-300 bg-card px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.28em] text-red-600">
              Previews 2 &middot; staging
            </p>
            <h1 className="mt-1 font-display text-2xl font-black uppercase tracking-tight text-zinc-900">
              Email uniformity lab
            </h1>
            <p className="mt-1 text-sm text-fg-subtle">
              All {emails.length} email templates rendered at their native
              600&nbsp;px width, side by side. Iterate on shell, typography,
              CTAs, and spacing here, then jump to{" "}
              <Link
                href="/admin/previews"
                className="font-bold text-red-700 underline underline-offset-2 hover:text-red-800"
              >
                /admin/previews
              </Link>{" "}
              for the standard responsive viewport view.
            </p>
          </div>
          <Link
            href="/admin/previews"
            className="shrink-0 rounded-sm bg-card px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-fg transition-colors hover:bg-elevated"
          >
            &larr; Standard previews
          </Link>
        </div>
      </header>

      {/* ── Scaled strip ───────────────────────────────────────────── */}
      <div
        ref={wrapRef}
        className="relative w-full"
        style={{ height: `${scaledHeight}px` }}
      >
        <div
          className="absolute top-0"
          style={{
            left: "50%",
            width: `${stripNativeWidth}px`,
            height: `${nativeHeight}px`,
            transform: `translateX(-50%) scale(${scale})`,
            transformOrigin: "top center",
          }}
        >
          <div
            className="flex h-full"
            style={{ gap: `${FRAME_GAP}px`, padding: "24px 0" }}
          >
            {emails.map((email, i) => (
              <div
                key={email.id}
                className="flex flex-col"
                style={{ width: `${FRAME_WIDTH}px` }}
              >
                {/* Column label */}
                <div className="mb-3 flex items-baseline gap-3">
                  <span className="font-mono text-base font-bold text-red-600">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="font-mono text-sm font-bold uppercase tracking-[0.18em] text-zinc-700">
                      {email.title}
                    </p>
                    <p className="font-mono text-[11px] text-fg-subtle">
                      Subject &middot; {email.subject}
                    </p>
                  </div>
                </div>
                {/* Email frame — one-shot exact measurement, no buffer,
                    no ResizeObserver growth loop. iframe height equals the
                    rendered email root height exactly.
                      1. scrolling="no" + overflow:hidden — iframe never
                         renders a scrollbar.
                      2. Initial height 0 — no phantom placeholder.
                      3. On load: wait 2 RAFs for fonts/images/layout to
                         settle, then measure the first <table> inside the
                         iframe body (the email root) with
                         getBoundingClientRect and Math.ceil.
                      4. For any still-loading <img>, re-measure once each
                         finishes. Exact height every time — never additive. */}
                <div className="self-start shadow-[0_2px_0_0_#dc2626,0_0_0_1px_#d4d4d8]">
                  <iframe
                    title={`${email.title} preview`}
                    srcDoc={email.html}
                    sandbox="allow-same-origin"
                    scrolling="no"
                    style={{
                      display: "block",
                      width: `${FRAME_WIDTH}px`,
                      height: "0px",
                      border: 0,
                      overflow: "hidden",
                    }}
                    onLoad={(e) => {
                      const ifr = e.currentTarget;
                      const doc = ifr.contentDocument;
                      if (!doc) return;

                      // Measure the email ROOT (first <table> in body),
                      // not the html/body document. Avoids html being
                      // stretched to iframe height and feeding back in.
                      const measure = () => {
                        const root: HTMLElement | null =
                          doc.body?.querySelector("table") ??
                          doc.body ??
                          doc.documentElement;
                        if (!root) return;
                        const h = Math.ceil(
                          root.getBoundingClientRect().height,
                        );
                        if (h > 0) {
                          ifr.style.height = `${h}px`;
                          setIframeHeights((prev) =>
                            prev[email.id] === h
                              ? prev
                              : { ...prev, [email.id]: h },
                          );
                        }
                      };

                      // Two RAFs: fonts/images/layout settle, then measure.
                      requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                          measure();
                          // Re-measure exactly once per late-loading image.
                          const imgs = doc.images;
                          for (let i = 0; i < imgs.length; i++) {
                            const img = imgs[i]!;
                            if (!img.complete) {
                              img.addEventListener("load", measure, {
                                once: true,
                              });
                              img.addEventListener("error", measure, {
                                once: true,
                              });
                            }
                          }
                        });
                      });
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
