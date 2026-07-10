"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PDFPageProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/Button";
import {
  createLoadDocUploadUrl,
  recordLoadDocuments,
  type RecordDoc,
} from "../actions";
import { uploadFileToSignedUrl } from "@/lib/storage/client-upload";
import { loadPdfjs } from "@/lib/pdf/pdfjs";
import {
  signExistingPdf,
  signImageAsPdf,
  type SignaturePlacement,
} from "@/lib/pdf/signDoc";
import type { LoadDoc } from "./DocumentsCard";

/**
 * BOL finger-signature flow — "hand the phone to the receiver, they sign".
 *
 * 1. Render the BOL page(s) to screen (pdf.js for PDFs; a canvas for images).
 * 2. Brent (or the receiver) taps WHERE the signature goes — a marker drops.
 * 3. A full-screen finger-drawing pad opens (pointer events, no page scroll).
 * 4. On Done we composite the signature PNG onto the tapped page with pdf-lib,
 *    mapping the tap to PDF user-space via pdf.js's own convertToPdfPoint
 *    (rotation- and offset-safe), and save it as a NEW "<name> — signed.pdf"
 *    BOL attachment via the existing signed-upload path. The original is kept.
 *
 * Nothing here touches the stored original — the signed copy is a separate row.
 */

const SIG_WIDTH_FRAC = 0.34; // signature width as a fraction of the page width
const IMG_MAX_DIM = 2400; // cap image-BOL resolution so the signed PDF stays small

type Step = "loading" | "place" | "sign" | "saving";
type RenderedPage = {
  pageIndex: number;
  dataUrl: string;
  dispW: number;
  dispH: number;
};
type Placement = { pageIndex: number; fx: number; fy: number };
type ImageSource = { jpg: Uint8Array; w: number; h: number; dataUrl: string };

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function isPdfDoc(doc: LoadDoc): boolean {
  return (doc.mime ?? "").includes("pdf") || /\.pdf$/i.test(doc.name);
}

function baseName(name: string): string {
  return name.replace(/\.(pdf|jpe?g|png|webp|heic)$/i, "").trim() || "BOL";
}

function todayLabel(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read the BOL image."));
    img.src = src;
  });
}

