"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { uploadFileToSignedUrl } from "@/lib/storage/client-upload";
import { bolName, type BatchDetail } from "@/lib/camera/shared";
import {
  createCameraUploadUrl,
  deleteCameraPhoto,
  recordCameraPhoto,
} from "../actions";

/**
 * Camera capture view for one batch. Mobile-first, dark-theme-safe.
 *
 *  - Live REAR-camera preview via getUserMedia({ facingMode: 'environment' }),
 *    framed in a V2 card, with a big shutter and a running "N captured" count.
 *  - Tapping the shutter grabs a still (canvas), compresses to JPEG (long edge
 *    ~1600px, q~0.7), uploads direct-to-storage via a signed URL, records the
 *    row, and appends it to the strip — immediately ready for the next shot
 *    (place · tap · swap).
 *  - FALLBACK: if getUserMedia is unavailable/denied, a native capture input
 *    (`<input type="file" accept="image/*" capture="environment">`) keeps
 *    capture working.
 *  - Auto-title is positional: "BOL-001", "BOL-002" … recomputed from order,
 *    so deleting a bad shot renumbers the rest.
 */

const MAX_EDGE = 1600; // long-edge target after downscale
const JPEG_QUALITY = 0.7;

type Photo = { id: string; storagePath: string; url: string | null };

function blobFromCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not encode image."))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

