"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { recordSnapshot, deleteSnapshot } from "./actions";
import type { SnapshotRow } from "./snapshot-data";
import { SnapshotCamera } from "./SnapshotCamera";

/**
 * SNAPSHOT — the whole page. Capture at the top, list underneath, and the
 * list gets bigger as it goes.
 *
 * ── ONE COMPONENT, BECAUSE THE LIST HAS TO GROW WITHOUT A REFRESH ─────
 *
 * There is no Refresh button — there is only Delete. So a photo has to
 * appear in the list the moment it is saved, which means the list lives in
 * the same client component as the capture control and is seeded from the
 * server render. recordSnapshot returns the number the database assigned,
 * so the new row shows its real permanent number immediately rather than a
 * placeholder that corrects itself later.
 *
 * ── WHAT WAS REMOVED, AND WHY IT IS NOT COMING BACK ──────────────────
 *
 * An earlier version had batches, a manifest, thumbnails, paging, a close
 * step and a parse handoff. Brent cut all of it: "It's just a list of
 * files. There's no photo preview, there's no nothing." Thumbnails were
 * also the reason that version needed paging — a private bucket means a
 * signed URL per preview. With no previews there is nothing to sign, so
 * four hundred rows of text render at no cost and need no pagination
 * control, which is just as well, because a pagination control is a button.
 *
 * ── MEMORY ────────────────────────────────────────────────────────────
 *
 * A phone photo is 2–5MB. The File reference is dropped the moment its
 * photo is stored, so the only images held in memory are the ones not yet
 * saved and the ones that failed — the latter because that is exactly what
 * Retry needs. Nothing here creates an object URL at all now that there
 * are no previews.
 */

const STORAGE_BUCKET = "crm-documents";
/**
 * ONE AT A TIME, AND THAT IS DELIBERATE.
 *
 * Uploads used to run three-wide. That is faster in raw throughput, but it
 * hands out numbers in the order photos FINISH rather than the order they
 * were taken — on a five-shot burst the third photo can land first and
 * become #1. The number is now the only structure this feature has and
 * Brent reads ranges off it out loud, so shooting order has to be the
 * numbering order.
 *
 * Serialising costs almost nothing here: the same total bytes go up either
 * way, concurrency only hides latency, and capture is never blocked — the
 * queue absorbs shots as fast as he can tap while it drains behind him.
 * Correct numbering is worth more than a hidden round-trip.
 */
const MAX_IN_FLIGHT = 1;

type Pending = { key: string; file: File; status: "queued" | "uploading" | "failed" };

function sanitizeFileName(name: string): string {
  const cleaned = (name || "shot.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.length > 120 ? cleaned.slice(-120) : cleaned;
}

function stamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * One figure on a parsed row. Label under value, so the three read as a
 * row of numbers at a glance and the words are there when you want them.
 * `crm-num` is the tabular-figure class the rest of the CRM uses, so the
 * digits line up between rows.
 */
function Stat({ label, value, outOf }: { label: string; value: number; outOf?: number }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="crm-num text-[13px] font-extrabold leading-none text-white">
        {value}
        {outOf ? <span className="text-white/60">/{outOf}</span> : null}
      </span>
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-white/70">
        {label}
      </span>
    </span>
  );
}

