"use client";

import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { PreviewsTabs } from "@/components/tms-v2/previews/PreviewsTabs";

/**
 * Email Previews — ported from /admin/previews-2's EmailComparisonLab.
 * Renders every customer-facing email template side-by-side at native
 * 600px width using the EXACT render functions the production send path
 * uses (passed in from the server page) — identical bytes the recipient
 * would see, just never sent. Same scaled-strip technique as the /admin
 * lab: render at native pixel width, then scale the whole strip down via
 * CSS transform to fit the available column.
 */

type EmailItem = {
  id: string;
  title: string;
  subject: string;
  html: string;
};

const FRAME_WIDTH = 600;
const FRAME_GAP = 32;

export function EmailPreviewLab({ emails }: { emails: EmailItem[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapWidth, setWrapWidth] = useState<number>(0);
  const [iframeHeights, setIframeHeights] = useState<Record<string, number>>({});

  const stripNativeWidth = emails.length * FRAME_WIDTH + (emails.length - 1) * FRAME_GAP;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const compute = () => setWrapWidth(el.clientWidth);
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = wrapWidth > 0 ? Math.min(1, wrapWidth / stripNativeWidth) : 1;
  const tallestIframe = Math.max(900, ...Object.values(iframeHeights));
  const nativeHeight = tallestIframe + 80;
  const scaledHeight = nativeHeight * scale;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Email Previews"
        description="Every customer-facing email template, rendered with sample data through the exact production renderer. Preview only — nothing is sent."
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <PreviewsTabs active="email" />
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-subtle">
          {emails.length} templates &middot; native {FRAME_WIDTH}px
        </p>
      </div>

      <div ref={wrapRef} className="relative w-full" style={{ height: `${scaledHeight}px` }}>
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
          <div className="flex h-full" style={{ gap: `${FRAME_GAP}px`, padding: "24px 0" }}>
            {emails.map((email, i) => (
              <div key={email.id} className="flex flex-col" style={{ width: `${FRAME_WIDTH}px` }}>
                <div className="mb-3">
                  <p className="font-mono text-sm font-bold uppercase tracking-[0.14em] text-fg-muted">
                    {String(i + 1).padStart(2, "0")} &middot; {email.title}
                  </p>
                  <p className="truncate font-mono text-[11px] text-fg-subtle">{email.subject}</p>
                </div>
                <div className="self-start overflow-hidden rounded-lg border border-line-strong bg-card shadow-e2">
                  <iframe
                    title={`${email.title} preview`}
                    srcDoc={email.html}
                    sandbox="allow-same-origin"
                    scrolling="no"
                    style={{ display: "block", width: `${FRAME_WIDTH}px`, height: "0px", border: 0, overflow: "hidden" }}
                    onLoad={(e) => {
                      const ifr = e.currentTarget;
                      const doc = ifr.contentDocument;
                      if (!doc) return;

                      const measure = () => {
                        const root: HTMLElement | null = doc.body?.querySelector("table") ?? doc.body ?? doc.documentElement;
                        if (!root) return;
                        const h = Math.ceil(root.getBoundingClientRect().height);
                        if (h > 0) {
                          ifr.style.height = `${h}px`;
                          setIframeHeights((prev) => (prev[email.id] === h ? prev : { ...prev, [email.id]: h }));
                        }
                      };

                      requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                          measure();
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
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
