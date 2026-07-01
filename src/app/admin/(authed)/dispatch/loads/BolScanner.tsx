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

// OpenCV is self-hosted (same-origin /public) and lazy-loaded only when the
// scanner opens — never in the initial bundle.
//
// We use the SPLIT build (a 404 KB JS glue + a separate 6.6 MB binary
// opencv.wasm) instead of the old single-file build that embedded the wasm as
// ~10 MB of base64. The embedded build hung on iOS Safari: it had to parse a
// 10 MB JS string and base64-decode ~7.7 MB into a buffer before a non-
// streaming compile, which on a phone's tight memory budget could stall or be
// killed silently. The split build parses a tiny glue, and we hand it the raw
// wasm bytes (Module.wasmBinary) so it compiles them directly via the async
// WebAssembly path — far lighter on mobile Safari.
//
// We fetch the wasm with a streaming reader (real progress bar) and persist
// both files in the Cache API (not just the HTTP cache, whose Cache-Control:
// max-age=0, must-revalidate would re-validate every session and never work
// offline). First open shows download progress; every open after is instant
// from cache, including with no signal.
const WASM_URL = "/vendor/opencv.wasm";
const GLUE_URL = "/vendor/opencv-core.js";
// Cache-API store + version tag, bumped when the vendored engine changes.
const SCANNER_CACHE = "harblanc-scanner-v2";
// Bump to force a fresh cache key — evicts any poisoned/partial entry written
// by the earlier build that cached downloads without validating them.
const SCANNER_VERSION = "ocvwasm-4.3.0-r2";
const WASM_BYTES = 6_955_332; // raw (decompressed) size — the progress total
const GLUE_BYTES = 404_490; // patched glue size — validated to reject bad fetches
const INIT_TIMEOUT_MS = 60_000; // hard cap so wasm compile never spins forever
const ENGINE_TIMEOUT_MS = 80_000; // overall cap (download + init) for the warm-up
const CAPTURE_ENGINE_WAIT_MS = 25_000; // after a snap, how long to wait for the
// engine before falling back to a straight photo (it's usually already warm)
const MAX_SRC_DIM = 1800; // cap captured-photo resolution for speed
type Mode = "bw" | "gray" | "color";
// A captured page. `source` is the raw straight photo (always present, never
// needs OpenCV). `cropped` is the OpenCV perspective-dewarped version, or null
// when the engine wasn't available — in which case we save the straight photo.
type Page = { source: HTMLCanvasElement; cropped: HTMLCanvasElement | null };
export type CvProgress = {
  phase: "download" | "init" | "done";
  received: number;
  total: number;
};

// Validate a downloaded/cached asset: exact byte count, and (for the wasm) the
// "\0asm" magic header. A truncated download or a 200-with-error-HTML fails
// here so it's never used OR cached — a poisoned cache entry would otherwise
// make the engine fail forever until manually cleared.
async function isValidAsset(
  blob: Blob,
  expectedBytes: number,
  checkWasmMagic: boolean,
): Promise<boolean> {
  if (blob.size !== expectedBytes) return false;
  if (checkWasmMagic) {
    const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    if (head[0] !== 0x00 || head[1] !== 0x61 || head[2] !== 0x73 || head[3] !== 0x6d) {
      return false;
    }
  }
  return true;
}

// Fetch a vendored asset — Cache API first (cross-session + offline), else a
// streaming network fetch (driving the progress bar via onChunk). Only a FULLY
// downloaded, validated asset is returned or cached; a bad cache hit is evicted.
async function fetchCachedBlob(
  key: string,
  expectedBytes: number,
  checkWasmMagic: boolean,
  onChunk?: (received: number) => void,
): Promise<{ blob: Blob; cached: boolean }> {
  try {
    if ("caches" in window) {
      const cache = await caches.open(SCANNER_CACHE);
      const hit = await cache.match(key);
      if (hit) {
        const blob = await hit.blob();
        if (await isValidAsset(blob, expectedBytes, checkWasmMagic)) {
          return { blob, cached: true };
        }
        await cache.delete(key); // poisoned/partial — evict and re-fetch
      }
    }
  } catch {
    /* Cache API unavailable — fall through to the network. */
  }

  const res = await fetch(key);
  if (!res.ok || !res.body) {
    throw new Error("Could not download the scanner engine.");
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      onChunk?.(received);
    }
  }
  const blob = new Blob(chunks as BlobPart[]);
  if (!(await isValidAsset(blob, expectedBytes, checkWasmMagic))) {
    throw new Error("Scanner engine download was incomplete.");
  }
  try {
    if ("caches" in window) {
      const cache = await caches.open(SCANNER_CACHE);
      await cache.put(key, new Response(blob)); // only cached after validation
    }
  } catch {
    /* best-effort cache; ignore quota/availability errors. */
  }
  return { blob, cached: false };
}

