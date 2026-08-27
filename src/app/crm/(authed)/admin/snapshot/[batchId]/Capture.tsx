"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { recordSnapshot } from "../actions";

/**
 * THE CAPTURE BAR — the whole point of Snapshot.
 *
 * Brent props the phone up, slides a bill of lading underneath, taps, swaps
 * the paper, taps again. Four hundred times. Everything here exists to keep
 * that loop at the speed of his hands.
 *
 * ── WHAT IS DELIBERATELY ABSENT ───────────────────────────────────────
 *
 * No modal to dismiss. No per-shot confirmation. No navigation. And no
 * router.refresh() — the pattern CommodityPhotoTiles uses, one refresh per
 * upload, is right for three photos and fatal for four hundred: it would
 * re-render the server page between every shot. This screen keeps its own
 * optimistic list; only the file area below reads the server.
 *
 * ── MEMORY, WHICH IS THE REAL CONSTRAINT ──────────────────────────────
 *
 * A phone photo is 2–5MB. Holding four hundred File objects and four hundred
 * object URLs is a gigabyte-plus and a dead tab. So:
 *
 *   - previews are createObjectURL, never a signed URL — instant, no network;
 *   - only the newest RECENT_LIMIT shots keep a preview; when a shot falls
 *     out of that window its URL is revoked on the spot;
 *   - a File reference is dropped the moment its shot is safely stored.
 *     The only photos held in memory are the ones not yet saved — and the
 *     failed ones, because that is exactly what Retry needs.
 *
 * ── A DROPPED CONNECTION MUST NOT COST THE BATCH ──────────────────────
 *
 * The batch row exists before the first photo and its id is in the URL, so a
 * reload lands back in the same batch. Each shot uploads independently, so a
 * drop costs only the shots in flight — and those stay on screen as failures
 * with a Retry rather than vanishing and letting Brent believe he
 * photographed something he did not.
 */

const STORAGE_BUCKET = "crm-documents";
/** Concurrent uploads: enough to use the pipe, few enough that a phone on a
 * dock's wifi is not fighting itself. */
const MAX_IN_FLIGHT = 3;
/** How many recent shots keep a live preview. */
const RECENT_LIMIT = 12;

type ShotStatus = "queued" | "uploading" | "saved" | "failed";

type Shot = {
  key: string;
  seq: number;
  previewUrl: string | null;
  status: ShotStatus;
  error?: string;
};

/** What the uploader needs, kept out of React state so no upload ever reads
 * a stale render. Removed on success — this map IS the memory footprint. */
type Pending = { file: File; seq: number };

