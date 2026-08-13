"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { jsPDF as JsPdfDoc } from "jspdf";
import { Button } from "@/components/tms-v2/ui/Button";
import { createLoadDocUploadUrl, recordLoadDocuments } from "@/actions/tms-v2/documents";
import type { RecordDoc } from "@/app/admin/(authed)/dispatch/loads/actions";
import { uploadFileToSignedUrl } from "@/lib/storage/client-upload";
import { dewarp, cleanup, type Quad, type Pt, type Mode } from "@/lib/dispatch/scan";

/**
 * BOL document scanner — ported from V1's BolScanner.tsx (Phase 5C) ~
 * unchanged per the phase brief ("port... rather than rebuilding it"). 100%
 * in-browser, zero external deps beyond the already-used jspdf: snap the
 * signed BOL, drag four corner handles onto the page edges, "Crop & clean"
 * perspective-dewarps + cleans the page (WebGL homography, canvas fallback
 * — @/lib/dispatch/scan, shared with V1 unchanged), assembles every page
 * into one PDF, and uploads it via the same signed-URL primitive
 * DocumentsSection already uses. Only the Button import/variant names and
 * the doc-action import point at /tms-v2; the scan/dewarp/PDF logic is
 * byte-for-byte the same.
 */

const MAX_SRC_DIM = 1800;
type Page = { color: HTMLCanvasElement };

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

type Step = "capture" | "adjust" | "review";

