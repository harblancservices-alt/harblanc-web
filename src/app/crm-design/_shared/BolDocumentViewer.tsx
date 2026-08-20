"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Badge, TEXT } from "../_design/ui";
import {
  IconFitPage,
  IconFitWidth,
  IconMaximize,
  IconMinimize,
  IconX,
  IconZoomIn,
  IconZoomOut,
} from "../_design/icons";
import { formatDateTime } from "../_lib/format";
import type { BolRecord } from "../_lib/types";

/**
 * The document/photo viewer for a BOL under review — a proper document-
 * verification tool, not a small preview. Brent's feedback on the first cut
 * (a ~2" thumbnail with a single fake "zoomed" state) drove a full rewrite:
 * real continuous zoom, cursor/click-anchored so the spot you're looking at
 * stays put, click-drag panning via native scroll (works with touch and
 * trackpad for free), fit-width/fit-page/100% shortcuts, and a fullscreen
 * mode for close reading — all built once in `useZoomPan` and shared between
 * the embedded pane (bol-center/[id]/page.tsx's dominant left column) and
 * the fullscreen overlay, so there's exactly one place this logic lives.
 *
 * Two content types, same zoom/pan mechanics: a real scan (`bol.scanPages`,
 * e.g. BOL #000025029) renders the actual image; every other seed BOL has
 * no real asset, so it renders a stylized reconstruction of the BOL form at
 * a fixed "natural" size (mockNaturalSize) that the same zoom math treats
 * identically to a real image's naturalWidth/naturalHeight.
 */

const MIN_SCALE = 0.15;
const MAX_SCALE = 5;
const WHEEL_ZOOM_FACTOR = 1.15;
const BUTTON_ZOOM_FACTOR = 1.35;
const mockNaturalSize = { w: 850, h: 1100 };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function useZoomPan(containerRef: React.RefObject<HTMLDivElement | null>, naturalSize: { w: number; h: number }) {
  const [scale, setScale] = useState(1);
  const [fitMode, setFitMode] = useState<"width" | "page">("width");
  const isFitRef = useRef(true);
  const dragRef = useRef<{ dragging: boolean; x: number; y: number; scrollLeft: number; scrollTop: number }>({
    dragging: false,
    x: 0,
    y: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });

  const computeFitScale = useCallback(
    (mode: "width" | "page") => {
      const el = containerRef.current;
      if (!el) return 1;
      const cw = Math.max(el.clientWidth - 32, 40);
      const ch = Math.max(el.clientHeight - 32, 40);
      const byWidth = cw / naturalSize.w;
      if (mode === "width") return clamp(byWidth, MIN_SCALE, MAX_SCALE);
      const byHeight = ch / naturalSize.h;
      return clamp(Math.min(byWidth, byHeight), MIN_SCALE, MAX_SCALE);
    },
    [containerRef, naturalSize],
  );

  const zoomTo = useCallback(
    (target: number, clientX?: number, clientY?: number) => {
      const el = containerRef.current;
      if (!el) return;
      const oldScale = scale;
      const newScale = clamp(target, MIN_SCALE, MAX_SCALE);
      const rect = el.getBoundingClientRect();
      const anchorX = clientX !== undefined ? clientX - rect.left : el.clientWidth / 2;
      const anchorY = clientY !== undefined ? clientY - rect.top : el.clientHeight / 2;
      const contentX = el.scrollLeft + anchorX;
      const contentY = el.scrollTop + anchorY;
      const ratio = newScale / oldScale;
      setScale(newScale);
      requestAnimationFrame(() => {
        el.scrollLeft = contentX * ratio - anchorX;
        el.scrollTop = contentY * ratio - anchorY;
      });
    },
    [containerRef, scale],
  );

  const zoomBy = useCallback(
    (factor: number, clientX?: number, clientY?: number) => {
      isFitRef.current = false;
      zoomTo(scale * factor, clientX, clientY);
    },
    [scale, zoomTo],
  );

  const applyFit = useCallback(
    (mode: "width" | "page") => {
      setFitMode(mode);
      isFitRef.current = true;
      const el = containerRef.current;
      const next = computeFitScale(mode);
      setScale(next);
      if (el) requestAnimationFrame(() => (el.scrollLeft = el.scrollTop = 0));
    },
    [computeFitScale, containerRef],
  );

  const toggleFitAnd100 = useCallback(
    (clientX?: number, clientY?: number) => {
      const fit = computeFitScale(fitMode);
      if (Math.abs(scale - fit) < 0.02) {
        isFitRef.current = false;
        zoomTo(1, clientX, clientY);
      } else {
        isFitRef.current = true;
        zoomTo(fit, clientX, clientY);
      }
    },
    [computeFitScale, fitMode, scale, zoomTo],
  );

  // Initial fit once the container has real dimensions.
  useLayoutEffect(() => {
    applyFit("width");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naturalSize.w, naturalSize.h]);

  // Re-fit on viewport resize, but only if the user hasn't manually zoomed.
  useEffect(() => {
    function onResize() {
      if (isFitRef.current) applyFit(fitMode);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [applyFit, fitMode]);

  // Native (non-passive) wheel listener — React's synthetic onWheel can't
  // reliably preventDefault the page scroll on every browser/React version.
  // Re-attached whenever `zoomTo` changes (i.e. every scale change, since
  // zoomTo's own deps include `scale`) so the closure is never stale — the
  // alternative (a ref for scale, attach-once) still leaves zoomTo's own
  // internal `oldScale` closure stale, which breaks cursor-anchoring after
  // the first zoom step.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR;
      isFitRef.current = false;
      zoomTo(scale * factor, e.clientX, e.clientY);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [containerRef, zoomTo, scale]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const el = containerRef.current;
    if (!el) return;
    dragRef.current = { dragging: true, x: e.clientX, y: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
    el.setPointerCapture(e.pointerId);
  }, [containerRef]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d.dragging) return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollLeft = d.scrollLeft - (e.clientX - d.x);
    el.scrollTop = d.scrollTop - (e.clientY - d.y);
  }, [containerRef]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current.dragging = false;
    containerRef.current?.releasePointerCapture(e.pointerId);
  }, [containerRef]);

  return {
    scale,
    fitMode,
    zoomIn: (clientX?: number, clientY?: number) => zoomBy(BUTTON_ZOOM_FACTOR, clientX, clientY),
    zoomOut: (clientX?: number, clientY?: number) => zoomBy(1 / BUTTON_ZOOM_FACTOR, clientX, clientY),
    applyFit,
    toggleFitAnd100,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    isDragging: () => dragRef.current.dragging,
  };
}

