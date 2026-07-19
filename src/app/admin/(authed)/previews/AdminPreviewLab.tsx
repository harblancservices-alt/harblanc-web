"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PreviewTabs } from "./PreviewTabs";

/**
 * Admin Preview Lab — read-only viewer.
 *
 * Receives pre-rendered email HTML from the server component and renders
 * a grid of trip-card-style tiles. Tapping a tile anywhere opens a
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
  // One chip shape for every kind; only the ink shifts so emails read as
  // the customer-facing sends and in-house docs stay quiet.
  const base =
    "rounded border border-line-strong bg-inset px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] ";
  switch (c) {
    case "customer_email":
      return base + "text-accent";
    case "customer_page":
      return base + "text-fg-muted";
    case "in_house_doc":
      return base + "text-fg-subtle";
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <PreviewTabs active="standard" />
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-subtle">
          Preview only &middot; nothing is sent or saved
        </p>
      </div>

      {/* Whole card is the Preview action — tap anywhere to open the
          viewer, same affordance as a trip card opening a trip. */}
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {targets.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => setOpenId(t.id)}
              className="flex h-full w-full flex-col items-start gap-2 rounded-lg border border-line-strong bg-card p-3 text-left shadow-e2 transition-shadow hover:shadow-e3 active:bg-inset"
            >
              <span className={classificationClasses(t.classification)}>
                {classificationLabel(t.classification)}
              </span>
              <h2 className="text-[13px] font-semibold leading-snug text-fg">
                {formatTitle(t)}
              </h2>
              <span className="mt-auto w-full truncate font-mono text-[10px] text-fg-subtle">
                {t.kind === "email" ? t.subject : t.route}
              </span>
            </button>
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
        className="block border-0 bg-card"
        style={{ width: `${width}px`, height: "100%" }}
      />
    ) : (
      <iframe
        key={`${target.id}-${kind}`}
        title={`${target.title} ${kind} preview`}
        src={target.route}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
        className="block border-0 bg-card"
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
            <p className="mb-3 font-mono text-sm font-bold uppercase tracking-[0.14em] text-fg-subtle">
              Mobile &middot; {MOBILE_FRAME_WIDTH}px
            </p>
            <div className="flex-1 overflow-hidden rounded-lg border border-line-strong bg-card shadow-e2">
              {renderIframe(MOBILE_FRAME_WIDTH, "mobile")}
            </div>
          </div>
          {/* Desktop column */}
          <div
            className="flex flex-col"
            style={{ width: `${DESKTOP_FRAME_WIDTH}px` }}
          >
            <p className="mb-3 font-mono text-sm font-bold uppercase tracking-[0.14em] text-fg-subtle">
              Desktop &middot; {DESKTOP_FRAME_WIDTH}px
            </p>
            <div className="flex-1 overflow-hidden rounded-lg border border-line-strong bg-card shadow-e2">
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
 *   │ Backdrop (bg-canvas/85, padded)                                │
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
      className="fixed inset-0 z-50 flex bg-canvas/85 p-4 sm:p-8 lg:p-10"
      role="dialog"
      aria-modal="true"
      aria-label={`${target.title} preview`}
      onClick={onClose}
    >
      {/* Modal frame — sits inside the backdrop with margin on every
          side. onClick on backdrop closes; stopPropagation on the
          frame keeps inner clicks from bubbling up to the dismiss. */}
      <div
        className="relative flex h-full w-full flex-col overflow-hidden rounded-lg border border-line-strong bg-card shadow-e3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="relative flex shrink-0 items-center gap-3 border-b border-line-strong bg-card px-4 py-2.5 sm:px-5 sm:py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-fg">
              {formatTitle(target)}
            </p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-fg-subtle sm:text-[11px]">
              {target.kind === "email" ? target.subject : target.route}
            </p>
          </div>
          <span
            className={
              "hidden shrink-0 sm:inline-block " +
              classificationClasses(target.classification)
            }
          >
            {classificationLabel(target.classification)}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            title="Close (Esc)"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line-strong bg-inset text-fg shadow-e1 transition-shadow hover:shadow-e2"
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
          <main className="relative flex min-h-0 flex-1 bg-inset p-4 sm:p-5">
            <ResponsivePreview target={target} />
          </main>

          {/* Sidebar — list of every other preview, grouped. Click swaps
              the iframe without closing the modal. Slightly narrower
              (w-64) so the iframe column has more room. */}
          <aside
            aria-label="Other previews"
            className="hidden w-64 shrink-0 flex-col overflow-y-auto border-l border-line-strong bg-card md:flex"
          >
            <div className="border-b border-line px-4 py-3">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg-muted">
                All previews
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
                    <p className="px-2 pt-1 pb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg-subtle">
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
                                "flex w-full items-start gap-2 rounded-md px-3 py-2 text-left transition-colors " +
                                (isActive
                                  ? "border border-line-strong bg-inset text-fg shadow-e1"
                                  : "border border-transparent text-fg-muted hover:bg-inset")
                              }
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[12px] font-semibold">
                                  {formatTitle(t)}
                                </span>
                                <span className="mt-0.5 block truncate font-mono text-[10px] text-fg-subtle">
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
