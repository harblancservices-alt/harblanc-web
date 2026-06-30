"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { jsPDF as JsPdfDoc } from "jspdf";
import { Button } from "@/components/ui/Button";
import {
  createLoadDocUploadUrl,
  recordLoadDocuments,
  type RecordDoc,
} from "./actions";
import { uploadFileToSignedUrl } from "@/lib/storage/client-upload";
import { detectCorners, extractPaper, type Corners, type Pt } from "@/lib/dispatch/scan";

/**
 * BOL document scanner — 100% in-browser (replaces Adobe). Snap the signed
 * bill of lading at the job site; the app detects the page, lets Brent nudge
 * the four corners, dewarps + crops to a flat rectangle, applies a crisp
 * black-and-white scan look (toggle for grayscale / color), assembles all
 * pages into ONE PDF, and uploads it to the load's BOL via the existing
 * direct-to-storage signed-upload path.
 *
 * No server-side image processing, no `sharp`/native libs, no external API.
 * The heavy bits (corner detection + perspective warp) run on OpenCV.js, which
 * is lazy-loaded only when the scanner opens so it never touches the initial
 * app bundle. The detection/dewarp functions are ported from jscanify (MIT)
 * into @/lib/dispatch/scan so we don't pull jscanify's native `canvas` dep.
 */

// OpenCV.js is fetched on demand (static asset, no API). Pinned version.
const OPENCV_URL = "https://docs.opencv.org/4.10.0/opencv.js";
const MAX_SRC_DIM = 1800; // cap captured-photo resolution for speed
type Mode = "bw" | "gray" | "color";
type Page = { color: HTMLCanvasElement };

// ── OpenCV.js lazy loader (module singleton) ─────────────────────────────────
let cvPromise: Promise<unknown> | null = null;
function loadOpenCv(): Promise<unknown> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Scanner needs a browser."));
  }
  if (cvPromise) return cvPromise;
  cvPromise = new Promise((resolve, reject) => {
    const w = window as unknown as { cv?: { Mat?: unknown; onRuntimeInitialized?: () => void } };
    const ready = () => !!(w.cv && w.cv.Mat);
    const settle = () => {
      if (ready()) return resolve(w.cv);
      if (w.cv) {
        w.cv.onRuntimeInitialized = () => resolve(w.cv);
      } else {
        reject(new Error("Scanner engine failed to initialize."));
      }
    };
    if (ready()) return resolve(w.cv);
    const existing = document.querySelector<HTMLScriptElement>("script[data-opencv]");
    if (existing) {
      existing.addEventListener("load", settle);
      existing.addEventListener("error", () =>
        reject(new Error("Could not load the scanner engine.")),
      );
      return;
    }
    const s = document.createElement("script");
    s.src = OPENCV_URL;
    s.async = true;
    s.dataset.opencv = "1";
    s.onload = settle;
    s.onerror = () =>
      reject(new Error("Could not load the scanner engine (offline?)."));
    document.body.appendChild(s);
  });
  return cvPromise;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getCv(): Promise<any> {
  return await loadOpenCv();
}

// ── Image helpers ────────────────────────────────────────────────────────────
function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_SRC_DIM / Math.max(img.width, img.height));
      const cw = Math.max(1, Math.round(img.width * scale));
      const ch = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      canvas.getContext("2d")!.drawImage(img, 0, 0, cw, ch);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that photo."));
    };
    img.src = url;
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderMode(cv: any, color: HTMLCanvasElement, mode: Mode): HTMLCanvasElement {
  if (mode === "color") return color;
  const src = cv.imread(color);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  let outMat = gray;
  if (mode === "bw") {
    outMat = new cv.Mat();
    // Adaptive (Gaussian) threshold = crisp scan look that survives uneven
    // job-site lighting. Block 25 / C 12 tuned for printed BOL text.
    cv.adaptiveThreshold(
      gray,
      outMat,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY,
      25,
      12,
    );
  }
  const out = document.createElement("canvas");
  cv.imshow(out, outMat);
  src.delete();
  if (outMat !== gray) gray.delete();
  outMat.delete();
  return out;
}