function ZoomToolbar({
  scale,
  fitMode,
  onZoomIn,
  onZoomOut,
  onFitWidth,
  onFitPage,
  fullscreen,
  onToggleFullscreen,
}: {
  scale: number;
  fitMode: "width" | "page";
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
  onFitPage: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const btn = (active: boolean) =>
    `flex h-8 items-center gap-1.5 rounded-[var(--cd-radius-sm)] border px-2.5 text-[11.5px] font-semibold transition-colors ${
      active
        ? "border-[var(--cd-admin)]/40 bg-[var(--cd-admin-soft)] text-[var(--cd-admin)]"
        : "border-[var(--cd-border-strong)] bg-[var(--cd-surface)] text-[var(--cd-text-muted)] hover:bg-[var(--cd-surface-hover)]"
    }`;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={onZoomOut} className={btn(false)} aria-label="Zoom out">
        <IconZoomOut width={14} height={14} />
      </button>
      <span className="w-11 shrink-0 text-center text-[11.5px] font-bold tabular-nums text-[var(--cd-text-muted)]">
        {Math.round(scale * 100)}%
      </span>
      <button type="button" onClick={onZoomIn} className={btn(false)} aria-label="Zoom in">
        <IconZoomIn width={14} height={14} />
      </button>
      <div className="mx-0.5 h-5 w-px bg-[var(--cd-border)]" />
      <button type="button" onClick={onFitWidth} className={btn(fitMode === "width")} aria-label="Fit width">
        <IconFitWidth width={14} height={14} /> <span className="hidden sm:inline">Fit Width</span>
      </button>
      <button type="button" onClick={onFitPage} className={btn(fitMode === "page")} aria-label="Fit page">
        <IconFitPage width={14} height={14} /> <span className="hidden sm:inline">Fit Page</span>
      </button>
      <div className="mx-0.5 h-5 w-px bg-[var(--cd-border)]" />
      <button type="button" onClick={onToggleFullscreen} className={btn(false)} aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
        {fullscreen ? <IconMinimize width={14} height={14} /> : <IconMaximize width={14} height={14} />}
        <span className="hidden sm:inline">{fullscreen ? "Exit" : "Fullscreen"}</span>
      </button>
    </div>
  );
}

