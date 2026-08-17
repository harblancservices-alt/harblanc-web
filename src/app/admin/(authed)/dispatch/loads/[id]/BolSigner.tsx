"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PDFPageProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/Button";
import { signBolRole } from "../actions";
import type { SignBolRolePayload } from "@/lib/domain/bol-signing";
import { loadPdfjs } from "@/lib/pdf/pdfjs";
import type { LoadDoc, BolRole } from "./DocumentsCard";

/**
 * BOL finger-signature flow — "hand the phone to the receiver, they sign".
 *
 * 1. place   — render the BOL page(s)/image; tap or DRAG a correctly-sized
 *              outline box (the real ~34%-page-width region the signature will
 *              occupy) so you can see exactly what it overlaps before signing.
 * 2. sign    — full-screen finger pad with a real signature baseline ("✕ ____"
 *              + "Sign above the line"); pointer events, no page scroll.
 * 3. confirm — the BOL with the signature composited in its true position, so
 *              Brent can verify it doesn't cover critical text. Save or Redo.
 * 4. save    — composite with pdf-lib (tap → PDF user-space via pdf.js's own
 *              convertToPdfPoint, rotation/offset-safe) and upload a NEW
 *              "<name> — signed.pdf" BOL. The stored original is never touched.
 */

const SIG_WIDTH_FRAC = 0.34; // signature width as a fraction of the page width
const DEFAULT_SIG_ASPECT = 0.34; // h/w guess for the box BEFORE a signature exists
const IMG_MAX_DIM = 2400; // cap image-BOL resolution so the signed PDF stays small

type Step = "loading" | "place" | "sign" | "confirm" | "saving";
type RenderedPage = {
  pageIndex: number;
  dataUrl: string;
  dispW: number;
  dispH: number;
};
type Placement = { pageIndex: number; fx: number; fy: number }; // fx/fy = box CENTER
type ImageSource = { jpg: Uint8Array; w: number; h: number; dataUrl: string };
type Signature = { png: Uint8Array; dataUrl: string; aspect: number };

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function isPdfDoc(doc: LoadDoc): boolean {
  return (doc.mime ?? "").includes("pdf") || /\.pdf$/i.test(doc.name);
}

const ROLE_LABEL: Record<BolRole, string> = {
  receiver: "Receiver",
  carrier: "Carrier",
};