export function BolScanner({ loadId, onClose }: { loadId: string; onClose: () => void }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);

  const [step, setStep] = useState<Step>("capture");
  const [pages, setPages] = useState<Page[]>([]);
  const [mode, setMode] = useState<Mode>("bw");
  const [status, setStatus] = useState<"idle" | "processing" | "saving">("idle");
  const [err, setErr] = useState<string | null>(null);

  const [dispW, setDispW] = useState(0);
  const [dispH, setDispH] = useState(0);
  const [scale, setScale] = useState(1);
  const [corners, setCorners] = useState<Pt[]>([]);
  const dragging = useRef<number | null>(null);

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
      const maxW = Math.min(window.innerWidth - 48, 460);
      const maxH = window.innerHeight - 230;
      const s = Math.min(maxW / src.width, maxH / src.height, 1);
      const dW = Math.round(src.width * s);
      const dH = Math.round(src.height * s);
      sourceRef.current = src;
      setScale(s);
      setDispW(dW);
      setDispH(dH);
      const ix = dW * 0.06;
      const iy = dH * 0.06;
      setCorners([
        { x: ix, y: iy },
        { x: dW - ix, y: iy },
        { x: dW - ix, y: dH - iy },
        { x: ix, y: dH - iy },
      ]);
      setStep("adjust");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not read that photo.");
    } finally {
      setStatus("idle");
      if (fileRef.current) fileRef.current.value = "";
    }
  }, []);

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

  function commitAdjusted(): boolean {
    const src = sourceRef.current;
    if (!src || corners.length !== 4) return false;
    const quad: Quad = [
      { x: corners[0].x / scale, y: corners[0].y / scale },
      { x: corners[1].x / scale, y: corners[1].y / scale },
      { x: corners[2].x / scale, y: corners[2].y / scale },
      { x: corners[3].x / scale, y: corners[3].y / scale },
    ];
    const cropped = dewarp(src, quad);
    setPages((p) => [...p, { color: cropped }]);
    return true;
  }

  async function onAddPage() {
    setStatus("processing");
    const ok = commitAdjusted();
    setStatus("idle");
    if (ok) {
      sourceRef.current = null;
      setStep("capture");
      setTimeout(() => fileRef.current?.click(), 50);
    }
  }
  async function onDonePage() {
    setStatus("processing");
    const ok = commitAdjusted();
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
      const { jsPDF } = await import("jspdf");
      const fmtPng = mode === "bw";
      let pdf: JsPdfDoc | null = null;
      for (const page of pages) {
        const rendered = cleanup(page.color, mode);
        const w = rendered.width;
        const h = rendered.height;
        const orientation = w > h ? "landscape" : "portrait";
        const data = fmtPng ? rendered.toDataURL("image/png") : rendered.toDataURL("image/jpeg", 0.82);
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

      const urlRes = await createLoadDocUploadUrl(loadId, file.name, file.type, file.size);
      if (!urlRes.ok) throw new Error(urlRes.reason);
      const upRes = await uploadFileToSignedUrl(urlRes.bucket, urlRes.path, urlRes.token, file);
      if (!upRes.ok) throw new Error(upRes.reason);
      const doc: RecordDoc = { storagePath: urlRes.path, originalFilename: file.name, mimeType: file.type, sizeBytes: file.size };
      const recRes = await recordLoadDocuments(loadId, "bol", [doc]);
      if (!recRes.ok) throw new Error(recRes.reason);

      router.refresh();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the scan.");
      setStatus("idle");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan bill of lading"
      className="no-scrollbar fixed inset-0 z-50 flex items-start justify-center overscroll-contain overflow-y-auto bg-black/70 p-3 sm:p-6"
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
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>

        <div className="space-y-3 bg-elevated px-4 py-4">
          {step === "capture" ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <p className="text-[13px] text-fg-muted">
                {pages.length === 0
                  ? "Snap the signed bill of lading. Lay it flat with all four corners showing."
                  : "Snap the next page, or finish below."}
              </p>
              <Button type="button" onClick={() => fileRef.current?.click()} disabled={status !== "idle"} className="w-full">
                {status === "processing" ? "Working…" : pages.length === 0 ? "Snap BOL page" : "Snap next page"}
              </Button>
              {pages.length > 0 ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => setStep("review")}>
                  Review {pages.length} page{pages.length === 1 ? "" : "s"} →
                </Button>
              ) : null}
            </div>
          ) : null}

          {step === "adjust" ? (
            <div className="space-y-3">
              <p className="text-center text-[12px] text-fg-muted">Drag the four corners to the edges of the BOL, then Crop &amp; clean.</p>
              <div className="relative mx-auto touch-none select-none" style={{ width: dispW, height: dispH }}>
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
                    <polygon points={corners.map((c) => `${c.x},${c.y}`).join(" ")} fill="rgba(16,185,129,0.14)" stroke="#10b981" strokeWidth={2} />
                  ) : null}
                  {corners.map((c, i) => (
                    <g key={i} onPointerDown={(e) => onHandleDown(i, e)}>
                      <circle cx={c.x} cy={c.y} r={30} fill="transparent" style={{ cursor: "grab", touchAction: "none" }} />
                      <circle cx={c.x} cy={c.y} r={12} fill="rgba(16,185,129,0.95)" stroke="#fff" strokeWidth={3} style={{ pointerEvents: "none" }} />
                    </g>
                  ))}
                </svg>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant="secondary"
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
                <Button type="button" variant="secondary" size="sm" onClick={onAddPage} disabled={status !== "idle"}>
                  + Add page
                </Button>
                <Button type="button" size="sm" onClick={onDonePage} disabled={status !== "idle"}>
                  {status === "processing" ? "…" : "Crop & clean"}
                </Button>
              </div>
            </div>
          ) : null}

          {step === "review" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-1 rounded-md border border-line-strong bg-card p-1">
                {(["bw", "gray", "color"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`flex-1 rounded px-2 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] transition-colors ${
                      mode === m ? "bg-fg text-canvas" : "text-fg-muted hover:bg-elevated"
                    }`}
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
                variant="secondary"
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
            <p role="alert" className="text-[12px] font-semibold text-bad">
              {err}
            </p>
          ) : null}

          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onCapture(e.target.files?.[0])} />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line bg-elevated px-4 py-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={onSave} disabled={status !== "idle" || pages.length === 0 || step !== "review"} aria-busy={status === "saving"}>
            {status === "saving" ? "Saving…" : `Save BOL${pages.length ? ` · ${pages.length}p` : ""}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PagePreview({ page, mode }: { page: Page; mode: Mode }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const rendered = cleanup(page.color, mode);
    const c = ref.current;
    if (!c) return;
    c.width = rendered.width;
    c.height = rendered.height;
    c.getContext("2d")!.drawImage(rendered, 0, 0);
  }, [page, mode]);
  return <canvas ref={ref} className="h-auto w-full rounded-sm border border-line bg-white" />;
}
