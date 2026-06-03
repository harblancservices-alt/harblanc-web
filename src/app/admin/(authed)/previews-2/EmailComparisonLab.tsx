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
  const [size, setSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 900,
  });

  // Native pixel width of the strip (all frames + gaps between them)
  const stripNativeWidth =
    emails.length * FRAME_WIDTH + (emails.length - 1) * FRAME_GAP;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const compute = () => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = size.w > 0 ? Math.min(1, size.w / stripNativeWidth) : 1;
  const nativeHeight = scale > 0 ? size.h / scale : size.h;

  return (
    <div className="flex h-screen flex-col bg-zinc-200">
      {/* ── Header bar ─────────────────────────────────────────────── */}
      <header className="border-b border-zinc-300 bg-white px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.28em] text-red-600">
              Previews 2 &middot; staging
            </p>
            <h1 className="mt-1 font-display text-2xl font-black uppercase tracking-tight text-zinc-900">
              Email uniformity lab
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
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
            className="shrink-0 rounded-sm bg-zinc-900 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white transition-colors hover:bg-zinc-800"
          >
            &larr; Standard previews
          </Link>
        </div>
      </header>

      {/* ── Scaled strip ───────────────────────────────────────────── */}
      <div
        ref={wrapRef}
        className="relative flex-1 overflow-hidden"
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
                    <p className="font-mono text-[11px] text-zinc-500">
                      Subject &middot; {email.subject}
                    </p>
                  </div>
                </div>
                {/* Email frame */}
                <div className="flex-1 overflow-hidden bg-white shadow-[0_2px_0_0_#dc2626,0_0_0_1px_#d4d4d8]">
                  <iframe
                    title={`${email.title} preview`}
                    srcDoc={email.html}
                    sandbox="allow-same-origin"
                    className="block border-0 bg-white"
                    style={{ width: "100%", height: "100%" }}
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
