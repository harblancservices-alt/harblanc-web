"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * Admin Preview Lab — read-only viewer.
 *
 * Receives pre-rendered email HTML from the server component and renders
 * a grid of preview cards. Each card has a Preview button that opens a
 * full-screen modal with the asset visible inside an iframe.
 *
 * The modal carries a right-side sidebar listing every other preview
 * target. Clicking a row in the sidebar swaps the iframe without
 * closing — useful while iterating on a shared visual theme across
 * pages, where the operator wants to flip back and forth between the
 * home page, the quote success page, and the intake screen without
 * dismissing the viewer.
 *
 * Two asset kinds:
 *   - email   → renders the HTML string with srcDoc inside the iframe
 *   - route   → renders a same-origin route inside the iframe (used by
 *               the customer-page previews under /admin/previews/...)
 *
 * Side-by-side mobile + desktop view. The preview pane shows two
 * iframes simultaneously — a 402px-wide mobile viewport and a 1280px-
 * wide desktop viewport — so the operator can visually QA both
 * breakpoints of the same page without flipping between two windows.
 * The pair is scaled as a single unit to fit the available column
 * width, so both frames are always fully visible.
 */

export type PreviewClassification =
  | "customer_email"
  | "customer_page"
  | "in_house_doc";

type PreviewTargetBase = {
  id: string;
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
  switch (c) {
    case "customer_email":
      return "border border-red-700 bg-red-50 text-red-800";
    case "customer_page":
      return "border border-zinc-400 bg-white text-black";
    case "in_house_doc":
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

  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);

  const handleSelect = useCallback((id: string) => {
    setOpenId(id);
  }, []);

  return (
    <div>
      {/* Lab tabs — Standard (this page) + Previews 2 (email comparison) */}
      <nav
        aria-label="Preview lab tabs"
        className="mb-3 flex items-stretch border border-zinc-300 bg-white"
      >
        <span className="flex items-center gap-2 border-r border-zinc-300 bg-red-600 px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-white">
          <span aria-hidden className="inline-block h-3 w-1 bg-white" />
          Standard previews
        </span>
        <Link
          href="/admin/previews-2"
          className="flex items-center gap-2 px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-red-700"
        >
          Previews 2 &middot; email uniformity lab &rarr;
        </Link>
      </nav>
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
        <Modal
          targets={targets}
          activeId={active.id}
          onSelect={handleSelect}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * ResponsivePreview — renders TWO iframes (mobile 390px + desktop
 * 1280px) of the same target side by side, then scales the pair as a
 * single unit via CSS transform so both fit in the available column.
 *
 * Why this beats two separate previews:
 *   - Operator sees both breakpoints simultaneously while iterating on
 *     the shared theme; no toggling, no second window
 *   - Both iframes carry their intrinsic native widths (402 / 1280) so
 *     Tailwind's mobile and md/lg/xl breakpoints fire correctly inside
 *     each, regardless of how much the pair is scaled visually
 *   - The pair is centered horizontally in the available area so wider
 *     monitors get framed whitespace rather than left-anchored content
 *
 * Labels above each iframe sit inside the scaled area at text-sm so
 * they remain readable after the scale transform.
 */
const MOBILE_FRAME_WIDTH = 402;
const DESKTOP_FRAME_WIDTH = 1920;
const FRAME_GAP = 64;
const PAIR_NATIVE_WIDTH =
  MOBILE_FRAME_WIDTH + FRAME_GAP + DESKTOP_FRAME_WIDTH;

function ResponsivePreview({ target }: { target: PreviewTarget }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({
    w: PAIR_NATIVE_WIDTH,
    h: 900,
  });

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

  const scale = Math.min(1, size.w / PAIR_NATIVE_WIDTH);
  // Inflate native height so the scaled pair fills the container height.
  const nativeHeight = scale > 0 ? size.h / scale : size.h;

  const renderIframe = (width: number, kind: "mobile" | "desktop") =>
    target.kind === "email" ? (
      <iframe
        key={`${target.id}-${kind}`}
        title={`${target.title} ${kind} preview`}
        srcDoc={target.html}
        sandbox="allow-same-origin"
        className="block border-0 bg-white"
        style={{ width: `${width}px`, height: "100%" }}
      />
    ) : (
      <iframe
        key={`${target.id}-${kind}`}
        title={`${target.title} ${kind} preview`}
        src={target.route}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
        className="block border-0 bg-white"
        style={{ width: `${width}px`, height: "100%" }}
      />
    );

  // Centering trick — left:50% + translateX(-50%) places the pair's
  // horizontal center at the container's center. The scale transform
  // composes with the translate via transformOrigin: top center.
  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden"
    >
      <div
        className="absolute top-0"
        style={{
          left: "50%",
          width: `${PAIR_NATIVE_WIDTH}px`,
          height: `${nativeHeight}px`,
          transform: `translateX(-50%) scale(${scale})`,
          transformOrigin: "top center",
        }}
      >
        <div className="flex h-full gap-16">
          {/* Mobile column */}
          <div
            className="flex flex-col"
            style={{ width: `${MOBILE_FRAME_WIDTH}px` }}
          >
            <p className="mb-3 flex items-center gap-2 font-mono text-sm font-bold uppercase tracking-[0.18em] text-zinc-600">
              <span
                aria-hidden
                className="inline-block h-3 w-1 bg-red-600"
              />
              Mobile &middot; {MOBILE_FRAME_WIDTH}px
            </p>
            <div className="flex-1 overflow-hidden bg-white shadow-[0_2px_0_0_#dc2626,0_0_0_1px_#d4d4d8]">
              {renderIframe(MOBILE_FRAME_WIDTH, "mobile")}
            </div>
          </div>
          {/* Desktop column */}
          <div
            className="flex flex-col"
            style={{ width: `${DESKTOP_FRAME_WIDTH}px` }}
          >
            <p className="mb-3 flex items-center gap-2 font-mono text-sm font-bold uppercase tracking-[0.18em] text-zinc-600">
              <span
                aria-hidden
                className="inline-block h-3 w-1 bg-red-600"
              />
              Desktop &middot; {DESKTOP_FRAME_WIDTH}px
            </p>
            <div className="flex-1 overflow-hidden bg-white shadow-[0_2px_0_0_#dc2626,0_0_0_1px_#d4d4d8]">
              {renderIframe(DESKTOP_FRAME_WIDTH, "desktop")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Full-screen preview viewer. The outer overlay is dimmed black; the
 * modal frame floats inside it with margin from the viewport edges
 * (p-4 / sm:p-6) so the lab feels like a desktop window, not edge-to-
 * edge fullscreen.
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Backdrop (bg-black/85, padded)                                │
 *   │  ┌──────────────────────────────────────────────────────────┐ │
 *   │  │ Header — current target + close                          │ │
 *   │  ├──────────────────────────────────────────┬───────────────┤ │
 *   │  │                                          │ Sidebar       │ │
 *   │  │ Scaled iframe (always full desktop view, │  Pages        │ │
 *   │  │ shrunk to fit if monitor is narrow)      │  · Home       │ │
 *   │  │                                          │  · ...        │ │
 *   │  └──────────────────────────────────────────┴───────────────┘ │
 *   └──────────────────────────────────────────────────────────────┘
 */
function Modal({
  targets,
  activeId,
  onSelect,
  onClose,
}: {
  targets: ReadonlyArray<PreviewTarget>;
  activeId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const target = targets.find((t) => t.id === activeId);
  if (!target) return null;

  const groups: ReadonlyArray<{
    label: string;
    classification: PreviewClassification;
  }> = [
    { label: "Pages", classification: "customer_page" },
    { label: "Emails", classification: "customer_email" },
    { label: "In-house", classification: "in_house_doc" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex bg-black/85 p-4 sm:p-8 lg:p-10"
      role="dialog"
      aria-modal="true"
      aria-label={`${target.title} preview`}
      onClick={onClose}
    >
      {/* Modal frame — sits inside the backdrop with margin on every
          side. onClick on backdrop closes; stopPropagation on the
          frame keeps inner clicks from bubbling up to the dismiss. */}
      <div
        className="relative flex h-full w-full flex-col overflow-hidden border border-zinc-300 bg-white shadow-[0_24px_60px_-12px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="relative flex shrink-0 items-center gap-3 border-b-2 border-red-600 bg-white px-4 py-2.5 sm:px-5 sm:py-3">
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

        {/* Body — iframe + sidebar split */}
        <div className="flex min-h-0 flex-1">
          {/* Iframe column. ScaledFrame renders at 1280px native width
              and scales down via CSS transform to fit if the available
              container width is smaller. The iframe stays at 1280px
              intrinsically so md/lg/xl breakpoints fire inside. */}
          {/* Iframe column — side-by-side mobile + desktop preview. */}
          <main className="relative flex min-h-0 flex-1 bg-neutral-200 p-4 sm:p-5">
            <ResponsivePreview target={target} />
          </main>

          {/* Sidebar — list of every other preview, grouped. Click swaps
              the iframe without closing the modal. Slightly narrower
              (w-64) so the iframe column has more room. */}
          <aside
            aria-label="Other previews"
            className="hidden w-64 shrink-0 flex-col overflow-y-auto border-l border-zinc-300 bg-zinc-50 md:flex"
          >
            <div className="border-b border-zinc-300 bg-white px-4 py-3">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
                All previews
              </p>
              <p className="mt-1 text-[11px] text-zinc-600">
                Click any row to swap the viewer without closing.
              </p>
            </div>
            <nav className="flex-1 px-2 py-3">
              {groups.map((group) => {
                const items = targets.filter(
                  (t) => t.classification === group.classification,
                );
                if (items.length === 0) return null;
                return (
                  <div key={group.classification} className="mb-4 last:mb-0">
                    <p className="px-2 pt-1 pb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                      {group.label}
                    </p>
                    <ul>
                      {items.map((t) => {
                        const isActive = t.id === activeId;
                        return (
                          <li key={t.id}>
                            <button
                              type="button"
                              onClick={() => onSelect(t.id)}
                              aria-current={isActive ? "true" : undefined}
                              className={
                                "flex w-full items-start gap-2 border-l-2 px-3 py-2 text-left transition-colors " +
                                (isActive
                                  ? "border-l-red-600 bg-white text-black shadow-[inset_0_0_0_1px_#e4e4e7]"
                                  : "border-l-transparent text-zinc-700 hover:border-l-zinc-400 hover:bg-white")
                              }
                            >
                              <span
                                aria-hidden
                                className={
                                  "mt-1 inline-block h-2 w-2 shrink-0 rounded-full " +
                                  (isActive ? "bg-red-600" : "bg-zinc-300")
                                }
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[12px] font-semibold uppercase tracking-[0.06em]">
                                  {formatTitle(t)}
                                </span>
                                <span className="mt-0.5 block truncate font-mono text-[10px] text-zinc-500">
                                  {t.kind === "email" ? t.subject : t.route}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </nav>
          </aside>
        </div>
      </div>
    </div>
  );
}