function sanitizeFileName(name: string): string {
  const cleaned = (name || "shot.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.length > 120 ? cleaned.slice(-120) : cleaned;
}

export function Capture({
  batchId,
  orgId,
  startSeq,
  closed,
}: {
  batchId: string;
  orgId: string;
  /** Where this sitting's numbering resumes — the batch's current highest
   * seq. Without it a reload restarts at 1 and scrambles page order on a
   * batch that already holds photos. */
  startSeq: number;
  closed: boolean;
}) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [savedCount, setSavedCount] = useState(0);

  const seqRef = useRef(startSeq);
  const inFlightRef = useRef(0);
  const queueRef = useRef<string[]>([]);
  const pendingRef = useRef<Map<string, Pending>>(new Map());
  /** Live object URLs, newest first, so the oldest can be revoked when the
   * preview window overflows and every one can be freed on unmount. */
  const previewsRef = useRef<{ key: string; url: string }[]>([]);

  useEffect(() => {
    const previews = previewsRef.current;
    return () => {
      for (const p of previews) URL.revokeObjectURL(p.url);
      previews.length = 0;
    };
  }, []);

  const update = useCallback((key: string, patch: Partial<Shot>) => {
    setShots((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }, []);

  /**
   * Drain the queue up to MAX_IN_FLIGHT.
   *
   * A plain function, NOT a useCallback: it calls itself when a slot frees
   * up, and the React Compiler cannot preserve memoization on a
   * self-referencing callback (it says so, as a lint error). Nothing is lost
   * — pump only ever touches refs and `update`, so there is no stale state
   * for a fresh function identity to capture, and it is only called from
   * event handlers and from itself.
   */
  function pump() {
    async function send(key: string, pending: Pending) {
      update(key, { status: "uploading", error: undefined });
      try {
        const supabase = createSupabaseBrowserClient();
        // The path starts with org_id, so the existing storage policy covers
        // it with no new policy — the same reasoning commodity photos
        // record. The batch id is the second segment, so even a raw bucket
        // listing groups one sitting together.
        const storagePath = `${orgId}/bol-snapshots/${batchId}/${crypto.randomUUID()}-${sanitizeFileName(pending.file.name)}`;

        const { error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, pending.file, {
            contentType: pending.file.type || undefined,
            upsert: false,
          });
        if (uploadError) throw new Error("Upload failed.");

        const res = await recordSnapshot({
          batchId,
          seq: pending.seq,
          fileName: pending.file.name || "shot.jpg",
          storagePath,
          mimeType: pending.file.type || null,
          sizeBytes: pending.file.size,
        });
        if (!res.ok) throw new Error(res.error);

        // Safely stored — let go of the photo.
        pendingRef.current.delete(key);
        update(key, { status: "saved" });
        setSavedCount((n) => n + 1);
      } catch (e) {
        update(key, {
          status: "failed",
          error: e instanceof Error ? e.message : "Could not save that shot.",
        });
      } finally {
        inFlightRef.current -= 1;
        if (queueRef.current.length > 0) pump();
      }
    }

    while (inFlightRef.current < MAX_IN_FLIGHT && queueRef.current.length > 0) {
      const key = queueRef.current.shift();
      if (!key) break;
      const pending = pendingRef.current.get(key);
      if (!pending) continue;
      inFlightRef.current += 1;
      void send(key, pending);
    }
  }

  /** Called from an event handler only, never from render or an updater —
   * revoking is a side effect and has no business in either. */
  function trimPreviews(): string[] {
    const dropped: string[] = [];
    while (previewsRef.current.length > RECENT_LIMIT) {
      const oldest = previewsRef.current.pop();
      if (!oldest) break;
      URL.revokeObjectURL(oldest.url);
      dropped.push(oldest.key);
    }
    return dropped;
  }

  function accept(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    const added: Shot[] = [];
    for (const file of Array.from(fileList)) {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      seqRef.current += 1;
      const seq = seqRef.current;
      const previewUrl = URL.createObjectURL(file);
      previewsRef.current.unshift({ key, url: previewUrl });
      pendingRef.current.set(key, { file, seq });
      added.push({ key, seq, previewUrl, status: "queued" });
      queueRef.current.push(key);
    }

    const dropped = new Set(trimPreviews());
    // Newest first — the shot you just took is the one you glance at.
    setShots((prev) =>
      [...added.reverse(), ...prev].map((s) =>
        dropped.has(s.key) ? { ...s, previewUrl: null } : s,
      ),
    );
    pump();
  }

  function retry(key: string) {
    if (!pendingRef.current.has(key)) return;
    update(key, { status: "queued", error: undefined });
    queueRef.current.push(key);
    pump();
  }

  function retryAll() {
    for (const s of shots) if (s.status === "failed") retry(s.key);
  }

  const failedCount = shots.reduce((n, s) => n + (s.status === "failed" ? 1 : 0), 0);
  const pendingCount = shots.reduce(
    (n, s) => n + (s.status === "queued" || s.status === "uploading" ? 1 : 0),
    0,
  );
  const recent = shots.slice(0, RECENT_LIMIT);

  return (
    <div className="border-b border-line-strong bg-card">
      <div className="flex flex-col gap-3 p-3">
        {/* ── The shutter. A label wrapping a file input, so the whole
            block is the tap target and no JavaScript stands between the
            tap and the camera. capture="environment" opens the rear
            camera directly on iOS and Android; on a desktop browser the
            same control is an ordinary file picker, which is why there is
            no separate desktop path to maintain. ── */}
        <label
          className={`flex min-h-[104px] select-none flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed px-4 py-5 text-center transition-colors ${
            closed
              ? "cursor-not-allowed border-line bg-inset opacity-60"
              : "cursor-pointer border-accent/50 bg-accent-bg hover:border-accent hover:bg-accent/10"
          }`}
        >
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            disabled={closed}
            className="sr-only"
            onChange={(e) => {
              accept(e.target.files);
              // Clearing the value is what makes the NEXT tap reopen the
              // camera. Without it the input holds the last file, and
              // re-picking the same name fires no change event at all —
              // the shutter silently stops working mid-batch.
              e.target.value = "";
            }}
          />
          <span className="text-[17px] font-extrabold text-accent">
            {closed ? "Batch closed" : "Take a photo"}
          </span>
          <span className="text-[12px] text-fg-muted">
            {closed
              ? "Reopen the batch to add more shots."
              : "Snap, swap the paper, snap again. Nothing to dismiss."}
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
          <span className="font-extrabold text-fg">
            <span className="crm-num text-[16px]">{startSeq + savedCount}</span> in this batch
          </span>
          {pendingCount > 0 && (
            <span className="text-fg-muted">
              <span className="crm-num">{pendingCount}</span> uploading…
            </span>
          )}
          {failedCount > 0 && (
            <>
              <span className="font-bold text-bad">
                <span className="crm-num">{failedCount}</span> failed
              </span>
              <button
                type="button"
                onClick={retryAll}
                className="rounded-md border border-bad/50 bg-bad-bg px-2.5 py-1 text-[12px] font-bold text-bad hover:border-bad"
              >
                Retry all
              </button>
            </>
          )}
        </div>

        {failedCount > 0 && (
          <p className="rounded-md border border-bad/30 bg-bad-bg px-2.5 py-1.5 text-[12px] font-semibold text-bad">
            {failedCount === 1 ? "A shot" : `${failedCount} shots`} did not reach storage — they
            are still on this device. Keep shooting and retry when the signal is back, but do not
            reload the page until these are saved.
          </p>
        )}

        {recent.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {recent.map((s) => (
              <div
                key={s.key}
                className={`relative h-[68px] w-[68px] shrink-0 overflow-hidden rounded-md border ${
                  s.status === "failed" ? "border-bad" : "border-line"
                }`}
                title={`#${s.seq} — ${s.status}`}
              >
                {s.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.previewUrl}
                    alt={`Shot ${s.seq}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-inset text-[11px] text-fg-subtle crm-num">
                    #{s.seq}
                  </div>
                )}

                {s.status !== "saved" && (
                  <div className="absolute inset-x-0 bottom-0 bg-graphite/85 px-1 py-0.5 text-center text-[9px] font-bold uppercase tracking-[0.06em] text-white">
                    {s.status === "failed" ? "failed" : s.status === "uploading" ? "…" : "queued"}
                  </div>
                )}

                {s.status === "failed" && (
                  <button
                    type="button"
                    onClick={() => retry(s.key)}
                    className="absolute inset-0 flex items-center justify-center bg-bad/20 text-[11px] font-extrabold text-bad"
                  >
                    Retry
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