function ViewerPane({
  bol,
  pageIndex,
  setPageIndex,
  fullscreen,
  onToggleFullscreen,
}: {
  bol: BolRecord;
  pageIndex: number;
  setPageIndex: (i: number) => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const scanPages = bol.scanPages;
  const isPending = bol.docNumber === "—";
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalSize, setNaturalSize] = useState(mockNaturalSize);
  const zp = useZoomPan(containerRef, naturalSize);

  // Real scans report their true pixel size once loaded, via the <img>'s
  // onLoad below — except a browser-cached image (revisiting a BOL, or
  // switching back to a page already viewed) can finish loading before
  // React's onLoad handler is even attached, so `load` never fires. This
  // effect covers that case by checking `.complete` directly whenever the
  // active page changes, in addition to onLoad covering the fresh-load case.
  useEffect(() => {
    if (!scanPages) {
      setNaturalSize(mockNaturalSize);
      return;
    }
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      setNaturalSize({ w: el.naturalWidth, h: el.naturalHeight });
    }
  }, [scanPages, pageIndex]);

  return (
    <div className="flex h-full min-w-0 flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold text-[var(--cd-text)]">{bol.fileName}</p>
          <p className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>Uploaded {formatDateTime(bol.uploadedAt)}</p>
        </div>
        {!isPending && (
          <ZoomToolbar
            scale={zp.scale}
            fitMode={zp.fitMode}
            onZoomIn={() => zp.zoomIn()}
            onZoomOut={() => zp.zoomOut()}
            onFitWidth={() => zp.applyFit("width")}
            onFitPage={() => zp.applyFit("page")}
            fullscreen={fullscreen}
            onToggleFullscreen={onToggleFullscreen}
          />
        )}
      </div>

      {scanPages && scanPages.length > 1 && (
        <div className="flex gap-1.5">
          {scanPages.map((p, i) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setPageIndex(i)}
              className={`rounded-[var(--cd-radius-sm)] border px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
                i === pageIndex
                  ? "border-[var(--cd-admin)]/40 bg-[var(--cd-admin-soft)] text-[var(--cd-admin)]"
                  : "border-[var(--cd-border-strong)] bg-[var(--cd-surface)] text-[var(--cd-text-muted)] hover:bg-[var(--cd-surface-hover)]"
              }`}
            >
              {i + 1}. {p.label}
            </button>
          ))}
        </div>
      )}

      {isPending ? (
        <div className="flex aspect-[8.5/11] w-full flex-col items-center justify-center gap-2 rounded border border-dashed border-[var(--cd-border-strong)] bg-[var(--cd-surface)] text-[var(--cd-text-subtle)]">
          <span className={TEXT.micro}>Photo received — extraction hasn&rsquo;t run yet.</span>
        </div>
      ) : (
        <div
          ref={containerRef}
          onPointerDown={zp.onPointerDown}
          onPointerMove={zp.onPointerMove}
          onPointerUp={zp.onPointerUp}
          onPointerLeave={zp.onPointerUp}
          onDoubleClick={(e) => zp.toggleFitAnd100(e.clientX, e.clientY)}
          className={`cd-scroll relative min-h-[420px] min-w-0 flex-1 select-none overflow-auto rounded-[var(--cd-radius-md)] border border-[var(--cd-border)] bg-[var(--cd-surface-2)] p-4 ${
            zp.isDragging() ? "cursor-grabbing" : "cursor-grab"
          }`}
        >
          {scanPages ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef}
              src={scanPages[pageIndex]?.url}
              alt={`${bol.docNumber} — ${scanPages[pageIndex]?.label}`}
              draggable={false}
              onLoad={(e) => setNaturalSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              className="block rounded shadow-[0_1px_6px_rgba(0,0,0,0.18)]"
              style={{ width: naturalSize.w * zp.scale, height: naturalSize.h * zp.scale, maxWidth: "none" }}
            />
          ) : (
            <div style={{ width: mockNaturalSize.w * zp.scale, height: mockNaturalSize.h * zp.scale }}>
              <div
                className="flex flex-col gap-2.5 overflow-hidden rounded border border-[#d9d5c9] bg-[#fbfaf6] p-5 text-[10px] text-[#1c1c1c] shadow-[0_1px_6px_rgba(0,0,0,0.18)]"
                style={{
                  width: mockNaturalSize.w,
                  height: mockNaturalSize.h,
                  transform: `scale(${zp.scale})`,
                  transformOrigin: "top left",
                }}
              >
                <div className="flex items-center justify-between border-b-2 border-[#1c1c1c] pb-1.5">
                  <span className="text-[13px] font-black uppercase tracking-wide">Bill of Lading</span>
                  <span className="text-[9px] text-[#555]">BOL # {bol.docNumber}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 border-b border-[#d9d5c9] pb-2">
                  <MockField label="Ship From" value={bol.extraction.shipperName.value} />
                  <MockField label="Ship To" value={bol.extraction.consigneeName.value} />
                  <MockField label="Pickup Addr" value={`${bol.extraction.pickupAddress.value}, ${bol.extraction.pickupCity.value} ${bol.extraction.pickupState.value}`} />
                  <MockField label="Delivery Addr" value={`${bol.extraction.deliveryAddress.value}, ${bol.extraction.deliveryCity.value} ${bol.extraction.deliveryState.value}`} />
                </div>
                <div className="grid grid-cols-2 gap-2 border-b border-[#d9d5c9] pb-2">
                  <MockField label="Carrier" value={bol.extraction.carrierName.value} />
                  <MockField label="Broker" value={bol.extraction.brokerName.value} />
                  <MockField label="Pickup Date" value={bol.extraction.pickupDate.value} />
                  <MockField label="Delivery Date" value={bol.extraction.deliveryDate.value} />
                </div>
                <div className="grid grid-cols-2 gap-2 border-b border-[#d9d5c9] pb-2">
                  <MockField label="Commodity" value={bol.extraction.commodity.value} />
                  <MockField label="Weight" value={bol.extraction.weight.value} />
                  <MockField label="Reference #" value={bol.extraction.referenceNumber.value} />
                </div>
                <div className="mt-auto flex items-center justify-between pt-2 text-[8px] text-[#8a8676]">
                  <span>Driver signature: ______________________</span>
                  <span>Photo capture · {bol.fileName}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge tone="neutral">Original — read only</Badge>
        {!isPending && (
          <span className={`${TEXT.micro} text-[var(--cd-text-subtle)]`}>
            Scroll/pinch or drag to pan · double-click to toggle 100%/fit
          </span>
        )}
      </div>
    </div>
  );
}

export function BolDocumentViewer({ bol }: { bol: BolRecord }) {
  const [pageIndex, setPageIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFullscreen(false);
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [fullscreen]);

  return (
    <>
      <ViewerPane
        bol={bol}
        pageIndex={pageIndex}
        setPageIndex={setPageIndex}
        fullscreen={false}
        onToggleFullscreen={() => setFullscreen(true)}
      />
      {fullscreen && (
        <div className="cd-animate-fade fixed inset-0 z-[200] flex flex-col bg-[var(--cd-bg)] p-4">
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            aria-label="Close fullscreen"
            className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--cd-border-strong)] bg-[var(--cd-surface)] text-[var(--cd-text-muted)] shadow-[var(--cd-shadow)] transition-colors hover:bg-[var(--cd-surface-hover)] hover:text-[var(--cd-text)]"
          >
            <IconX width={16} height={16} />
          </button>
          <ViewerPane
            bol={bol}
            pageIndex={pageIndex}
            setPageIndex={setPageIndex}
            fullscreen={true}
            onToggleFullscreen={() => setFullscreen(false)}
          />
        </div>
      )}
    </>
  );
}

function MockField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[7.5px] font-bold uppercase tracking-wide text-[#8a8676]">{label}</p>
      <p className="truncate text-[10px] font-semibold text-[#1c1c1c]">{value || "—"}</p>
    </div>
  );
}