/** Downscale a drawable source (video frame or image) to a JPEG blob. */
async function compressToJpeg(
  source: CanvasImageSource,
  sw: number,
  sh: number,
): Promise<Blob> {
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

  const [photos, setPhotos] = useState<Photo[]>(() =>
    batch.photos.map((p) => ({ id: p.id, storagePath: p.storagePath, url: p.url })),
  );
  const [live, setLive] = useState(false);
  // null = still deciding; true = getUserMedia works; false = use fallback input.
  const [cameraOk, setCameraOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "zip" | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLive(false);
  }, []);

  const startCamera = useCallback(async () => {
    setErr(null);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setCameraOk(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraOk(true);
      setLive(true);
    } catch {
      // Denied or no camera → fall back to the native capture input.
      setCameraOk(false);
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Shared upload → record → append flow. */
  const persist = useCallback(
    async (blob: Blob): Promise<boolean> => {
      const file = new File([blob], "bol.jpg", { type: "image/jpeg" });
      const urlRes = await createCameraUploadUrl(batch.id);
      if (!urlRes.ok) {
        setErr(urlRes.reason);
        return false;
      }
      const up = await uploadFileToSignedUrl(
        urlRes.bucket,
        urlRes.path,
        urlRes.token,
        file,
      );
      if (!up.ok) {
        setErr(`Upload failed: ${up.reason}`);
        return false;
      }
      const rec = await recordCameraPhoto(batch.id, urlRes.path, file.size);
      if (!rec.ok) {
        setErr(rec.reason);
        return false;
      }
      setPhotos((prev) => [
        ...prev,
        { id: rec.id, storagePath: urlRes.path, url: rec.url },
      ]);
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
      const blob = await compressToJpeg(
        video,
        video.videoWidth,
        video.videoHeight,
      );
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
            const blob = await compressToJpeg(
              img,
              img.naturalWidth,
              img.naturalHeight,
            );
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
      // Optimistic remove — numbering below recomputes from position.
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
    // GET route returns the file as an attachment (Content-Disposition), so the
    // top-level navigation downloads it and leaves this page in place.
    window.location.href = `/admin/camera/${batch.id}/export/${kind}`;
    // Clear the spinner after the browser has had time to start the download.
    setTimeout(() => setExporting(null), 4000);
  }

  const count = photos.length;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6">
      <PageHeader
        eyebrow="Camera"
        title={batch.name}
        breadcrumb={
          <button
            type="button"
            onClick={() => router.push("/admin/camera")}
            className="cursor-pointer text-fg-muted hover:text-fg"
          >
            ← All batches
          </button>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="utility"
              onClick={() => triggerExport("pdf")}
              disabled={count === 0 || exporting !== null}
              aria-busy={exporting === "pdf"}
            >
              {exporting === "pdf" ? "Building…" : "Export PDF"}
            </Button>
            <Button
              type="button"
              variant="utility"
              onClick={() => triggerExport("zip")}
              disabled={count === 0 || exporting !== null}
              aria-busy={exporting === "zip"}
            >
              {exporting === "zip" ? "Zipping…" : "Export ZIP"}
            </Button>
          </div>
        }
      />

      {/* Camera / capture card */}
      <div className="mt-4 overflow-hidden rounded-lg border border-line-strong bg-card shadow-e2">
        <div className="flex items-center justify-between gap-2 bg-bar px-3 py-2">
          <span className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-bar-fg">
            Capture
          </span>
          <span className="rounded border border-white/20 bg-black/20 px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums text-bar-fg">
            {count} captured
          </span>
        </div>

        {/* Live preview OR fallback panel. Fixed dark frame so it reads the same
            in either theme. */}
        <div className="relative aspect-[3/4] w-full bg-black sm:aspect-[4/3]">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={
              "h-full w-full object-cover " + (live ? "block" : "hidden")
            }
          />

          {/* Framing guide overlay while live. */}
          {live ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-4 rounded-md border-2 border-white/40"
            />
          ) : null}

          {/* Fallback / not-yet-live panel. */}
          {!live ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              {cameraOk === false ? (
                <>
                  <p className="text-[13px] font-semibold text-white">
                    Camera not available
                  </p>
                  <p className="max-w-xs text-[12px] text-white/70">
                    Use your phone&apos;s camera to take a photo, or pick one
                    from your library.
                  </p>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy}
                  >
                    Take / choose photo
                  </Button>
                  <button
                    type="button"
                    onClick={startCamera}
                    className="text-[11px] text-white/60 underline hover:text-white/90"
                  >
                    Try the live camera again
                  </button>
                </>
              ) : (
                <p className="text-[12px] text-white/70">Starting camera…</p>
              )}
            </div>
          ) : null}
        </div>

        {/* Shutter row (live mode). */}
        {live ? (
          <div className="flex items-center justify-center gap-4 bg-bar px-3 py-4">
            <button
              type="button"
              onClick={onShutter}
              disabled={busy}
              aria-label="Capture photo"
              className={
                "flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-accent shadow-lg transition-transform " +
                "active:scale-95 disabled:opacity-60 disabled:active:scale-100"
              }
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

      {/* Native capture input — the fallback path, always mounted. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={(e) => onPickFiles(e.target.files)}
        className="hidden"
      />

      {/* A secondary "add from photos" affordance even in live mode. */}
      {live ? (
        <div className="mt-3 flex justify-center">
          <Button
            type="button"
            variant="cancel"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            + Add from library
          </Button>
        </div>
      ) : null}

      {err ? (
        <p role="alert" className="mt-3 text-[12px] font-semibold text-bad">
          {err}
        </p>
      ) : null}

      {/* Thumbnail strip */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-subtle">
            Batch · {count} photo{count === 1 ? "" : "s"}
          </h2>
        </div>

        {count === 0 ? (
          <div className="rounded-lg border border-line bg-card px-4 py-8 text-center text-[12px] text-fg-muted shadow-e1">
            No shots yet. Frame a document and tap the shutter.
          </div>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((p, i) => (
              <li
                key={p.id}
                className="group relative overflow-hidden rounded-md border border-line-strong bg-inset shadow-e1"
              >
                <div className="aspect-[3/4] w-full">
                  {p.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.url}
                      alt={bolName(i + 1)}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-fg-subtle">
                      no preview
                    </div>
                  )}
                </div>
                <span className="absolute left-1 top-1 rounded-sm bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums text-white">
                  {bolName(i + 1)}
                </span>
                <button
                  type="button"
                  onClick={() => onDelete(p.id)}
                  disabled={busy}
                  aria-label={`Delete ${bolName(i + 1)}`}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 font-mono text-[12px] font-bold text-white transition-colors hover:bg-bad disabled:opacity-50"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
