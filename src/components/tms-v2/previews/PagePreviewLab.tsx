"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { PreviewsTabs } from "@/components/tms-v2/previews/PreviewsTabs";

/**
 * Page Previews — ported from /admin/previews' AdminPreviewLab, trimmed
 * to just the "route" kind (the customer-facing form/view pages) since
 * emails have their own tab here (Email Previews). Each tile opens a
 * full-screen modal with the live route rendered same-origin in an
 * iframe, side-by-side mobile (402px) + desktop (1920px) viewports so
 * both breakpoints are visible without switching windows. The routes
 * themselves still live at /admin/previews/... (never duplicated here) —
 * this tool is a same-origin viewer over them, same auth session as the
 * rest of /tms-v2 and /admin share.
 */

export type PageClassification = "customer_form" | "customer_view";

export type PageTarget = {
  id: string;
  title: string;
  classification: PageClassification;
  /** Flags a quote-pipeline asset with an extra QUOTE chip. */
  quote?: boolean;
  route: string;
};

type CategoryMeta = {
  chip: string;
  section: string;
  chipTone: string;
  dot: string;
};

const CATEGORIES: Record<PageClassification, CategoryMeta> = {
  customer_form: {
    chip: "Customer form",
    section: "Customer forms",
    chipTone: "border-steel/40 bg-steel-bg text-steel",
    dot: "bg-steel",
  },
  customer_view: {
    chip: "Customer view",
    section: "Customer views",
    chipTone: "border-ok/40 bg-ok-bg text-ok",
    dot: "bg-ok",
  },
};

const CATEGORY_ORDER: ReadonlyArray<PageClassification> = ["customer_form", "customer_view"];

const CHIP_BASE = "rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] ";

function Chips({ target }: { target: PageTarget }) {
  const meta = CATEGORIES[target.classification];
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className={CHIP_BASE + meta.chipTone}>{meta.chip}</span>
      {target.quote ? <span className={CHIP_BASE + "border-line-strong bg-inset text-fg-muted"}>Quote</span> : null}
    </div>
  );
}

