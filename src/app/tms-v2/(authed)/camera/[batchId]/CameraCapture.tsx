"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { Button } from "@/components/tms-v2/ui/Button";
import { BackButton } from "@/components/tms-v2/ui/BackButton";
import { DocViewer } from "@/components/ui/DocViewer";
import { uploadFileToSignedUrl } from "@/lib/storage/client-upload";
import { bolName, type BatchDetail } from "@/lib/camera/shared";
import { createCameraUploadUrl, deleteCameraPhoto, recordCameraPhoto } from "@/actions/tms-v2/camera";

/**
 * Camera capture view for one batch — ported near-verbatim from legacy's
 * admin/camera/[batchId]/CameraCapture.tsx (the only live getUserMedia
 * shutter implementation in the codebase; no tms-v2 precedent existed to
 * build on, per Phase 6 item 2's research). Swapped: legacy's
 * components/ui Button/PageHeader → tms-v2's own (component-namespace
 * rule, see Button.tsx's header comment); the shared components/ui
 * DocViewer is reused as-is (theme-neutral, already the app-wide full-
 * screen doc viewer); write actions route through the new
 * src/actions/tms-v2/camera.ts thin wrappers instead of the legacy
 * admin-scoped actions file.
 *
 *  - Live REAR-camera preview via getUserMedia({ facingMode: 'environment' }).
 *  - Tapping the shutter grabs a still (canvas), compresses to JPEG (long edge
 *    ~1600px, q~0.7), uploads direct-to-storage via a signed URL, records the
 *    row, and appends it to the strip.
 *  - FALLBACK: if getUserMedia is unavailable/denied, a native capture input
 *    (`<input type="file" accept="image/*" capture="environment">`) keeps
 *    capture working.
 *  - Auto-title is positional: "BOL-001", "BOL-002" … recomputed from order,
 *    so deleting a bad shot renumbers the rest.
 */

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.7;

type Photo = { id: string; storagePath: string; url: string | null };

function blobFromCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image."))), "image/jpeg", JPEG_QUALITY);
  });
}

async function compressToJpeg(source: CanvasImageSource, sw: number, sh: number): Promise<Blob> {
  if (!sw || !sh) throw new Error("Empty frame.");
  const longEdge = Math.max(sw, sh);
  const scale = longEdge > MAX_EDGE ? MAX_EDGE / longEdge : 1;
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported.");
  ctx.drawImage(source, 0, 0, w, h);
  return blobFromCanvas(canvas);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that photo."));
    };
    img.src = url;
  });
}

