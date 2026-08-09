"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFPageProxy } from "pdfjs-dist";
import { loadPdfjs } from "@/lib/pdf/pdfjs";
import { getSignedPdfUrl } from "../pdfClient";
import { recordSignature } from "../signature-actions";
import type { CrmDocType } from "../types";

/**
 * Signature capture for an RC/BOL, ported from tms-v2's BolSigner.tsx (place
 * → sign → confirm → save) but trimmed to the PDF-only case — every doc this
 * editor signs is a server-rendered PDF (never a photographed image, unlike
 * the dispatch BOL flow that component also handles), and it saves through
 * shipments/signature-actions.ts::recordSignature instead of tms-v2's
 * signBolRole. Placement math (tap → PDF user-space point via the live pdf.js
 * viewport's convertToPdfPoint, honoring the page's /Rotate) is identical —
 * see that file for the reasoning.
 *
 * The signature pad itself supports Undo (pop the last stroke and redraw)
 * and Redo (re-apply an undone stroke), not just Clear — a fat-finger stroke
 * shouldn't force starting the whole signature over.
 */

const SIG_WIDTH_FRAC = 0.3;
const DEFAULT_SIG_ASPECT = 0.34;

type Step = "loading" | "place" | "sign" | "confirm" | "saving";
type RenderedPage = { pageIndex: number; dataUrl: string; dispW: number; dispH: number };
type Placement = { pageIndex: number; fx: number; fy: number };
type Signature = { dataUrl: string; aspect: number };

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function todayLabel(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

export function DocumentSigner({
  docType,
  docId,
  pdfStoragePath,
  role,
  roleLabel,
  defaultSignerName,
  onClose,
  onSigned,
}: {
  docType: CrmDocType;
  docId: string;
  pdfStoragePath: string;
  role: string;
  roleLabel: string;
  defaultSignerName?: string;
  onClose: () => void;
  onSigned: () => void;
}) {
  const pageProxiesRef = useRef<PDFPageProxy[]>([]);

  const [step, setStep] = useState<Step>("loading");
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [signature, setSignature] = useState<Signature | null>(null);
  const [signerName, setSignerName] = useState(defaultSignerName ?? "");
  const [dateStr] = useState(todayLabel);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = await getSignedPdfUrl(pdfStoragePath);
        if (!url) throw new Error("Could not open the document to sign.");
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Could not load the document (${resp.status}).`);
        const buf = new Uint8Array(await resp.arrayBuffer());

        const pdfjs = await loadPdfjs();
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
        setPlacement({ pageIndex: rendered.length - 1, fx: 0.2, fy: 0.9 });
        setStep("place");
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Could not open the document.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfStoragePath]);

  const handlePlace = useCallback((pageIndex: number, fx: number, fy: number) => {
    setPlacement({ pageIndex, fx, fy });
  }, []);

  function handleSignDone(sig: Signature) {
    setSignature(sig);
    setErr(null);
    setStep("confirm");
  }

  async function handleSave() {
    if (!placement || !signature) return;
    setStep("saving");
    setErr(null);
    try {
      const p = pageProxiesRef.current[placement.pageIndex];
      const vp1 = p.getViewport({ scale: 1 });
      const [cx, cy] = vp1.convertToPdfPoint(placement.fx * vp1.width, placement.fy * vp1.height) as [
        number,
        number,
      ];
      const result = await recordSignature(docType, docId, role, signerName.trim() || null, signature.dataUrl, {
        pageIndex: placement.pageIndex,
        cx,
        cy,
        rotationDeg: p.rotate,
        widthPts: SIG_WIDTH_FRAC * vp1.width,
      });
      if (!result.ok) throw new Error(result.error);
      onSigned();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the signature.");
      setStep("confirm");
    }
  }

  if (step === "sign") {
    return (
      <SignaturePad
        roleLabel={roleLabel}
        signerName={signerName}
        setSignerName={setSignerName}
        onCancel={() => setStep(placement ? "place" : "loading")}
        onDone={handleSignDone}
      />
    );
  }

  const label = signature ? [signerName.trim(), dateStr].filter(Boolean).join("   ") : "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Sign as ${roleLabel}`}
      className="fixed inset-0 z-[55] flex flex-col bg-black/90"
    >
      <div className="flex items-center justify-between gap-3 bg-bar px-4 py-2.5">
        <span className="truncate font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-bar-fg">
          {step === "confirm" ? "Confirm" : "Sign"} · {roleLabel}
        </span>
        <button
          type="button"
          onClick={onClose}
          disabled={step === "saving"}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-white/20 bg-white/[0.08] px-2.5 text-[12px] font-semibold text-bar-fg transition-colors hover:bg-white/15 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overscroll-contain overflow-y-auto px-2 py-3">
        {step === "loading" ? (
          <p className="mt-10 text-center text-[13px] font-semibold text-white/80">Opening document…</p>
        ) : step === "saving" ? (
          <p className="mt-10 text-center text-[13px] font-semibold text-white/80">Saving signed document…</p>
        ) : (
          <>
            <p className="mb-3 px-3 text-center text-[13px] font-semibold text-white">
              {step === "confirm"
                ? "Preview — this is exactly how it saves."
                : signature
                  ? "Drag the signature to reposition, then continue."
                  : "Tap where the signature should go, then Sign here."}
            </p>
            <div className="mx-auto flex max-w-[720px] flex-col items-center gap-3">
              {pages.map((pg) => (
                <PlacementSurface
                  key={pg.pageIndex}
                  src={pg.dataUrl}
                  pageIndex={pg.pageIndex}
                  pageAspect={pg.dispW / pg.dispH}
                  active={placement?.pageIndex === pg.pageIndex}
                  fx={placement?.fx ?? 0.2}
                  fy={placement?.fy ?? 0.9}
                  sigAspect={signature?.aspect ?? DEFAULT_SIG_ASPECT}
                  signatureUrl={signature?.dataUrl ?? null}
                  label={label}
                  editable={step === "place"}
                  onPlace={handlePlace}
                />
              ))}
            </div>
          </>
        )}

        {err ? (
          <p role="alert" className="mx-auto mt-4 max-w-md rounded-md bg-red-950/80 px-3 py-2 text-center text-[12px] font-semibold text-red-200">
            {err}
          </p>
        ) : null}
      </div>

      {step === "place" ? (
        <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-bar px-4 py-3">
          <span className="text-[12px] text-bar-fg/70">{placement ? "Drag to position" : "Tap to place"}</span>
          {signature ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep("sign")}
                className="inline-flex h-9 items-center rounded-md border border-white/20 bg-white/[0.08] px-3 text-[12.5px] font-semibold text-bar-fg hover:bg-white/15"
              >
                Re-sign
              </button>
              <button
                type="button"
                onClick={() => setStep("confirm")}
                disabled={!placement}
                className="inline-flex h-9 items-center rounded-md bg-accent px-3 text-[12.5px] font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
              >
                Preview →
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setStep("sign")}
              disabled={!placement}
              className="inline-flex h-9 items-center rounded-md bg-accent px-3 text-[12.5px] font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
            >
              Sign here →
            </button>
          )}
        </div>
      ) : null}

      {step === "confirm" ? (
        <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-bar px-4 py-3">
          <span className="text-[12px] text-bar-fg/70">Placement look right?</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep("place")}
              className="inline-flex h-9 items-center rounded-md border border-white/20 bg-white/[0.08] px-3 text-[12.5px] font-semibold text-bar-fg hover:bg-white/15"
            >
              Redo
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex h-9 items-center rounded-md bg-accent px-3 text-[12.5px] font-semibold text-white hover:bg-accent-hover"
            >
              Save
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PlacementSurface({
  src,
  pageIndex,
  pageAspect,
  active,
  fx,
  fy,
  sigAspect,
  signatureUrl,
  label,
  editable,
  onPlace,
}: {
  src: string;
  pageIndex: number;
  pageAspect: number;
  active: boolean;
  fx: number;
  fy: number;
  sigAspect: number;
  signatureUrl: string | null;
  label: string;
  editable: boolean;
  onPlace: (pageIndex: number, fx: number, fy: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  function fracOf(e: React.PointerEvent) {
    const rect = ref.current!.getBoundingClientRect();
    return { fx: clamp01((e.clientX - rect.left) / rect.width), fy: clamp01((e.clientY - rect.top) / rect.height) };
  }
  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!editable) return;
    e.preventDefault();
    dragging.current = true;
    ref.current?.setPointerCapture(e.pointerId);
    const p = fracOf(e);
    onPlace(pageIndex, p.fx, p.fy);
  }
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!editable || !dragging.current) return;
    e.preventDefault();
    const p = fracOf(e);
    onPlace(pageIndex, p.fx, p.fy);
  }
  function onUp() {
    dragging.current = false;
  }

  const wPct = SIG_WIDTH_FRAC * 100;
  const hPct = SIG_WIDTH_FRAC * 100 * sigAspect * pageAspect;

  return (
    <div
      ref={ref}
      className={"relative w-full select-none " + (editable ? "touch-none cursor-crosshair" : "touch-pan-y")}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      onPointerCancel={onUp}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={`Page ${pageIndex + 1}`} className="block w-full rounded-sm bg-white" draggable={false} />
      {active ? (
        <div
          className={
            "pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-accent " +
            (signatureUrl ? "" : "border-dashed bg-accent/10")
          }
          style={{ left: `${fx * 100}%`, top: `${fy * 100}%`, width: `${wPct}%`, height: `${hPct}%` }}
        >
          {signatureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={signatureUrl} alt="" className="h-full w-full object-contain" draggable={false} />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
              Signature
            </span>
          )}
          {label ? (
            <span className="absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap rounded-sm bg-white/85 px-1 text-[9px] font-semibold leading-tight text-neutral-900">
              {label}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type Point = { x: number; y: number };
type Stroke = Point[];

/**
 * The drawing surface itself — pointer events cover mouse, touch, and pen in
 * one handler set (no separate touch/mouse branches needed). Each completed
 * stroke is kept as its own point list so Undo can drop just the last stroke
 * and Redo can bring it back, both by replaying the remaining strokes onto a
 * freshly cleared canvas rather than trying to erase pixels.
 */
function SignaturePad({
  roleLabel,
  signerName,
  setSignerName,
  onCancel,
  onDone,
}: {
  roleLabel: string;
  signerName: string;
  setSignerName: (v: string) => void;
  onCancel: () => void;
  onDone: (sig: Signature) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<Point | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const redoRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke>([]);
  const [hasInk, setHasInk] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const cw = c.clientWidth;
    const ch = c.clientHeight;
    if (cw === 0 || ch === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    c.width = Math.max(1, Math.round(cw * dpr));
    c.height = Math.max(1, Math.round(ch * dpr));
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  }, []);

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
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function drawSegment(ctx: CanvasRenderingContext2D, from: Point, to: Point) {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    drawing.current = true;
    const p = posOf(e);
    last.current = p;
    currentStrokeRef.current = [p];
    canvasRef.current?.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
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
    if (ctx) drawSegment(ctx, last.current, p);
    currentStrokeRef.current.push(p);
    last.current = p;
  }
  function onUp() {
    if (drawing.current && currentStrokeRef.current.length > 1) {
      strokesRef.current.push(currentStrokeRef.current);
      redoRef.current = [];
      setCanRedo(false);
    }
    drawing.current = false;
    last.current = null;
    currentStrokeRef.current = [];
  }

  function redraw() {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
    for (const stroke of strokesRef.current) {
      for (let i = 1; i < stroke.length; i++) drawSegment(ctx, stroke[i - 1], stroke[i]);
    }
    setHasInk(strokesRef.current.length > 0);
  }

  function clear() {
    strokesRef.current = [];
    redoRef.current = [];
    setCanRedo(false);
    redraw();
  }

  function undo() {
    const stroke = strokesRef.current.pop();
    if (!stroke) return;
    redoRef.current.push(stroke);
    setCanRedo(true);
    redraw();
  }

  function redo() {
    const stroke = redoRef.current.pop();
    if (!stroke) return;
    strokesRef.current.push(stroke);
    setCanRedo(redoRef.current.length > 0);
    redraw();
  }

  async function done() {
    const c = canvasRef.current;
    if (!c || !hasInk || busy) return;
    setBusy(true);
    const sig = await extractSignaturePng(c);
    setBusy(false);
    if (!sig) return;
    onDone({ dataUrl: sig.dataUrl, aspect: sig.h / sig.w });
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Signature pad" className="fixed inset-0 z-[60] flex flex-col bg-neutral-900">
      <div className="flex items-center justify-between gap-3 bg-bar px-4 py-2">
        <span className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-bar-fg">{roleLabel} signature</span>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex h-9 items-center rounded-md border border-white/20 bg-white/[0.08] px-3 text-[12.5px] font-semibold text-bar-fg hover:bg-white/15 disabled:opacity-50"
        >
          Back
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <p className="text-center text-[12px] font-semibold text-white/80">
          Sign with your finger or mouse above the line
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
          <div className="pointer-events-none absolute inset-x-6 bottom-[22%]">
            <div className="flex items-center gap-2">
              <span className="-mt-1 text-[22px] leading-none text-neutral-500">✕</span>
              <span className="h-[2px] flex-1 rounded bg-neutral-400" />
            </div>
            <p className="mt-1 text-center text-[11px] font-medium tracking-wide text-neutral-400">Sign above the line</p>
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-white/60">
            Print name (optional)
          </span>
          <input
            type="text"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder={`${roleLabel} name`}
            className="rounded-md border border-white/20 bg-neutral-800 px-3 py-2 text-[15px] text-white placeholder:text-white/40 focus:border-accent focus:outline-none"
          />
        </label>
      </div>

      <div className="grid grid-cols-4 gap-2 border-t border-white/10 bg-bar px-4 py-2.5">
        <button
          type="button"
          onClick={undo}
          disabled={!hasInk || busy}
          className="inline-flex h-10 items-center justify-center rounded-md border border-white/20 bg-white/[0.08] text-[12.5px] font-semibold text-bar-fg hover:bg-white/15 disabled:opacity-40"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!canRedo || busy}
          className="inline-flex h-10 items-center justify-center rounded-md border border-white/20 bg-white/[0.08] text-[12.5px] font-semibold text-bar-fg hover:bg-white/15 disabled:opacity-40"
        >
          Redo
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={!hasInk || busy}
          className="inline-flex h-10 items-center justify-center rounded-md border border-white/20 bg-white/[0.08] text-[12.5px] font-semibold text-bar-fg hover:bg-white/15 disabled:opacity-40"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={done}
          disabled={!hasInk || busy}
          aria-busy={busy}
          className="inline-flex h-10 items-center justify-center rounded-md bg-accent text-[12.5px] font-bold text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {busy ? "Working…" : "Done"}
        </button>
      </div>
    </div>
  );
}

async function extractSignaturePng(canvas: HTMLCanvasElement): Promise<{ dataUrl: string; w: number; h: number } | null> {
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
  return { dataUrl: out.toDataURL("image/png"), w: cw, h: ch };
}