export function BolSigner({
  loadId,
  doc,
  onClose,
}: {
  loadId: string;
  doc: LoadDoc;
  onClose: () => void;
}) {
  const router = useRouter();
  const isPdf = isPdfDoc(doc);

  const bytesRef = useRef<Uint8Array | null>(null); // original PDF bytes (pdf-lib)
  const pageProxiesRef = useRef<PDFPageProxy[]>([]); // pdf.js pages (coord mapping)

  const [step, setStep] = useState<Step>("loading");
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [imgSrc, setImgSrc] = useState<ImageSource | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [printName, setPrintName] = useState("");
  const [dateStr, setDateStr] = useState(todayLabel);
  const [err, setErr] = useState<string | null>(null);

  // Lock background scroll while the signer is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Load + render the BOL once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!doc.url) throw new Error("This BOL has no viewable file.");
        const resp = await fetch(doc.url);
        if (!resp.ok) throw new Error(`Could not load the BOL (${resp.status}).`);
        const buf = new Uint8Array(await resp.arrayBuffer());

        if (isPdf) {
          bytesRef.current = buf;
          const pdfjs = await loadPdfjs();
          // pdf.js may transfer (detach) the buffer to its worker — give it a
          // copy so bytesRef stays intact for pdf-lib compositing.
          const pdfDoc = await pdfjs.getDocument({ data: buf.slice() }).promise;
          const targetW = Math.min((window.innerWidth || 400) - 16, 700);
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const rendered: RenderedPage[] = [];
          for (let i = 1; i <= pdfDoc.numPages; i++) {
            const p = await pdfDoc.getPage(i);
            pageProxiesRef.current[i - 1] = p;
            const base = p.getViewport({ scale: 1 });
            const scale = targetW / base.width;
            const vp = p.getViewport({ scale: scale * dpr });
            const canvas = document.createElement("canvas");
            canvas.width = Math.ceil(vp.width);
            canvas.height = Math.ceil(vp.height);
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Canvas unavailable.");
            await p.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
            rendered.push({
              pageIndex: i - 1,
              dataUrl: canvas.toDataURL("image/png"),
              dispW: vp.width / dpr,
              dispH: vp.height / dpr,
            });
          }
          if (cancelled) return;
          setPages(rendered);
        } else {
          const img = await loadImage(doc.url);
          const scale = Math.min(
            1,
            IMG_MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight),
          );
          const w = Math.max(1, Math.round(img.naturalWidth * scale));
          const h = Math.max(1, Math.round(img.naturalHeight * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas unavailable.");
          ctx.drawImage(img, 0, 0, w, h);
          const blob = await new Promise<Blob | null>((r) =>
            canvas.toBlob(r, "image/jpeg", 0.85),
          );
          if (!blob) throw new Error("Could not read the BOL image.");
          const source: ImageSource = {
            jpg: new Uint8Array(await blob.arrayBuffer()),
            w,
            h,
            dataUrl: canvas.toDataURL("image/jpeg", 0.85),
          };
          if (cancelled) return;
          setImgSrc(source);
        }
        setStep("place");
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Could not open the BOL.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onTapPage(pageIndex: number, e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setPlacement({
      pageIndex,
      fx: clamp01((e.clientX - rect.left) / rect.width),
      fy: clamp01((e.clientY - rect.top) / rect.height),
    });
  }

  async function uploadSigned(bytes: Uint8Array): Promise<void> {
    const fileName = `${baseName(doc.name)} — signed.pdf`;
    // Copy into a fresh ArrayBuffer-backed view so it's a valid BlobPart under
    // the strict DOM lib (pdf-lib returns Uint8Array<ArrayBufferLike>).
    const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
    const file = new File([blob], fileName, { type: "application/pdf" });
    const urlRes = await createLoadDocUploadUrl(
      loadId,
      file.name,
      file.type,
      file.size,
    );
    if (!urlRes.ok) throw new Error(urlRes.reason);
    const up = await uploadFileToSignedUrl(
      urlRes.bucket,
      urlRes.path,
      urlRes.token,
      file,
    );
    if (!up.ok) throw new Error(up.reason);
    const rec: RecordDoc = {
      storagePath: urlRes.path,
      originalFilename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    };
    const r = await recordLoadDocuments(loadId, "bol", [rec]);
    if (!r.ok) throw new Error(r.reason);
  }

  const handleSignatureDone = useCallback(
    async (sig: { png: Uint8Array; w: number; h: number }, name: string, date: string) => {
      if (!placement) return;
      setStep("saving");
      setErr(null);
      try {
        const aspect = sig.h / sig.w;
        const content = {
          pngBytes: sig.png,
          aspect,
          printName: name,
          dateStr: date,
        };
        let out: Uint8Array;
        if (isPdf) {
          const p = pageProxiesRef.current[placement.pageIndex];
          const vp1 = p.getViewport({ scale: 1 });
          const [cx, cy] = vp1.convertToPdfPoint(
            placement.fx * vp1.width,
            placement.fy * vp1.height,
          ) as [number, number];
          const place: SignaturePlacement = {
            cx,
            cy,
            rotationDeg: p.rotate,
            widthPts: SIG_WIDTH_FRAC * vp1.width,
          };
          out = await signExistingPdf(
            bytesRef.current!,
            placement.pageIndex,
            place,
            content,
          );
        } else {
          const im = imgSrc!;
          const place: SignaturePlacement = {
            cx: placement.fx * im.w,
            cy: im.h - placement.fy * im.h, // top-left tap → bottom-left origin
            rotationDeg: 0,
            widthPts: SIG_WIDTH_FRAC * im.w,
          };
          out = await signImageAsPdf(im.jpg, im.w, im.h, place, content);
        }
        await uploadSigned(out);
        router.refresh();
        onClose();
      } catch (e) {
        setErr(
          e instanceof Error ? e.message : "Could not save the signed BOL.",
        );
        setStep("place");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placement, isPdf, imgSrc],
  );

  // ── Full-screen signature pad ──────────────────────────────────────────────
  if (step === "sign" && placement) {
    return (
      <SignaturePad
        printName={printName}
        setPrintName={setPrintName}
        dateStr={dateStr}
        setDateStr={setDateStr}
        onCancel={() => setStep("place")}
        onDone={handleSignatureDone}
      />
    );
  }

  // ── Placement / loading / saving ───────────────────────────────────────────
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sign bill of lading"
      className="fixed inset-0 z-50 flex flex-col bg-black/85"
    >
      <div className="flex items-center justify-between gap-3 bg-bar px-4 py-2.5">
        <span className="truncate font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-bar-fg">
          Sign BOL
        </span>
        <Button
          type="button"
          variant="cancel"
          size="sm"
          onClick={onClose}
          disabled={step === "saving"}
        >
          Cancel
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {step === "loading" ? (
          <p className="mt-10 text-center text-[13px] font-semibold text-white/80">
            Opening BOL…
          </p>
        ) : step === "saving" ? (
          <p className="mt-10 text-center text-[13px] font-semibold text-white/80">
            Saving signed BOL…
          </p>
        ) : (
          <>
            <p className="mb-3 text-center text-[13px] font-semibold text-white">
              Tap where the signature should go.
            </p>
            <div className="mx-auto flex max-w-[720px] flex-col items-center gap-3">
              {isPdf
                ? pages.map((pg) => (
                    <PagePlacement
                      key={pg.pageIndex}
                      page={pg}
                      marker={
                        placement?.pageIndex === pg.pageIndex ? placement : null
                      }
                      onTap={onTapPage}
                    />
                  ))
                : imgSrc
                  ? (
                      <ImagePlacement
                        src={imgSrc.dataUrl}
                        marker={placement?.pageIndex === 0 ? placement : null}
                        onTap={onTapPage}
                      />
                    )
                  : null}
            </div>
          </>
        )}

        {err ? (
          <p
            role="alert"
            className="mx-auto mt-4 max-w-md rounded-md bg-red-950/80 px-3 py-2 text-center text-[12px] font-semibold text-red-200"
          >
            {err}
          </p>
        ) : null}
      </div>

      {step === "place" ? (
        <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-bar px-4 py-3">
          <span className="text-[12px] text-bar-fg/70">
            {placement ? "Marker placed" : "No spot chosen yet"}
          </span>
          <Button
            type="button"
            variant="primary"
            onClick={() => setStep("sign")}
            disabled={!placement}
          >
            Sign here →
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Marker({ marker }: { marker: Placement }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${marker.fx * 100}%`, top: `${marker.fy * 100}%` }}
    >
      <span className="block h-7 w-7 rounded-full border-[3px] border-accent bg-accent/25 shadow-[0_0_0_2px_rgba(0,0,0,0.5)]" />
    </span>
  );
}

function PagePlacement({
  page,
  marker,
  onTap,
}: {
  page: RenderedPage;
  marker: Placement | null;
  onTap: (pageIndex: number, e: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className="relative w-full max-w-full touch-manipulation select-none"
      style={{ width: page.dispW, maxWidth: "100%" }}
      onPointerDown={(e) => onTap(page.pageIndex, e)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={page.dataUrl}
        alt={`BOL page ${page.pageIndex + 1}`}
        className="block w-full rounded-sm bg-white"
        draggable={false}
      />
      {marker ? <Marker marker={marker} /> : null}
    </div>
  );
}

function ImagePlacement({
  src,
  marker,
  onTap,
}: {
  src: string;
  marker: Placement | null;
  onTap: (pageIndex: number, e: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className="relative w-full touch-manipulation select-none"
      onPointerDown={(e) => onTap(0, e)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="BOL"
        className="block w-full rounded-sm bg-white"
        draggable={false}
      />
      {marker ? <Marker marker={marker} /> : null}
    </div>
  );
}

// ── Signature pad ────────────────────────────────────────────────────────────
function SignaturePad({
  printName,
  setPrintName,
  dateStr,
  setDateStr,
  onCancel,
  onDone,
}: {
  printName: string;
  setPrintName: (v: string) => void;
  dateStr: string;
  setDateStr: (v: string) => void;
  onCancel: () => void;
  onDone: (
    sig: { png: Uint8Array; w: number; h: number },
    name: string,
    date: string,
  ) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);

  // Size the canvas to its box (× dpr) and configure the pen once.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    c.width = Math.max(1, Math.round(rect.width * dpr));
    c.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  }, []);

  // Belt-and-braces: block iOS Safari scroll/zoom gestures on the pad.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const prevent = (e: TouchEvent) => e.preventDefault();
    c.addEventListener("touchstart", prevent, { passive: false });
    c.addEventListener("touchmove", prevent, { passive: false });
    return () => {
      c.removeEventListener("touchstart", prevent);
      c.removeEventListener("touchmove", prevent);
    };
  }, []);

  function posOf(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    drawing.current = true;
    last.current = posOf(e);
    canvasRef.current?.setPointerCapture(e.pointerId);
    // A tap alone should leave a dot.
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx && last.current) {
      ctx.beginPath();
      ctx.arc(last.current.x, last.current.y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = "#111827";
      ctx.fill();
    }
    if (!hasInk) setHasInk(true);
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    e.preventDefault();
    const p = posOf(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  }
  function onUp() {
    drawing.current = false;
    last.current = null;
  }

  function clear() {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
    setHasInk(false);
  }

  async function done() {
    const c = canvasRef.current;
    if (!c || !hasInk || busy) return;
    setBusy(true);
    const sig = await extractSignaturePng(c);
    if (!sig) {
      setBusy(false);
      return;
    }
    onDone(sig, printName, dateStr);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Signature pad"
      className="fixed inset-0 z-[60] flex touch-none flex-col bg-neutral-900"
    >
      <div className="flex items-center justify-between gap-3 bg-bar px-4 py-2.5">
        <span className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-bar-fg">
          Receiver signature
        </span>
        <Button type="button" variant="cancel" size="sm" onClick={onCancel} disabled={busy}>
          Back
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <p className="text-center text-[12px] font-semibold text-white/80">
          Sign with your finger below
        </p>
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border-2 border-white/25 bg-white">
          <canvas
            ref={canvasRef}
            className="h-full w-full touch-none"
            style={{ touchAction: "none" }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={onUp}
            onPointerCancel={onUp}
          />
          {!hasInk ? (
            <span className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-[13px] font-medium text-neutral-400">
              ✍️ sign here
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-white/60">
              Print name (optional)
            </span>
            <input
              type="text"
              value={printName}
              onChange={(e) => setPrintName(e.target.value)}
              placeholder="Receiver name"
              className="rounded-md border border-white/20 bg-neutral-800 px-3 py-2 text-[15px] text-white placeholder:text-white/40 focus:border-accent focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-white/60">
              Date
            </span>
            <input
              type="text"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              inputMode="numeric"
              className="rounded-md border border-white/20 bg-neutral-800 px-3 py-2 text-[15px] text-white focus:border-accent focus:outline-none"
            />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-white/10 bg-bar px-4 py-3">
        <Button type="button" variant="cancel" onClick={clear} disabled={!hasInk || busy} fullWidth>
          Clear
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={done}
          disabled={!hasInk || busy}
          aria-busy={busy}
          fullWidth
        >
          {busy ? "Saving…" : "Done"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Trim the drawn signature to its ink bounding box and return a transparent
 * PNG plus its pixel dimensions. Returns null when the canvas is blank.
 */
async function extractSignaturePng(
  canvas: HTMLCanvasElement,
): Promise<{ png: Uint8Array; w: number; h: number } | null> {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  const pad = Math.round(Math.max(width, height) * 0.02);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  const octx = out.getContext("2d");
  if (!octx) return null;
  octx.drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
  const blob = await new Promise<Blob | null>((r) => out.toBlob(r, "image/png"));
  if (!blob) return null;
  return { png: new Uint8Array(await blob.arrayBuffer()), w: cw, h: ch };
}