// Instantiate cv from the glue + pre-fetched wasm bytes. We DON'T poll for
// cv.Mat — we hand Emscripten our Module with the real onRuntimeInitialized
// (fires exactly when the runtime is ready) and onAbort (surfaces a genuine
// failure), plus a hard timeout so a stalled/killed init reports an error
// instead of spinning on "Initializing…" forever.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function instantiateOpenCv(wasmBinary: ArrayBuffer, glueText: string): Promise<any> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (w.cv && w.cv.Mat) return resolve(w.cv);

    let settled = false;
    let blobUrl = "";
    const timer = window.setTimeout(
      () =>
        finish(
          null,
          "Scanner engine timed out while initializing. Reopen on Wi-Fi and try again.",
        ),
      INIT_TIMEOUT_MS,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function finish(cv: any, errMsg?: string) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      if (cv) resolve(cv);
      else reject(new Error(errMsg || "Scanner engine failed to start."));
    }

    // Our vendored glue reads its Emscripten Module from globalThis.__ocvModule
    // (a one-line patch to the upstream file). Providing wasmBinary makes it
    // compile our already-downloaded bytes and skip any wasm fetch.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any;
    g.__ocvModule = {
      wasmBinary,
      // Belt-and-suspenders: if it ever does fetch, hit the vendored file.
      locateFile: (path: string) => (path.endsWith(".wasm") ? WASM_URL : path),
      onRuntimeInitialized: () => {
        const cv = w.cv;
        if (cv && cv.Mat) finish(cv);
        else finish(null, "Scanner engine started without an image core.");
      },
      onAbort: (reason: unknown) =>
        finish(
          null,
          `Scanner engine failed to start${reason ? ` (${String(reason)})` : ""}.`,
        ),
      print: () => {},
      printErr: () => {},
    };

    blobUrl = URL.createObjectURL(new Blob([glueText], { type: "text/javascript" }));
    const s = document.createElement("script");
    s.src = blobUrl;
    s.async = true;
    s.dataset.opencv = "1";
    s.onerror = () => finish(null, "Could not initialize the scanner engine.");
    document.body.appendChild(s);
  });
}

// ── OpenCV lazy loader (module singleton) ────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cvPromise: Promise<any> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadOpenCv(onProgress?: (p: CvProgress) => void): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Scanner needs a browser."));
  }
  if (cvPromise) return cvPromise;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  const p = (async () => {
    if (w.cv && w.cv.Mat) return w.cv;

    // Drop the old single-file build's cache entry (frees ~10 MB) once.
    try {
      if ("caches" in window) await caches.delete("harblanc-scanner");
    } catch {
      /* ignore */
    }

    // 1. The binary wasm — the big download → drives the progress bar.
    //    Validated against its exact size + "\0asm" magic before use/cache.
    const wasmKey = `${WASM_URL}?v=${SCANNER_VERSION}`;
    const { blob: wasmBlob, cached } = await fetchCachedBlob(
      wasmKey,
      WASM_BYTES,
      true,
      (received) =>
        onProgress?.({
          phase: "download",
          received: Math.min(received, WASM_BYTES),
          total: WASM_BYTES,
        }),
    );
    onProgress?.({ phase: cached ? "init" : "download", received: WASM_BYTES, total: WASM_BYTES });
    const wasmBinary = await wasmBlob.arrayBuffer();

    // 2. The small JS glue — fetch (cached) as text, validated by exact size.
    onProgress?.({ phase: "init", received: WASM_BYTES, total: WASM_BYTES });
    const glueKey = `${GLUE_URL}?v=${SCANNER_VERSION}`;
    const { blob: glueBlob } = await fetchCachedBlob(glueKey, GLUE_BYTES, false);
    const glueText = await glueBlob.text();

    // 3. Compile + initialize from our bytes.
    const cv = await instantiateOpenCv(wasmBinary, glueText);
    onProgress?.({ phase: "done", received: WASM_BYTES, total: WASM_BYTES });
    return cv;
  })();
  // On failure clear the cache so reopening retries from scratch.
  p.catch(() => {
    cvPromise = null;
  });
  cvPromise = p;
  return p;
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