function todayLabel(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function signatureLabel(name: string, date: string): string {
  return [name.trim(), date.trim()].filter(Boolean).join("   ");
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
  role,
  onClose,
}: {
  loadId: string;
  doc: LoadDoc; // the ORIGINAL unsigned BOL (the signing anchor)
  role: BolRole;
  onClose: () => void;
}) {
  const router = useRouter();
  const isPdf = isPdfDoc(doc);

  const pageProxiesRef = useRef<PDFPageProxy[]>([]); // pdf.js pages (coord mapping)

  const [step, setStep] = useState<Step>("loading");
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [imgSrc, setImgSrc] = useState<ImageSource | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [signature, setSignature] = useState<Signature | null>(null);
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

  const handlePlace = useCallback(
    (pageIndex: number, fx: number, fy: number) => {
      setPlacement({ pageIndex, fx, fy });
    },
    [],
  );

  // Signature drawn → stash it and go to the confirm preview (NOT saved yet).
  const handleSignDone = useCallback(
    (sig: Signature, name: string, date: string) => {
      setSignature(sig);
      setPrintName(name);
      setDateStr(date);
      setErr(null);
      setStep("confirm");
    },
    [],
  );

  // Confirmed → send this role's signature + placement to the server, which
  // regenerates the signed PDF from the ORIGINAL + all current role signatures
  // (so the other role's signature is preserved). Placement is mapped to the
  // original's geometry here: PDF via pdf.js convertToPdfPoint (rotation-safe),
  // image as page fractions the server resolves against the image dimensions.
  async function handleSave() {
    if (!placement || !signature) return;
    setStep("saving");
    setErr(null);
    try {
      let payload: SignBolRolePayload;
      if (isPdf) {
        const p = pageProxiesRef.current[placement.pageIndex];
        const vp1 = p.getViewport({ scale: 1 });
        const [cx, cy] = vp1.convertToPdfPoint(
          placement.fx * vp1.width,
          placement.fy * vp1.height,
        ) as [number, number];
        payload = {
          pngDataUrl: signature.dataUrl,
          printName,
          dateStr,
          placement: {
            kind: "pdf",
            pageIndex: placement.pageIndex,
            cx,
            cy,
            rotationDeg: p.rotate,
            widthPts: SIG_WIDTH_FRAC * vp1.width,
            aspect: signature.aspect,
          },
        };
      } else {
        payload = {
          pngDataUrl: signature.dataUrl,
          printName,
          dateStr,
          placement: {
            kind: "image",
            fx: placement.fx,
            fy: placement.fy,
            widthFrac: SIG_WIDTH_FRAC,
            aspect: signature.aspect,
          },
        };
      }
      const res = await signBolRole(loadId, doc.id, role, payload);
      if (!res.ok) throw new Error(res.reason);
      router.refresh();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the signed BOL.");
      setStep("confirm");
    }
  }

  // ── Full-screen signature pad ──────────────────────────────────────────────
  if (step === "sign" && placement) {
    return (
      <SignaturePad
        roleLabel={ROLE_LABEL[role]}
        printName={printName}
        setPrintName={setPrintName}
        dateStr={dateStr}
        setDateStr={setDateStr}
        onCancel={() => setStep("place")}
        onDone={handleSignDone}
      />
    );
  }

  const editable = step === "place";
  const label = signature ? signatureLabel(printName, dateStr) : "";
  const board = (
    <div className="mx-auto flex max-w-[720px] flex-col items-center gap-3">
      {isPdf
        ? pages.map((pg) => (
            <PlacementSurface
              key={pg.pageIndex}
              src={pg.dataUrl}
              alt={`BOL page ${pg.pageIndex + 1}`}
              pageAspect={pg.dispW / pg.dispH}
              pageIndex={pg.pageIndex}
              active={placement?.pageIndex === pg.pageIndex}
              fx={placement?.fx ?? 0.5}
              fy={placement?.fy ?? 0.5}
              sigAspect={signature?.aspect ?? DEFAULT_SIG_ASPECT}
              signatureUrl={signature?.dataUrl ?? null}
              label={label}
              editable={editable}
              onPlace={handlePlace}
            />
          ))
        : imgSrc
          ? (
              <PlacementSurface
                src={imgSrc.dataUrl}
                alt="BOL"
                pageAspect={imgSrc.w / imgSrc.h}
                pageIndex={0}
                active={placement?.pageIndex === 0}
                fx={placement?.fx ?? 0.5}
                fy={placement?.fy ?? 0.5}
                sigAspect={signature?.aspect ?? DEFAULT_SIG_ASPECT}
                signatureUrl={signature?.dataUrl ?? null}
                label={label}
                editable={editable}
                onPlace={handlePlace}
              />
            )
          : null}
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sign bill of lading"
      className="fixed inset-0 z-50 flex flex-col bg-black/85"
    >
      <div className="flex items-center justify-between gap-3 bg-bar px-4 py-2.5">
        <span className="truncate font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-bar-fg">
          {step === "confirm" ? "Confirm" : "Sign"} · {ROLE_LABEL[role]}
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
            <p className="mb-3 px-3 text-center text-[13px] font-semibold text-white">
              {step === "confirm"
                ? "Preview — this is exactly how it saves. Make sure it doesn't cover anything important."
                : signature
                  ? "Drag the signature to reposition, then preview."
                  : "Tap or drag on the BOL to place the signature box."}
            </p>
            {board}
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
            {placement ? "Drag to position" : "Tap the BOL to place"}
          </span>
          {signature ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="cancel"
                size="sm"
                onClick={() => setStep("sign")}
              >
                Re-sign
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => setStep("confirm")}
                disabled={!placement}
              >
                Preview →
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="primary"
              onClick={() => setStep("sign")}
              disabled={!placement}
            >
              Sign here →
            </Button>
          )}
        </div>
      ) : null}

      {step === "confirm" ? (
        <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-bar px-4 py-3">
          <span className="text-[12px] text-bar-fg/70">Placement look right?</span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="cancel" onClick={() => setStep("place")}>
              Redo
            </Button>
            <Button type="button" variant="primary" onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Placement surface: a BOL page/image with a sized, draggable outline box ───
function PlacementSurface({
  src,
  alt,
  pageAspect,
  pageIndex,
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
  alt: string;
  pageAspect: number; // pageWidth / pageHeight of the displayed page
  pageIndex: number;
  active: boolean;
  fx: number;
  fy: number;
  sigAspect: number; // signature height / width
  signatureUrl: string | null;
  label: string;
  editable: boolean;
  onPlace: (pageIndex: number, fx: number, fy: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  function fracOf(e: React.PointerEvent) {
    const rect = ref.current!.getBoundingClientRect();
    return {
      fx: clamp01((e.clientX - rect.left) / rect.width),
      fy: clamp01((e.clientY - rect.top) / rect.height),
    };
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

  // Box width is SIG_WIDTH_FRAC of the page width; height follows the real
  // signature aspect, expressed as a % of the (taller) page height.
  const wPct = SIG_WIDTH_FRAC * 100;
  const hPct = SIG_WIDTH_FRAC * 100 * sigAspect * pageAspect;

  return (
    <div
      ref={ref}
      className={
        "relative w-full select-none " +
        (editable ? "touch-none cursor-crosshair" : "touch-pan-y")
      }
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      onPointerCancel={onUp}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="block w-full rounded-sm bg-white"
        draggable={false}
      />
      {active ? (
        <PlacementBox
          fx={fx}
          fy={fy}
          wPct={wPct}
          hPct={hPct}
          signatureUrl={signatureUrl}
          label={signatureUrl ? label : ""}
        />
      ) : null}
    </div>
  );
}

function PlacementBox({
  fx,
  fy,
  wPct,
  hPct,
  signatureUrl,
  label,
}: {
  fx: number;
  fy: number;
  wPct: number;
  hPct: number;
  signatureUrl: string | null;
  label: string;
}) {
  return (
    <div
      className={
        "pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-accent " +
        (signatureUrl ? "" : "border-dashed bg-accent/10")
      }
      style={{
        left: `${fx * 100}%`,
        top: `${fy * 100}%`,
        width: `${wPct}%`,
        height: `${hPct}%`,
      }}
    >
      {signatureUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={signatureUrl}
          alt=""
          className="h-full w-full object-contain"
          draggable={false}
        />
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
  );
}

// ── Signature pad (opens sideways/landscape for a long signing line) ─────────
type PadView = { rot: 0 | 90; W: number; H: number; portrait: boolean };

function computePadView(): PadView {
  if (typeof window === "undefined") {
    return { rot: 0, W: 0, H: 0, portrait: false };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Portrait phone → rotate the pad 90° so the signing line runs the long way.
  // Already landscape → use the natural area, no rotation (no double-rotation).
  if (vh >= vw) return { rot: 90, W: vh, H: vw, portrait: true };
  return { rot: 0, W: vw, H: vh, portrait: false };
}

function SignaturePad({
  roleLabel,
  printName,
  setPrintName,
  dateStr,
  setDateStr,
  onCancel,
  onDone,
}: {
  roleLabel: string;
  printName: string;
  setPrintName: (v: string) => void;
  dateStr: string;
  setDateStr: (v: string) => void;
  onCancel: () => void;
  onDone: (sig: Signature, name: string, date: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<PadView>(computePadView);

  // Recompute the landscape stage on orientation / viewport change.
  useEffect(() => {
    const onResize = () =>
      setView((prev) => {
        const next = computePadView();
        return next.rot === prev.rot && next.W === prev.W && next.H === prev.H
          ? prev
          : next;
      });
    onResize(); // settle real dimensions after mount
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  // Size the canvas to its box (× dpr) and configure the pen. Re-runs when the
  // view changes (which relayouts the canvas), so it clears any ink. We read
  // clientWidth/Height — the element's LOCAL (untransformed) size — which stays
  // correct while the pad is CSS-rotated (getBoundingClientRect would return the
  // rotated bounding box instead).
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
    setHasInk(false);
  }, [view]);

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

  // Map a pointer to the canvas's LOCAL (landscape) coordinate space, inverting
  // the pad's CSS rotation so drawing tracks the finger. Because we draw in
  // local space, the exported canvas bitmap is always upright — the rotation is
  // a display-only transform and never touches the pixel buffer, so the saved
  // signature stamps onto the BOL right-side-up.
  function posOf(e: React.PointerEvent) {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const Wc = c.clientWidth;
    const Hc = c.clientHeight;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    if (view.rot === 90) {
      // Inverse of CSS rotate(90deg): local-centered = (dy, -dx).
      return { x: dy + Wc / 2, y: -dx + Hc / 2 };
    }
    return { x: dx + Wc / 2, y: dy + Hc / 2 };
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
    onDone(
      { png: sig.png, dataUrl: sig.dataUrl, aspect: sig.h / sig.w },
      printName,
      dateStr,
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Signature pad"
      className="fixed inset-0 z-[60] touch-none overflow-hidden bg-neutral-900"
    >
      {/* Landscape stage: sized to the rotated dimensions and spun 90° to fill
          the portrait screen, so the signing line runs the LONG way and every
          control reads upright once the phone is turned sideways. */}
      <div
        className="flex flex-col bg-neutral-900"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: view.W || "100%",
          height: view.H || "100%",
          transform: `translate(-50%, -50%) rotate(${view.rot}deg)`,
          transformOrigin: "center center",
        }}
      >
        <div className="flex items-center justify-between gap-3 bg-bar px-4 py-2">
          <span className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-bar-fg">
            {roleLabel} signature
          </span>
          <Button type="button" variant="cancel" size="sm" onClick={onCancel} disabled={busy}>
            Back
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-3">
          <p className="text-center text-[12px] font-semibold text-white/80">
            Sign with your finger above the line
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
            {/* Long signature baseline running the WIDE way: "✕ ______" + hint.
                An overlay, NOT drawn on the canvas, so it's never captured. */}
            <div className="pointer-events-none absolute inset-x-6 bottom-[24%]">
              <div className="flex items-center gap-2">
                <span className="-mt-1 text-[22px] leading-none text-neutral-500">
                  ✕
                </span>
                <span className="h-[2px] flex-1 rounded bg-neutral-400" />
              </div>
              <p className="mt-1 text-center text-[11px] font-medium tracking-wide text-neutral-400">
                Sign above the line
              </p>
            </div>
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
                placeholder={`${roleLabel} name`}
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

        <div className="grid grid-cols-2 gap-3 border-t border-white/10 bg-bar px-4 py-2.5">
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
            {busy ? "Working…" : "Done"}
          </Button>
        </div>
      </div>

      {/* Portrait-readable nudge to turn the phone (only when we rotated). */}
      {view.portrait ? (
        <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
          <span className="rounded-full bg-black/70 px-3 py-1 text-[11px] font-semibold text-white/90 shadow-lg">
            ↻ Turn your phone sideways to sign
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Trim the drawn signature to its ink bounding box and return a transparent
 * PNG (bytes + data URL for preview) plus its pixel dimensions. Returns null
 * when the canvas is blank.
 */
async function extractSignaturePng(
  canvas: HTMLCanvasElement,
): Promise<{ png: Uint8Array; dataUrl: string; w: number; h: number } | null> {
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
  return {
    png: new Uint8Array(await blob.arrayBuffer()),
    dataUrl: out.toDataURL("image/png"),
    w: cw,
    h: ch,
  };
}
