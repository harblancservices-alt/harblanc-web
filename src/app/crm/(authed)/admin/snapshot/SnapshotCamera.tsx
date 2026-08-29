"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * THE IN-PAGE CAMERA — shoot a stack of BOLs without leaving the screen.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────
 *
 * Capture used to be a file input with capture="environment". On Chrome for
 * Android that hands off to the system camera app: tap, shoot, tap the
 * check mark, wait for the page to come back, tap again. Three taps and two
 * app switches PER DOCUMENT. And `multiple` is ignored whenever `capture`
 * is set — the spec treats capture as a single shot — so the attribute that
 * looked like it allowed a burst never did anything on his phone.
 *
 * Brent photographs a stack back to back to back. The round trip is the
 * whole cost, and it is per photo.
 *
 * Here the stream stays live and the shutter RE-ARMS INSTANTLY. There is no
 * confirmation step, no freeze, no return trip: shoot, slide the next BOL
 * into frame, shoot again, at whatever pace he works.
 *
 * ── LEGIBILITY OVER FILE SIZE ─────────────────────────────────────────
 *
 * These get parsed, so small print has to survive. The stream is requested
 * at 2560px on the long edge and frames are encoded at JPEG q0.92 — about
 * 300dpi across a letter-width document, comfortably enough for the smallest
 * type on a BOL, and roughly 1–2MB a shot rather than the 8–12MB a raw
 * 12-megapixel original would cost. `ideal` rather than `exact` so a device
 * that cannot manage it downgrades instead of refusing to open at all.
 *
 * ── MEMORY ────────────────────────────────────────────────────────────
 *
 * He may shoot dozens in a row. Nothing here holds a full-resolution bitmap:
 * the frame is drawn, encoded, handed to the upload queue (which drops the
 * File once stored) and the canvas is reused for the next shot. The strip
 * shows small DATA-URL thumbnails — a few KB each, no object URLs, so there
 * is no revoke bookkeeping to get wrong — and only the most recent few are
 * kept, while the count keeps counting.
 */

/** Long edge requested from the camera. See the legibility note above. */
const IDEAL_LONG_EDGE = 2560;
/** JPEG quality for the captured frame. */
const JPEG_QUALITY = 0.92;
/** Thumbnail width in the strip. Small on purpose — it is a receipt that
 *  the shot happened, not a preview to inspect. */
const THUMB_WIDTH = 120;
/** How many thumbnails to keep. The COUNT is not capped; these are. */
const THUMB_KEEP = 8;

type CameraStatus = "idle" | "starting" | "live" | "denied" | "unavailable" | "error";