export function CameraCapture({ batch }: { batch: BatchDetail }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [photos, setPhotos] = useState<Photo[]>(() => batch.photos.map((p) => ({ id: p.id, storagePath: p.storagePath, url: p.url })));
  const [live, setLive] = useState(false);
  const [cameraOk, setCameraOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "zip" | null>(null);
  const [viewingIdx, setViewingIdx] = useState<number | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLive(false);
  }, []);

  const startCamera = useCallback(async () => {
    setErr(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraOk(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraOk(true);
      setLive(true);
    } catch {
      setCameraOk(false);
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback(
    async (blob: Blob): Promise<boolean> => {
      const file = new File([blob], "bol.jpg", { type: "image/jpeg" });
      const urlRes = await createCameraUploadUrl(batch.id);
      if (!urlRes.ok) {
        setErr(urlRes.reason);
        return false;
      }
      const up = await uploadFileToSignedUrl(urlRes.bucket, urlRes.path, urlRes.token, file);
      if (!up.ok) {
        setErr(`Upload failed: ${up.reason}`);
        return false;
      }
      const rec = await recordCameraPhoto(batch.id, urlRes.path, file.size);
      if (!rec.ok) {
        setErr(rec.reason);
        return false;
      }
      setPhotos((prev) => [...prev, { id: rec.id, storagePath: urlRes.path, url: rec.url }]);
      return true;
    },
    [batch.id],
  );

  const onShutter = useCallback(async () => {
    if (busy) return;
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setErr("Camera isn't ready yet.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const blob = await compressToJpeg(video, video.videoWidth, video.videoHeight);
      await persist(blob);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Capture failed.");
    } finally {
      setBusy(false);
    }
  }, [busy, persist]);

  const onPickFiles = useCallback(
    async (list: FileList | null) => {
      const files = Array.from(list ?? []);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (files.length === 0) return;
      setBusy(true);
      setErr(null);
      try {
        for (const f of files) {
          try {
            const img = await loadImage(f);
            const blob = await compressToJpeg(img, img.naturalWidth, img.naturalHeight);
            const ok = await persist(blob);
            if (!ok) break;
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Could not add that photo.");
            break;
          }
        }
      } finally {
        setBusy(false);
      }
    },
    [persist],
  );

  const onDelete = useCallback(
    async (id: string) => {
      if (busy) return;
      setPhotos((prev) => prev.filter((p) => p.id !== id));
      const res = await deleteCameraPhoto(batch.id, id);
      if (!res.ok) {
        setErr(res.reason);
        router.refresh();
      }
    },
    [busy, batch.id, router],
  );

  function triggerExport(kind: "pdf" | "zip") {
    if (photos.length === 0) return;
    setExporting(kind);
    // tms-v2's own copy of the export route handler (retirement-readiness
    // Objective 2 — this used to navigate to admin's route directly).
    window.location.href = `/tms-v2/camera/${batch.id}/export/${kind}`;
    setTimeout(() => setExporting(null), 4000);
  }

  const count = photos.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <BackButton href="/tms-v2/camera" label="All batches" />
        <PageHeader
          title={batch.name}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => triggerExport("pdf")} disabled={count === 0 || exporting !== null} aria-busy={exporting === "pdf"}>
                {exporting === "pdf" ? "Building…" : "Export PDF"}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => triggerExport("zip")} disabled={count === 0 || exporting !== null} aria-busy={exporting === "zip"}>
                {exporting === "zip" ? "Zipping…" : "Export ZIP"}
              </Button>
            </div>
          }
        />
      </div>

      {/* Camera / capture card */}
      <div className="overflow-hidden rounded-xl border border-line bg-card shadow-e1">
        <div className="flex items-center justify-between gap-2 bg-bar px-3 py-2">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-bar-fg">Capture</span>
          <span className="rounded border border-white/20 bg-black/20 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-bar-fg">{count} captured</span>
        </div>

        <div className="relative aspect-[3/4] w-full bg-black sm:aspect-[4/3]">
          <video ref={videoRef} playsInline muted autoPlay className={"h-full w-full object-cover " + (live ? "block" : "hidden")} />

          {live ? <div aria-hidden className="pointer-events-none absolute inset-4 rounded-md border-2 border-white/40" /> : null}

          {!live ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              {cameraOk === false ? (
                <>
                  <p className="text-[13px] font-semibold text-white">Camera not available</p>
                  <p className="max-w-xs text-[12px] text-white/70">Use your phone&apos;s camera to take a photo, or pick one from your library.</p>
                  <Button type="button" variant="primary" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                    Take / choose photo
                  </Button>
                  <button type="button" onClick={startCamera} className="text-[11px] text-white/60 underline hover:text-white/90">
                    Try the live camera again
                  </button>
                </>
              ) : (
                <p className="text-[12px] text-white/70">Starting camera…</p>
              )}
            </div>
          ) : null}
        </div>

        {live ? (
          <div className="flex items-center justify-center gap-4 bg-bar px-3 py-4">
            <button
              type="button"
              onClick={onShutter}
              disabled={busy}
              aria-label="Capture photo"
              className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-accent shadow-lg transition-transform active:scale-95 disabled:opacity-60 disabled:active:scale-100"
            >
              {busy ? (
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <span className="h-11 w-11 rounded-full bg-white/0 ring-2 ring-inset ring-white/70" />
              )}
            </button>
          </div>
        ) : null}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" multiple onChange={(e) => onPickFiles(e.target.files)} className="hidden" />

      {live ? (
        <div className="flex justify-center">
          <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            + Add from library
          </Button>
        </div>
      ) : null}

      {err ? (
        <p role="alert" className="text-[13px] font-medium text-bad">
          {err}
        </p>
      ) : null}

      <div>
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-fg-subtle">
          Batch · {count} photo{count === 1 ? "" : "s"}
        </h2>

        {count === 0 ? (
          <div className="rounded-xl border border-line bg-card px-4 py-8 text-center text-[13px] text-fg-muted shadow-e1">No shots yet. Frame a document and tap the shutter.</div>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((p, i) => (
              <li key={p.id} className="group relative overflow-hidden rounded-md border border-line-strong bg-elevated shadow-e1">
                <button type="button" onClick={() => setViewingIdx(i)} disabled={!p.url} aria-label={`View ${bolName(i + 1)}`} className="block aspect-[3/4] w-full disabled:cursor-default">
                  {p.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.url} alt={bolName(i + 1)} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-fg-subtle">no preview</div>
                  )}
                </button>
                <span className="absolute left-1 top-1 rounded-sm bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">{bolName(i + 1)}</span>
                <button
                  type="button"
                  onClick={() => onDelete(p.id)}
                  disabled={busy}
                  aria-label={`Delete ${bolName(i + 1)}`}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-[12px] font-bold text-white transition-colors hover:bg-bad disabled:opacity-50"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {viewingIdx != null && photos[viewingIdx] ? (
        <DocViewer
          doc={{ name: bolName(viewingIdx + 1), url: photos[viewingIdx].url, isImage: true }}
          onClose={() => setViewingIdx(null)}
          onDelete={async () => {
            await onDelete(photos[viewingIdx].id);
          }}
        />
      ) : null}
    </div>
  );
}