export function SnapshotConsole({
  orgId,
  initial,
  truncated,
}: {
  orgId: string;
  initial: SnapshotRow[];
  truncated: boolean;
}) {
  const [rows, setRows] = useState<SnapshotRow[]>(initial);
  const [pendingShots, setPendingShots] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const inFlightRef = useRef(0);
  const queueRef = useRef<string[]>([]);
  const filesRef = useRef<Map<string, File>>(new Map());

  // Warn on a reload that would lose photos still on this device. The only
  // way a shot is lost is if the tab closes before it reaches storage.
  const unsavedCount = pendingShots.length;
  useEffect(() => {
    if (unsavedCount === 0) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsavedCount]);

  function setStatus(key: string, status: Pending["status"]) {
    setPendingShots((prev) => prev.map((p) => (p.key === key ? { ...p, status } : p)));
  }

  /**
   * Drain the queue. A plain function, not a useCallback: it calls itself
   * when a slot frees, and the React Compiler cannot preserve memoization
   * on a self-referencing callback. Nothing is lost — it only touches refs.
   */
  function pump() {
    async function send(key: string, file: File) {
      setStatus(key, "uploading");
      try {
        const supabase = createSupabaseBrowserClient();
        // Path starts with org_id, so the existing storage policy covers it
        // with no new policy — the same reasoning commodity photos record.
        const storagePath = `${orgId}/bol-snapshots/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;

        const { error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, file, { contentType: file.type || undefined, upsert: false });
        if (uploadError) throw new Error("Upload failed.");

        const res = await recordSnapshot({
          fileName: file.name || "shot.jpg",
          storagePath,
          mimeType: file.type || null,
          sizeBytes: file.size,
        });
        if (!res.ok) throw new Error(res.error);

        // Stored. Let go of the photo and put its real number on screen.
        filesRef.current.delete(key);
        setPendingShots((prev) => prev.filter((p) => p.key !== key));
        setRows((prev) => [
          {
            id: res.id,
            number: res.number,
            fileName: file.name || "shot.jpg",
            createdAt: res.createdAt,
            // A photo taken one second ago has not been parsed. It joins
            // the list plain and turns green when it has been.
            parse: null,
          },
          ...prev,
        ]);
      } catch {
        setStatus(key, "failed");
      } finally {
        inFlightRef.current -= 1;
        if (queueRef.current.length > 0) pump();
      }
    }

    while (inFlightRef.current < MAX_IN_FLIGHT && queueRef.current.length > 0) {
      const key = queueRef.current.shift();
      if (!key) break;
      const file = filesRef.current.get(key);
      if (!file) continue;
      inFlightRef.current += 1;
      void send(key, file);
    }
  }

  /** The one way anything enters the queue — the file input and the live
   *  camera both land here, so numbering, retry and the saving count behave
   *  identically whichever way the photo was taken. */
  function enqueue(files: File[]) {
    if (files.length === 0) return;
    const added: Pending[] = [];
    for (const file of files) {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      filesRef.current.set(key, file);
      queueRef.current.push(key);
      added.push({ key, file, status: "queued" });
    }
    setPendingShots((prev) => [...prev, ...added]);
    pump();
  }

  function accept(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    enqueue(Array.from(fileList));
  }

  function retryAll() {
    for (const p of pendingShots) {
      if (p.status !== "failed") continue;
      setStatus(p.key, "queued");
      queueRef.current.push(p.key);
    }
    pump();
  }

  function remove(row: SnapshotRow) {
    if (!window.confirm(`Delete #${row.number}? Its number stays used — nothing renumbers.`)) return;
    setError(null);
    setBusyId(row.id);
    startTransition(async () => {
      const res = await deleteSnapshot(row.id);
      setBusyId(null);
      if (res.ok) setRows((prev) => prev.filter((r) => r.id !== row.id));
      else setError(res.error);
    });
  }

  const failedCount = pendingShots.reduce((n, p) => n + (p.status === "failed" ? 1 : 0), 0);
  const workingCount = pendingShots.length - failedCount;

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="bg-graphite px-4 py-4">
        <h1 className="text-[24px] font-extrabold leading-none tracking-[-0.02em] text-white">
          Snapshot
        </h1>
        <p className="mt-2 max-w-[62ch] text-[12.5px] text-white/60">
          Photograph bills of lading. Each one gets a permanent number, counting up from 1.
        </p>
      </header>

      {/* ── CAPTURE ────────────────────────────────────────────────
          The live camera, with the ORIGINAL file input handed to it as the
          fallback. Whichever one takes the photo, it goes through enqueue()
          and gets the same numbering, the same retry and the same saving
          count — there is one pipeline, not two. */}
      <SnapshotCamera
        onCapture={(file) => enqueue([file])}
        fallback={
          <label className="flex min-h-[64px] cursor-pointer select-none flex-col items-center justify-center gap-0.5 rounded-md border-2 border-dashed border-line-strong bg-inset px-4 py-3 text-center transition-colors hover:border-accent">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="sr-only"
              onChange={(e) => {
                accept(e.target.files);
                // Clearing the value is what makes the NEXT tap reopen the
                // camera. Without it the input holds the last file and
                // re-picking the same name fires no change event at all —
                // the shutter silently stops working mid-run.
                e.target.value = "";
              }}
            />
            <span className="text-[13.5px] font-bold text-fg">Use the phone camera app instead</span>
            <span className="text-[11.5px] text-fg-subtle">One photo per tap</span>
          </label>
        }
      />

      {/* The only status this page shows: enough that it does not look
          broken while photos are in flight, and nothing more. The bar is not
          rendered at all when there is nothing in flight — an empty strip
          under the camera would just be chrome. */}
      {(workingCount > 0 || failedCount > 0) && (
        <div className="border-b border-line-strong bg-card px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
            {workingCount > 0 && (
              <span className="text-fg-muted">
                <span className="crm-num">{workingCount}</span> saving…
              </span>
            )}
            {failedCount > 0 && (
              <>
                <span className="font-bold text-bad">
                  <span className="crm-num">{failedCount}</span> failed — still on this device
                </span>
                <button
                  type="button"
                  onClick={retryAll}
                  className="rounded-md border border-bad/50 bg-bad-bg px-2.5 py-1 text-[12px] font-bold text-bad hover:border-bad"
                >
                  Retry
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── THE LIST ───────────────────────────────────────────────── */}
      <div className="flex-1">
        {error && (
          <p className="m-3 rounded-md border border-bad/30 bg-bad-bg px-2.5 py-1.5 text-[12px] font-semibold text-bad">
            {error}
          </p>
        )}

        {truncated && (
          <p className="m-3 rounded-md border border-warn/30 bg-warn-bg px-2.5 py-1.5 text-[12px] font-semibold text-warn">
            Showing the newest 2000. Older photos are still stored and still numbered.
          </p>
        )}

        {rows.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-[13.5px] font-bold text-fg">No photos yet</p>
            <p className="mx-auto mt-1 max-w-[42ch] text-[12.5px] text-fg-subtle">
              The first one will be <span className="crm-num">#1</span>.
            </p>
          </div>
        ) : (
          <ul className="m-3 overflow-hidden rounded-md border border-line bg-card">
            {rows.map((row) => {
              const done = row.parse;
              return (
                <li
                  key={row.id}
                  /* THE GREEN CARD. `bg-ok` is the palette's success green
                     (#0f7a4e) — 5.4:1 against the white list, which is
                     "decently dark but not too dark" without inventing a
                     hex. An unparsed row is untouched: the green is the
                     signal that work has happened, so it only means
                     something while most rows do not have it. */
                  className={`border-t border-line first:border-t-0 ${
                    done ? "bg-ok text-white" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 px-3 py-2">
                    <span
                      className={`w-[54px] shrink-0 text-[13px] font-extrabold crm-num ${
                        done ? "text-white" : "text-fg"
                      }`}
                    >
                      #{row.number}
                    </span>
                    <span
                      className={`min-w-0 flex-1 truncate text-[12.5px] ${
                        done ? "text-white" : "text-fg"
                      }`}
                    >
                      {row.fileName}
                    </span>
                    <span
                      className={`shrink-0 text-[11.5px] ${done ? "text-white/70" : "text-fg-subtle"}`}
                    >
                      {stamp(row.createdAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => remove(row)}
                      disabled={busyId === row.id}
                      className={`shrink-0 text-[12px] font-bold hover:underline disabled:opacity-50 ${
                        done ? "text-white/80" : "text-bad"
                      }`}
                    >
                      {busyId === row.id ? "…" : "Delete"}
                    </button>
                  </div>

                  {/* THE PARSE RESULT — a second line rather than more
                      columns on the first. Brent shoots and checks these on
                      a phone: four things already share that row, and three
                      more would either truncate the filename to nothing or
                      push the Delete button off a 375px screen. Wrapping
                      is what a narrow screen needs, and it costs a desktop
                      reader nothing. */}
                  {done && (
                    <div /* Indented to line up under the filename on a wide screen,
                         flush left on a phone: the 66px of alignment is
                         worth less at 375px than fitting all three
                         figures on one line. */
                      className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t border-white/20 px-3 py-1.5 sm:pl-[66px]">
                      <Stat label="phone numbers" value={done.phones} />
                      <Stat label={done.companies === 1 ? "company" : "companies"} value={done.companies} />
                      <Stat label="parse score" value={done.score} outOf={100} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