export function PagePreviewLab({ targets }: { targets: ReadonlyArray<PageTarget> }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const active = openId ? targets.find((t) => t.id === openId) ?? null : null;

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
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Page Previews"
        description="Customer-facing forms and views, rendered live with sample data — the coding aid for QA-ing pages without submitting anything real."
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <PreviewsTabs active="pages" />
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-subtle">Preview only &middot; nothing is sent or saved</p>
      </div>

      <div className="space-y-5">
        {CATEGORY_ORDER.map((category) => {
          const items = targets.filter((t) => t.classification === category);
          if (items.length === 0) return null;
          const meta = CATEGORIES[category];
          return (
            <section key={category}>
              <div className="mb-2 flex items-center gap-2">
                <span aria-hidden className={"inline-block h-2 w-2 shrink-0 rounded-full " + meta.dot} />
                <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg-muted">{meta.section}</h2>
                <span className="font-mono text-[10px] tabular-nums text-fg-subtle">&middot; {items.length}</span>
              </div>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(t.id)}
                      className="flex h-full w-full flex-col items-start gap-2 rounded-lg border border-line-strong bg-card p-3 text-left shadow-e2 transition-shadow hover:shadow-e3 active:bg-inset"
                    >
                      <Chips target={t} />
                      <h3 className="text-[13px] font-semibold leading-snug text-fg">{t.title}</h3>
                      <span className="mt-auto w-full truncate font-mono text-[10px] text-fg-subtle">{t.route}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {active ? <Modal targets={targets} activeId={active.id} onSelect={handleSelect} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

const MOBILE_FRAME_WIDTH = 402;
const DESKTOP_FRAME_WIDTH = 1920;
const FRAME_GAP = 64;
const PAIR_NATIVE_WIDTH = MOBILE_FRAME_WIDTH + FRAME_GAP + DESKTOP_FRAME_WIDTH;

function ResponsivePreview({ target }: { target: PageTarget }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: PAIR_NATIVE_WIDTH, h: 900 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const compute = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = Math.min(1, size.w / PAIR_NATIVE_WIDTH);
  const nativeHeight = scale > 0 ? size.h / scale : size.h;

  const renderIframe = (width: number, kind: "mobile" | "desktop") => (
    <iframe
      key={`${target.id}-${kind}`}
      title={`${target.title} ${kind} preview`}
      src={target.route}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
      className="block border-0 bg-card"
      style={{ width: `${width}px`, height: "100%" }}
    />
  );

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
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
          <div className="flex flex-col" style={{ width: `${MOBILE_FRAME_WIDTH}px` }}>
            <p className="mb-3 font-mono text-sm font-bold uppercase tracking-[0.14em] text-fg-subtle">Mobile &middot; {MOBILE_FRAME_WIDTH}px</p>
            <div className="flex-1 overflow-hidden rounded-lg border border-line-strong bg-card shadow-e2">{renderIframe(MOBILE_FRAME_WIDTH, "mobile")}</div>
          </div>
          <div className="flex flex-col" style={{ width: `${DESKTOP_FRAME_WIDTH}px` }}>
            <p className="mb-3 font-mono text-sm font-bold uppercase tracking-[0.14em] text-fg-subtle">Desktop &middot; {DESKTOP_FRAME_WIDTH}px</p>
            <div className="flex-1 overflow-hidden rounded-lg border border-line-strong bg-card shadow-e2">{renderIframe(DESKTOP_FRAME_WIDTH, "desktop")}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Modal({
  targets,
  activeId,
  onSelect,
  onClose,
}: {
  targets: ReadonlyArray<PageTarget>;
  activeId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const target = targets.find((t) => t.id === activeId);
  if (!target) return null;

  const groups = CATEGORY_ORDER.map((classification) => ({
    classification,
    label: CATEGORIES[classification].section,
    dot: CATEGORIES[classification].dot,
  }));

  return (
    <div
      className="fixed inset-0 z-50 flex bg-canvas/85 p-4 sm:p-8 lg:p-10"
      role="dialog"
      aria-modal="true"
      aria-label={`${target.title} preview`}
      onClick={onClose}
    >
      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-lg border border-line-strong bg-card shadow-e3" onClick={(e) => e.stopPropagation()}>
        <header className="relative flex shrink-0 items-center gap-3 border-b border-line-strong bg-card px-4 py-2.5 sm:px-5 sm:py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-fg">{target.title}</p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-fg-subtle sm:text-[11px]">{target.route}</p>
          </div>
          <span className="hidden shrink-0 sm:block">
            <Chips target={target} />
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            title="Close (Esc)"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line-strong bg-inset text-fg shadow-e1 transition-shadow hover:shadow-e2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <main className="relative flex min-h-0 flex-1 bg-inset p-4 sm:p-5">
            <ResponsivePreview target={target} />
          </main>

          <aside aria-label="Other previews" className="hidden w-64 shrink-0 flex-col overflow-y-auto border-l border-line-strong bg-card md:flex">
            <div className="border-b border-line px-4 py-3">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg-muted">All previews</p>
            </div>
            <nav className="flex-1 px-2 py-3">
              {groups.map((group) => {
                const items = targets.filter((t) => t.classification === group.classification);
                if (items.length === 0) return null;
                return (
                  <div key={group.classification} className="mb-4 last:mb-0">
                    <p className="flex items-center gap-1.5 px-2 pt-1 pb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg-subtle">
                      <span aria-hidden className={"inline-block h-1.5 w-1.5 shrink-0 rounded-full " + group.dot} />
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
                                (isActive ? "border border-line-strong bg-inset text-fg shadow-e1" : "border border-transparent text-fg-muted hover:bg-inset")
                              }
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[12px] font-semibold">{t.title}</span>
                                <span className="mt-0.5 block truncate font-mono text-[10px] text-fg-subtle">{t.route}</span>
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