// No-OpenCV fallback renderer (plain 2D canvas). "color" returns the photo as-
// is; "gray" desaturates; "bw" desaturates then contrast-stretches (2nd/98th
// percentile) for a clean, scan-like high-contrast look that survives uneven
// job-site lighting without the blotching a hard global threshold would cause.
function renderModePlain(src: HTMLCanvasElement, mode: Mode): HTMLCanvasElement {
  if (mode === "color") return src;
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const n = c.width * c.height;
  const lum = new Uint8ClampedArray(n);
  const hist = new Uint32Array(256);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    lum[j] = g;
    hist[g]++;
  }
  let lo = 0;
  let hi = 255;
  if (mode === "bw") {
    const cut = n * 0.02;
    let acc = 0;
    for (lo = 0; lo < 255; lo++) {
      acc += hist[lo];
      if (acc >= cut) break;
    }
    acc = 0;
    for (hi = 255; hi > 0; hi--) {
      acc += hist[hi];
      if (acc >= cut) break;
    }
  }
  const range = Math.max(1, hi - lo);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    let v = lum[j];
    if (mode === "bw") v = ((v - lo) / range) * 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Render a page in the chosen mode — OpenCV (crisp adaptive B&W) when the
// engine is ready, else the plain-canvas fallback. Uses cropped if we have it,
// otherwise the straight photo. Never throws; never requires the engine.
function renderPageCanvas(page: Page, mode: Mode): HTMLCanvasElement {
  const base = page.cropped ?? page.source;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cv = (window as any).cv;
  if (cv && cv.Mat) {
    try {
      return renderMode(cv, base, mode);
    } catch {
      /* fall back to plain rendering on any OpenCV error */
    }
  }
  return renderModePlain(base, mode);
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
  // Engine = an OPTIONAL enhancement (auto-crop/clean). Capture + PDF + upload
  // never depend on it; "error"/"loading" just means we save the straight photo.
  const [engine, setEngine] = useState<"loading" | "ready" | "error">("loading");
  // The one busy flag — mutually exclusive states so the UI can never show two
  // contradictory labels (e.g. "Working…" and "Saving…") at once.
  const [status, setStatus] = useState<"idle" | "processing" | "saving">("idle");
  const [err, setErr] = useState<string | null>(null);

  // Adjust-step display geometry.
  const [dispW, setDispW] = useState(0);
  const [dispH, setDispH] = useState(0);
  const [scale, setScale] = useState(1);
  const [corners, setCorners] = useState<Pt[]>([]); // display-space, ordered TL,TR,BR,BL
  const dragging = useRef<number | null>(null);

  // Warm the OPTIONAL engine in the background the moment the scanner opens.
  // It never blocks capture; if it hangs past the timeout or fails, we mark it
  // "error" and silently fall back to straight-photo saves.
  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (!cancelled) setEngine((e) => (e === "loading" ? "error" : e));
    }, ENGINE_TIMEOUT_MS);
    loadOpenCv()
      .then(() => {
        if (!cancelled) setEngine("ready");
      })
      .catch(() => {
        if (!cancelled) setEngine("error");
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
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
    setStatus("processing");
    try {
      const src = await fileToCanvas(file);
      // Give the engine a bounded chance to be ready so the corner-adjust step
      // reliably appears — do NOT gate on a stale "ready" snapshot (the engine
      // is often still finishing its background load at snap time). Only fall
      // back to a straight photo if the engine genuinely isn't available.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cv: any = await Promise.race([
        getCv().catch(() => null),
        new Promise<null>((res) =>
          window.setTimeout(() => res(null), CAPTURE_ENGINE_WAIT_MS),
        ),
      ]);
      if (cv && cv.Mat) {
        const detected = detectCorners(cv, src);
        const maxW = Math.min(window.innerWidth - 48, 460);
        const maxH = window.innerHeight - 230;
        const s = Math.min(maxW / src.width, maxH / src.height, 1);
        sourceRef.current = src;
        setScale(s);
        setDispW(Math.round(src.width * s));
        setDispH(Math.round(src.height * s));
        setCorners(
          HANDLES.map((k) => ({ x: detected[k].x * s, y: detected[k].y * s })),
        );
        setStep("adjust");
        return;
      }
      // Engine unavailable — keep the straight photo (no dewarp) and go to
      // review so the BOL is still captured and saveable.
      sourceRef.current = null;
      setPages((p) => [...p, { source: src, cropped: null }]);
      setStep("review");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not read that photo.");
    } finally {
      setStatus("idle");
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

  // Map display corners back to source space, dewarp + store the page. If the
  // dewarp fails we keep the straight photo rather than losing the page.
  async function commitAdjusted(): Promise<boolean> {
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
      const cropped = extractPaper(cv, src, w, h, srcCorners);
      setPages((p) => [...p, { source: src, cropped }]);
      return true;
    } catch {
      setPages((p) => [...p, { source: src, cropped: null }]);
      return true;
    }
  }

  async function onAddPage() {
    setStatus("processing");
    const ok = await commitAdjusted();
    setStatus("idle");
    if (ok) {
      sourceRef.current = null;
      setStep("capture");
      // Re-open the camera for the next page.
      setTimeout(() => fileRef.current?.click(), 50);
    }
  }
  async function onDonePage() {
    setStatus("processing");
    const ok = await commitAdjusted();
    setStatus("idle");
    if (ok) {
      sourceRef.current = null;
      setStep("review");
    }
  }

  async function onSave() {
    if (status !== "idle" || pages.length === 0) return;
    setStatus("saving");
    setErr(null);
    try {
      const { jsPDF } = await import("jspdf"); // lazy — keep it off initial load
      const fmtPng = mode === "bw";
      let pdf: JsPdfDoc | null = null;
      for (let i = 0; i < pages.length; i++) {
        // OpenCV clean when the engine is up, plain-canvas clean otherwise.
        const rendered = renderPageCanvas(pages[i], mode);
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
      setStatus("idle"); // reset cleanly so the buttons recover
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan bill of lading"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-3 sm:p-6"
      onClick={() => {
        if (status === "idle") onClose();
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
          {/* Cancel always closes — never disabled. */}
          <Button type="button" variant="cancel" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>

        <div className="space-y-3 bg-elevated px-4 py-4">
          {/* Engine is optional — a soft, non-blocking note (never a red error). */}
          {engine !== "ready" && step === "capture" ? (
            <p className="rounded-md border border-line bg-card px-2.5 py-1.5 text-center text-[11px] text-fg-muted">
              {engine === "loading"
                ? "Setting up auto-crop… you can snap now."
                : "Auto-crop unavailable — BOL will save as a straight photo."}
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
                disabled={status !== "idle"}
                fullWidth
              >
                {status === "processing"
                  ? "Working…"
                  : pages.length === 0
                    ? "Snap BOL page"
                    : "Snap next page"}
              </Button>
              {pages.length > 0 ? (
                <Button type="button" variant="navigate" size="sm" onClick={() => setStep("review")}>
                  Review {pages.length} page{pages.length === 1 ? "" : "s"} →
                </Button>
              ) : null}
            </div>
          ) : null}

          {/* ADJUST corners — always shown before dewarp when the engine is up */}
          {step === "adjust" ? (
            <div className="space-y-3">
              <p className="text-center text-[12px] text-fg-muted">
                Drag the four corners to the edges of the BOL, then Crop &amp;
                clean.
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
                  onPointerCancel={onPointerUp}
                >
                  {corners.length === 4 ? (
                    <polygon
                      points={corners.map((c) => `${c.x},${c.y}`).join(" ")}
                      fill="rgba(16,185,129,0.14)"
                      stroke="#10b981"
                      strokeWidth={2}
                    />
                  ) : null}
                  {corners.map((c, i) => (
                    <g key={i} onPointerDown={(e) => onHandleDown(i, e)}>
                      {/* Big invisible touch target for fat-finger dragging */}
                      <circle
                        cx={c.x}
                        cy={c.y}
                        r={30}
                        fill="transparent"
                        style={{ cursor: "grab", touchAction: "none" }}
                      />
                      {/* Visible handle */}
                      <circle
                        cx={c.x}
                        cy={c.y}
                        r={12}
                        fill="rgba(16,185,129,0.95)"
                        stroke="#fff"
                        strokeWidth={3}
                        style={{ pointerEvents: "none" }}
                      />
                    </g>
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
                  disabled={status !== "idle"}
                >
                  Retake
                </Button>
                <Button type="button" variant="navigate" size="sm" onClick={onAddPage} disabled={status !== "idle"}>
                  + Add page
                </Button>
                <Button type="button" variant="primary" size="sm" onClick={onDonePage} disabled={status !== "idle"}>
                  {status === "processing" ? "…" : "Crop & clean"}
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
                disabled={status !== "idle"}
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
          {/* Cancel always closes — never disabled. */}
          <Button type="button" variant="cancel" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={onSave}
            disabled={status !== "idle" || pages.length === 0 || step !== "review"}
            aria-busy={status === "saving"}
          >
            {status === "saving" ? "Saving…" : `Save BOL${pages.length ? ` · ${pages.length}p` : ""}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Renders one stored page in the chosen mode for the review grid — OpenCV
// clean when the engine is up, plain-canvas clean otherwise. Never throws.
function PagePreview({ page, mode }: { page: Page; mode: Mode }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const rendered = renderPageCanvas(page, mode);
    const c = ref.current;
    if (!c) return;
    c.width = rendered.width;
    c.height = rendered.height;
    c.getContext("2d")!.drawImage(rendered, 0, 0);
  }, [page, mode]);
  return (
    <canvas
      ref={ref}
      className="h-auto w-full rounded-sm border border-line bg-white"
    />
  );
}