function quadSize(c: Corners): { w: number; h: number } {
  const d = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  const w = (d(c.topLeftCorner, c.topRightCorner) + d(c.bottomLeftCorner, c.bottomRightCorner)) / 2;
  const h = (d(c.topLeftCorner, c.bottomLeftCorner) + d(c.topRightCorner, c.bottomRightCorner)) / 2;
  return { w: Math.max(2, Math.round(w)), h: Math.max(2, Math.round(h)) };
}

// ── Component ────────────────────────────────────────────────────────────────
type Step = "capture" | "adjust" | "review";
const HANDLES: (keyof Corners)[] = [
  "topLeftCorner",
  "topRightCorner",
  "bottomRightCorner",
  "bottomLeftCorner",
];

export function BolScanner({
  loadId,
  onClose,
}: {
  loadId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);

  const [step, setStep] = useState<Step>("capture");
  const [pages, setPages] = useState<Page[]>([]);
  const [mode, setMode] = useState<Mode>("bw");
  const [engine, setEngine] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Adjust-step display geometry.
  const [dispW, setDispW] = useState(0);
  const [dispH, setDispH] = useState(0);
  const [scale, setScale] = useState(1);
  const [corners, setCorners] = useState<Pt[]>([]); // display-space, ordered TL,TR,BR,BL
  const dragging = useRef<number | null>(null);

  // Warm the engine the moment the scanner opens.
  useEffect(() => {
    let cancelled = false;
    getCv()
      .then(() => !cancelled && setEngine("ready"))
      .catch(() => !cancelled && setEngine("error"));
    return () => {
      cancelled = true;
    };
  }, []);

  // Lock background scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const onCapture = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setErr(null);
    setBusy(true);
    try {
      const src = await fileToCanvas(file);
      sourceRef.current = src;
      const cv = await getCv();
      setEngine("ready");
      const detected = detectCorners(cv, src);

      // Fit the source into the viewport for the adjust step.
      const maxW = Math.min(window.innerWidth - 48, 460);
      const maxH = window.innerHeight - 230;
      const s = Math.min(maxW / src.width, maxH / src.height, 1);
      const w = Math.round(src.width * s);
      const h = Math.round(src.height * s);
      setScale(s);
      setDispW(w);
      setDispH(h);
      setCorners(
        HANDLES.map((k) => ({ x: detected[k].x * s, y: detected[k].y * s })),
      );
      setStep("adjust");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start the scan.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, []);

  // Draw the captured source onto the display canvas whenever we enter adjust.
  useEffect(() => {
    if (step !== "adjust") return;
    const c = displayCanvasRef.current;
    const src = sourceRef.current;
    if (!c || !src || dispW === 0) return;
    c.width = dispW;
    c.height = dispH;
    c.getContext("2d")!.drawImage(src, 0, 0, dispW, dispH);
  }, [step, dispW, dispH]);

  function pointFromEvent(e: React.PointerEvent): Pt {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(dispW, e.clientX - rect.left));
    const y = Math.max(0, Math.min(dispH, e.clientY - rect.top));
    return { x, y };
  }
  function onHandleDown(i: number, e: React.PointerEvent) {
    e.preventDefault();
    dragging.current = i;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (dragging.current == null) return;
    const p = pointFromEvent(e);
    setCorners((prev) => prev.map((c, idx) => (idx === dragging.current ? p : c)));
  }
  function onPointerUp() {
    dragging.current = null;
  }

  // Map current display corners back to source space, dewarp + store the page.
  async function capturePage(): Promise<boolean> {
    const src = sourceRef.current;
    if (!src) return false;
    try {
      const cv = await getCv();
      const srcCorners: Corners = {
        topLeftCorner: { x: corners[0].x / scale, y: corners[0].y / scale },
        topRightCorner: { x: corners[1].x / scale, y: corners[1].y / scale },
        bottomRightCorner: { x: corners[2].x / scale, y: corners[2].y / scale },
        bottomLeftCorner: { x: corners[3].x / scale, y: corners[3].y / scale },
      };
      const { w, h } = quadSize(srcCorners);
      const color = extractPaper(cv, src, w, h, srcCorners);
      setPages((p) => [...p, { color }]);
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not process that page.");
      return false;
    }
  }

  async function onAddPage() {
    setBusy(true);
    const ok = await capturePage();
    setBusy(false);
    if (ok) {
      sourceRef.current = null;
      setStep("capture");
      // Re-open the camera for the next page.
      setTimeout(() => fileRef.current?.click(), 50);
    }
  }
  async function onDonePage() {
    setBusy(true);
    const ok = await capturePage();
    setBusy(false);
    if (ok) {
      sourceRef.current = null;
      setStep("review");
    }
  }

  async function onSave() {
    if (busy || pages.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const cv = await getCv();
      const { jsPDF } = await import("jspdf"); // lazy — keep it off initial load
      const fmtPng = mode === "bw";
      let pdf: JsPdfDoc | null = null;
      for (let i = 0; i < pages.length; i++) {
        const rendered = renderMode(cv, pages[i].color, mode);
        const w = rendered.width;
        const h = rendered.height;
        const orientation = w > h ? "landscape" : "portrait";
        const data = fmtPng
          ? rendered.toDataURL("image/png")
          : rendered.toDataURL("image/jpeg", 0.82);
        if (!pdf) {
          pdf = new jsPDF({ unit: "px", format: [w, h], orientation });
        } else {
          pdf.addPage([w, h], orientation);
        }
        pdf.addImage(data, fmtPng ? "PNG" : "JPEG", 0, 0, w, h);
      }
      if (!pdf) throw new Error("Nothing to save.");
      const blob = pdf.output("blob");
      const name = `BOL-scan-${pages.length}p-${Date.now()}.pdf`;
      const file = new File([blob], name, { type: "application/pdf" });

      // Existing direct-to-storage BOL upload path — unchanged.
      const urlRes = await createLoadDocUploadUrl(loadId, file.name, file.type, file.size);
      if (!urlRes.ok) throw new Error(urlRes.reason);
      const upRes = await uploadFileToSignedUrl(urlRes.bucket, urlRes.path, urlRes.token, file);
      if (!upRes.ok) throw new Error(upRes.reason);
      const doc: RecordDoc = {
        storagePath: urlRes.path,
        originalFilename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      };
      const recRes = await recordLoadDocuments(loadId, "bol", [doc]);
      if (!recRes.ok) throw new Error(recRes.reason);

      router.refresh();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the scan.");
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan bill of lading"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-3 sm:p-6"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="my-2 w-full max-w-md overflow-hidden rounded-md border border-line-strong bg-card shadow-2xl sm:my-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 bg-bar px-4 py-2.5">
          <span className="truncate font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-bar-fg">
            Scan BOL{pages.length > 0 ? ` · ${pages.length} page${pages.length === 1 ? "" : "s"}` : ""}
          </span>
          <Button type="button" variant="cancel" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>

        <div className="space-y-3 bg-elevated px-4 py-4">
          {engine === "error" ? (
            <p className="rounded-md border border-red-300 bg-red-50 px-2.5 py-2 text-[12px] font-semibold text-red-700">
              The scanner engine couldn&apos;t load. Check your connection and
              reopen — it needs to download once, then works on the job.
            </p>
          ) : null}

          {/* CAPTURE */}
          {step === "capture" ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <p className="text-[13px] text-fg-muted">
                {pages.length === 0
                  ? "Snap the signed bill of lading. Lay it flat with all four corners showing."
                  : "Snap the next page, or finish below."}
              </p>
              <Button
                type="button"
                variant="primary"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                fullWidth
              >
                {busy ? "Working…" : pages.length === 0 ? "Snap BOL page" : "Snap next page"}
              </Button>
              {pages.length > 0 ? (
                <Button type="button" variant="navigate" size="sm" onClick={() => setStep("review")}>
                  Review {pages.length} page{pages.length === 1 ? "" : "s"} →
                </Button>
              ) : null}
              {engine === "loading" ? (
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-subtle">
                  Preparing scanner…
                </p>
              ) : null}
            </div>
          ) : null}

          {/* ADJUST corners */}
          {step === "adjust" ? (
            <div className="space-y-3">
              <p className="text-center text-[12px] text-fg-muted">
                Drag the corners to the edges of the page.
              </p>
              <div
                className="relative mx-auto touch-none select-none"
                style={{ width: dispW, height: dispH }}
              >
                <canvas ref={displayCanvasRef} className="block rounded-sm" />
                <svg
                  ref={svgRef}
                  width={dispW}
                  height={dispH}
                  className="absolute inset-0 touch-none"
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerLeave={onPointerUp}
                >
                  {corners.length === 4 ? (
                    <polygon
                      points={corners.map((c) => `${c.x},${c.y}`).join(" ")}
                      fill="rgba(16,185,129,0.12)"
                      stroke="#10b981"
                      strokeWidth={2}
                    />
                  ) : null}
                  {corners.map((c, i) => (
                    <circle
                      key={i}
                      cx={c.x}
                      cy={c.y}
                      r={13}
                      fill="rgba(16,185,129,0.9)"
                      stroke="#fff"
                      strokeWidth={2.5}
                      style={{ cursor: "grab", touchAction: "none" }}
                      onPointerDown={(e) => onHandleDown(i, e)}
                    />
                  ))}
                </svg>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant="cancel"
                  size="sm"
                  onClick={() => {
                    sourceRef.current = null;
                    setStep("capture");
                    setTimeout(() => fileRef.current?.click(), 50);
                  }}
                  disabled={busy}
                >
                  Retake
                </Button>
                <Button type="button" variant="navigate" size="sm" onClick={onAddPage} disabled={busy}>
                  + Add page
                </Button>
                <Button type="button" variant="primary" size="sm" onClick={onDonePage} disabled={busy}>
                  {busy ? "…" : "Done"}
                </Button>
              </div>
            </div>
          ) : null}

          {/* REVIEW + mode toggle */}
          {step === "review" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-1 rounded-md border border-line-strong bg-card p-1">
                {(["bw", "gray", "color"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={
                      "flex-1 rounded px-2 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] transition-colors " +
                      (mode === m
                        ? "bg-fg text-canvas"
                        : "text-fg-muted hover:bg-elevated")
                    }
                  >
                    {m === "bw" ? "B&W" : m === "gray" ? "Gray" : "Color"}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {pages.map((p, i) => (
                  <PagePreview key={i} page={p} mode={mode} />
                ))}
              </div>

              <Button
                type="button"
                variant="navigate"
                size="sm"
                onClick={() => {
                  sourceRef.current = null;
                  setStep("capture");
                  setTimeout(() => fileRef.current?.click(), 50);
                }}
                disabled={busy}
              >
                + Add another page
              </Button>
            </div>
          ) : null}

          {err ? (
            <p role="alert" className="text-[12px] font-semibold text-red-700">
              {err}
            </p>
          ) : null}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void onCapture(e.target.files?.[0])}
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line bg-elevated px-4 py-3">
          <Button type="button" variant="cancel" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={onSave}
            disabled={busy || pages.length === 0 || step !== "review"}
            aria-busy={busy}
          >
            {busy ? "Saving…" : `Save BOL${pages.length ? ` · ${pages.length}p` : ""}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Renders one stored (color) page in the chosen mode for the review grid.
function PagePreview({ page, mode }: { page: Page; mode: Mode }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    getCv()
      .then((cv) => {
        if (cancelled) return;
        const rendered = renderMode(cv, page.color, mode);
        const c = ref.current;
        if (!c) return;
        c.width = rendered.width;
        c.height = rendered.height;
        c.getContext("2d")!.drawImage(rendered, 0, 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [page, mode]);
  return (
    <canvas
      ref={ref}
      className="h-auto w-full rounded-sm border border-line bg-white"
    />
  );
}