export function SnapshotCamera({
  onCapture,
  fallback,
}: {
  /** Handed straight to the existing upload queue. */
  onCapture: (file: File) => void;
  /** The original file-input control, rendered whenever the live camera
   * cannot run. He is never left with nothing. */
  fallback: React.ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<CameraStatus>("idle");
  /**
   * THE SHOT COUNTER IS A REF, and that is not an optimisation.
   *
   * It was derived from state (`const n = shotCount + 1`). React batches, so
   * six taps inside one tick all read the same zero: six files came out named
   * bol-001.jpg and the label said "1 photo". Measured, on six taps in 74ms —
   * which is exactly the burst this screen exists for.
   *
   * A ref increments synchronously, so every tap gets its own number however
   * fast they come. The state below only mirrors it for display.
   */
  const shotCountRef = useRef(0);
  /* A REF, filled on the first shot. It never changes and nothing renders
     it, so it was never state — and setState inside an effect is a
     cascading-render error the compiler rightly rejects. Stamped inside the
     handler, where reading the clock is allowed (never during render). */
  const sessionStampRef = useRef("");
  const [shotCount, setShotCount] = useState(0);
  const [thumbs, setThumbs] = useState<{ id: number; src: string }[]>([]);
  const [flash, setFlash] = useState(false);
  /** True once the element reports real dimensions — i.e. frames exist. */
  const [feedReady, setFeedReady] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unavailable");
      return;
    }
    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: IDEAL_LONG_EDGE },
          height: { ideal: Math.round((IDEAL_LONG_EDGE * 3) / 4) },
        },
        audio: false,
      });
      // ONLY store it. Attaching here was the bug that shipped a black
      // preview: this runs while status === "starting", and that branch
      // renders no <video> at all, so videoRef.current was null, the attach
      // was skipped, and the element then mounted with no srcObject.
      // The effect below binds it once the element actually exists.
      streamRef.current = stream;
      setStatus("live");
    } catch (err) {
      // NotAllowedError covers both "he just said no" and "Chrome already
      // has it blocked for this origin and will not ask again" — the two
      // are indistinguishable from here, which is why the message below
      // covers both and points at site settings.
      const name = (err as { name?: string })?.name ?? "";
      setStatus(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable");
    }
  }, []);

  /**
   * ATTACH AFTER MOUNT. The <video> only exists in the "live" branch, so the
   * stream can only be bound once React has rendered it — hence an effect
   * keyed on status rather than a line inside start().
   *
   * `loadedmetadata` is what says the frames are really coming: until it
   * fires the element has no dimensions and shoot() would (correctly) refuse
   * to capture. The overlay stays up until then, so a black box is never
   * presented as a working camera.
   */
  useEffect(() => {
    if (status !== "live") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;

    setFeedReady(false);
    video.srcObject = stream;

    const onMeta = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) setFeedReady(true);
    };
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("playing", onMeta);
    // Autoplay is declared on the element too, but Chrome can still need the
    // explicit call after a programmatic srcObject swap.
    void video.play().catch(() => {});
    // Already had metadata (a re-attach of a running stream).
    onMeta();

    return () => {
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("playing", onMeta);
    };
  }, [status]);

  useEffect(() => stop, [stop]);

  /**
   * ONE TAP = ONE PHOTO, and the stream never pauses.
   *
   * The flash is set synchronously so the tap acknowledges itself on the
   * same frame; encoding happens after and does not gate the next shot.
   */
  function shoot() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || status !== "live") return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;

    setFlash(true);
    window.setTimeout(() => setFlash(false), 90);

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);

    // Thumbnail first, off a tiny second canvas, so the strip updates
    // immediately rather than after the full-size encode.
    const tw = THUMB_WIDTH;
    const th = Math.max(1, Math.round((h / w) * tw));
    const tc = document.createElement("canvas");
    tc.width = tw;
    tc.height = th;
    tc.getContext("2d")?.drawImage(canvas, 0, 0, tw, th);
    const thumbSrc = tc.toDataURL("image/jpeg", 0.6);

    if (!sessionStampRef.current) {
      const d = new Date();
      const p2 = (v: number) => String(v).padStart(2, "0");
      sessionStampRef.current = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
    }
    const n = (shotCountRef.current += 1);
    setShotCount(n);
    setThumbs((prev) => [{ id: n, src: thumbSrc }, ...prev].slice(0, THUMB_KEEP));

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        /* Dated, not just numbered. The counter restarts at 1 whenever the
           camera is reopened, so `bol-003.jpg` alone would repeat across
           sessions in the list. The permanent number still comes from the
           database — this is only the filename beside it, and it should not
           be ambiguous. */
        const stampName = `bol-${sessionStampRef.current}-${String(n).padStart(3, "0")}.jpg`;
        onCapture(new File([blob], stampName, { type: "image/jpeg" }));
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  }

  // ── NOT RUNNING: every path ends with something he can use ──────────
  if (status !== "live") {
    return (
      <div className="border-b border-line-strong bg-card p-3">
        {status === "idle" && (
          <button
            type="button"
            onClick={start}
            className="flex min-h-[112px] w-full cursor-pointer select-none flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-accent/50 bg-accent-bg px-4 py-6 text-center transition-colors hover:border-accent hover:bg-accent/10"
          >
            <span className="text-[17px] font-extrabold text-accent">Open the camera</span>
            <span className="text-[12px] text-fg-muted">
              Shoot the whole stack without leaving this screen.
            </span>
          </button>
        )}

        {status === "starting" && (
          <p className="flex min-h-[112px] items-center justify-center text-[13px] font-semibold text-fg-muted">
            Starting the camera…
          </p>
        )}

        {status === "denied" && (
          <div className="rounded-md border border-warn/40 bg-warn-bg px-3 py-2.5">
            <p className="text-[13px] font-bold text-warn">Chrome is blocking the camera</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-fg-muted">
              If you just tapped Block, reload and allow it. If it never asked, Chrome
              has already blocked it for this site and will not ask again — open the
              padlock in the address bar, tap <span className="font-semibold">Permissions</span>,
              turn <span className="font-semibold">Camera</span> on, then reload.
            </p>
            <button
              type="button"
              onClick={start}
              className="mt-2 rounded-md border border-warn/50 bg-card px-2.5 py-1 text-[12px] font-bold text-warn"
            >
              Try again
            </button>
          </div>
        )}

        {status === "unavailable" && (
          <p className="rounded-md border border-line-strong bg-inset px-3 py-2 text-[12.5px] text-fg-muted">
            No camera available in this browser. Use the button below.
          </p>
        )}

        {/* ALWAYS. Whether the camera is merely unopened or hard-blocked,
            the original control is right here and still works. */}
        <div className={status === "idle" ? "mt-2" : "mt-3"}>{fallback}</div>
      </div>
    );
  }

  // ── LIVE ─────────────────────────────────────────────────────────────
  return (
    <div className="border-b border-line-strong bg-card p-3">
      <div className="relative overflow-hidden rounded-md bg-black">
        {/* autoPlay AND the explicit play() in the effect: Chrome for
            Android will not start a programmatically-assigned srcObject
            from the attribute alone, and iOS refuses to play inline without
            playsInline. muted is what makes autoplay permissible at all.
            All three, because dropping any one of them is a black box on
            some device.

            LANDSCAPE IS THE NORMAL CASE HERE. Brent shoots from a phone
            mount over a table, so the viewport is ~412px tall: a 52vh cap
            left a 214px preview with the controls sitting on top of it. The
            preview now takes the height it can get and the controls move to
            a column at the right edge, out of the document's way. */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="block max-h-[52vh] w-full object-contain landscape:max-h-[74vh]"
        />
        {flash && <div className="pointer-events-none absolute inset-0 bg-white/70" />}

        {/* Never present a black rectangle as a working camera. */}
        {!feedReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-4 text-center">
            <p className="text-[13px] font-semibold text-white/80">
              Waiting for the camera feed…
            </p>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-8 landscape:inset-x-auto landscape:inset-y-0 landscape:right-0 landscape:w-[92px] landscape:flex-col-reverse landscape:justify-center landscape:bg-gradient-to-l landscape:px-2 landscape:pb-0 landscape:pt-0">
          <span className="crm-num text-[13px] font-bold text-white">
            {shotCount} {shotCount === 1 ? "photo" : "photos"}
          </span>

          {/* THE SHUTTER. Deliberately huge — this is the only control that
              matters on this screen and it gets tapped dozens of times in a
              row, often one-handed while the other hand moves paper. */}
          <button
            type="button"
            onClick={shoot}
            disabled={!feedReady}
            aria-label="Take photo"
            className="h-[68px] w-[68px] shrink-0 rounded-full border-4 border-white bg-white/25 transition-transform active:scale-95 disabled:opacity-40"
          />

          <button
            type="button"
            onClick={() => {
              stop();
              setStatus("idle");
            }}
            className="rounded-md bg-white/15 px-2.5 py-1.5 text-[12px] font-bold text-white"
          >
            Done
          </button>
        </div>
      </div>

      {thumbs.length > 0 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
          {thumbs.map((t) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={t.id}
              src={t.src}
              alt={`Photo ${t.id}`}
              className="h-14 w-auto shrink-0 rounded border border-line-strong"
            />
          ))}
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
