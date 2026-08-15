"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PdfViewerPages } from "@/components/ui/DocViewer";

export type PreviewDoc = { name: string; url: string | null; isImage: boolean };

/**
 * Full-screen, view-only document viewer — the ONE way rate cons, BOLs and
 * PODs get viewed in tms-v2. Deliberately bare: the only control is the X.
 * Download/Delete/etc already live on the document row that opened this, so
 * duplicating them here would just be a second way to do the same thing.
 *
 * Zoom is a hand-rolled pinch/pan/wheel implementation (not native page
 * zoom) because the app runs with `userScalable: false` sitewide (see
 * src/app/layout.tsx) to stop iOS from auto-zooming into form fields — that
 * setting also blocks native pinch-zoom here, so this viewer has to do its
 * own gesture handling to get smooth in-place zoom.
 */
export function DocumentPreviewModal({ open, onClose, doc }: { open: boolean; onClose: () => void; doc: PreviewDoc | null }) {
  const isOpen = open && !!doc;
  const pushedHistory = useRef(false);

  // Esc and the mobile back gesture both close — routed through history.back()
  // so a real back-gesture (which fires `popstate`, not a key event) closes
  // the viewer instead of navigating the underlying page out from under it.
  const requestClose = useCallback(() => {
    if (pushedHistory.current) {
      pushedHistory.current = false;
      window.history.back();
    } else {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.history.pushState({ docViewer: true }, "");
    pushedHistory.current = true;

    function onPopState() {
      pushedHistory.current = false;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose();
    }
    window.addEventListener("popstate", onPopState);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestClose intentionally excluded: re-running this on every onClose identity change would push a duplicate history entry
  }, [isOpen, onClose]);

  if (!isOpen || !doc) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label={`View ${doc.name}`} className="fixed inset-0 z-[70] bg-black">
      {doc.url ? (
        <PinchZoomStage>
          {doc.isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={doc.url}
              alt={doc.name}
              draggable={false}
              className="block h-auto max-h-[100dvh] w-auto max-w-[100vw] select-none"
            />
          ) : (
            <div style={{ width: "min(100vw, 56rem)" }}>
              <PdfViewerPages url={doc.url} name={doc.name} />
            </div>
          )}
        </PinchZoomStage>
      ) : (
        <p className="flex h-full items-center justify-center p-8 text-center text-[13px] text-white/60">Preview unavailable.</p>
      )}

      <button
        type="button"
        onClick={requestClose}
        aria-label="Close"
        className="absolute z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
        style={{ top: "max(0.75rem, env(safe-area-inset-top))", right: "max(0.75rem, env(safe-area-inset-right))" }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

type Transform = { scale: number; x: number; y: number };
type Point = { x: number; y: number };

const ZOOM_MIN = 1;
const ZOOM_MAX = 6;
const DOUBLE_TAP_ZOOM = 2.5;
const TAP_MOVE_TOLERANCE = 10;
const TAP_MAX_DURATION = 300;
const DOUBLE_TAP_WINDOW = 350;
const DOUBLE_TAP_DISTANCE = 40;

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
function clampNum(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
function axisClamp(v: number, disp: number, box: number) {
  if (disp <= box) return (box - disp) / 2;
  return clampNum(v, box - disp, 0);
}

/**
 * Pinch-to-zoom / double-tap / pan / wheel-zoom wrapper around a single
 * child (an image, or the stacked PDF page column). Positions the child
 * with a CSS transform on an absolutely-positioned wrapper so gesture math
 * only has to reason about one number pair (x, y) plus scale — the browser
 * never gets a chance to fight it with its own scroll or zoom handling
 * (container is `touch-action: none`, wheel listener is non-passive).
 */
function PinchZoomStage({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const transformRef = useRef(transform);
  transformRef.current = transform;
  const userInteracted = useRef(false);

  const clamp = useCallback((next: Transform): Transform => {
    const scale = clampNum(next.scale, ZOOM_MIN, ZOOM_MAX);
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return { scale, x: next.x, y: next.y };
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const dispW = content.offsetWidth * scale;
    const dispH = content.offsetHeight * scale;
    return { scale, x: axisClamp(next.x, dispW, cw), y: axisClamp(next.y, dispH, ch) };
  }, []);

  // Recenters to fit whenever the content's rendered size changes (image
  // finishing load, PDF pages finishing render) — but only until the user
  // actually zooms/pans, so we don't yank their view mid-interaction.
  useEffect(() => {
    const content = contentRef.current;
    const container = containerRef.current;
    if (!content || !container) return;
    const recompute = () => {
      setTransform((prev) => (userInteracted.current ? clamp(prev) : clamp({ scale: 1, x: 0, y: 0 })));
    };
    const ro = new ResizeObserver(recompute);
    ro.observe(content);
    ro.observe(container);
    return () => ro.disconnect();
  }, [clamp]);

  // Non-passive wheel listener so preventDefault reliably stops page/pinch
  // scroll while still letting the gesture zoom in place under the cursor.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      userInteracted.current = true;
      const rect = el!.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const prev = transformRef.current;
      const factor = Math.exp(-e.deltaY * 0.01);
      const scale = clampNum(prev.scale * factor, ZOOM_MIN, ZOOM_MAX);
      const contentX = (localX - prev.x) / prev.scale;
      const contentY = (localY - prev.y) / prev.scale;
      setTransform(clamp({ scale, x: localX - contentX * scale, y: localY - contentY * scale }));
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [clamp]);

  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ dist: number } | null>(null);
  const pan = useRef<Point | null>(null);
  const gesture = useRef<{ start: Point; t: number; moved: boolean; pinched: boolean } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  const zoomAt = useCallback(
    (point: Point, targetScale: number) => {
      const rect = containerRef.current!.getBoundingClientRect();
      const localX = point.x - rect.left;
      const localY = point.y - rect.top;
      const prev = transformRef.current;
      const contentX = (localX - prev.x) / prev.scale;
      const contentY = (localY - prev.y) / prev.scale;
      setTransform(clamp({ scale: targetScale, x: localX - contentX * targetScale, y: localY - contentY * targetScale }));
    },
    [clamp],
  );

  function handleTap(point: Point) {
    const now = Date.now();
    const last = lastTap.current;
    if (last && now - last.t < DOUBLE_TAP_WINDOW && distance(last, point) < DOUBLE_TAP_DISTANCE) {
      lastTap.current = null;
      userInteracted.current = true;
      const isZoomedIn = transformRef.current.scale > 1.05;
      zoomAt(point, isZoomedIn ? 1 : DOUBLE_TAP_ZOOM);
    } else {
      lastTap.current = { t: now, x: point.x, y: point.y };
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    const point = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, point);
    if (pointers.current.size === 1) {
      pan.current = point;
      gesture.current = { start: point, t: Date.now(), moved: false, pinched: false };
    } else if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinch.current = { dist: distance(a, b) };
      pan.current = null;
      if (gesture.current) gesture.current.pinched = true;
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    const point = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, point);

    if (pointers.current.size === 2 && pinch.current) {
      userInteracted.current = true;
      const [a, b] = Array.from(pointers.current.values());
      const dist = distance(a, b);
      const mid = midpoint(a, b);
      const rect = containerRef.current!.getBoundingClientRect();
      const localX = mid.x - rect.left;
      const localY = mid.y - rect.top;
      const prev = transformRef.current;
      const scale = clampNum(prev.scale * (dist / pinch.current.dist), ZOOM_MIN, ZOOM_MAX);
      const contentX = (localX - prev.x) / prev.scale;
      const contentY = (localY - prev.y) / prev.scale;
      setTransform(clamp({ scale, x: localX - contentX * scale, y: localY - contentY * scale }));
      pinch.current = { dist };
    } else if (pointers.current.size === 1 && pan.current) {
      const dx = point.x - pan.current.x;
      const dy = point.y - pan.current.y;
      pan.current = point;
      if (gesture.current && distance(gesture.current.start, point) > TAP_MOVE_TOLERANCE) gesture.current.moved = true;
      const prev = transformRef.current;
      if (dx !== 0 || dy !== 0) {
        userInteracted.current = true;
        setTransform(clamp({ scale: prev.scale, x: prev.x + dx, y: prev.y + dy }));
      }
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const point = { x: e.clientX, y: e.clientY };
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 1) {
      const [remaining] = Array.from(pointers.current.values());
      pan.current = remaining;
      pinch.current = null;
    } else if (pointers.current.size === 0) {
      pan.current = null;
      pinch.current = null;
      const g = gesture.current;
      gesture.current = null;
      if (g && !g.pinched && !g.moved && Date.now() - g.t < TAP_MAX_DURATION) {
        handleTap(point);
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        ref={contentRef}
        className="absolute left-0 top-0 inline-block"
        style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`, transformOrigin: "0 0" }}
      >
        {children}
      </div>
    </div>
  );
}
