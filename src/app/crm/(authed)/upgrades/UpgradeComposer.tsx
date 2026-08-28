"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Card, CardHead, BTN_PRIMARY } from "../_shell/ui";
import { LABEL, CONTROL, CONTROL_SIZE } from "../_shell/compactForm";
import { IconX, IconCheck } from "../_shell/icons";
import { createUpgradeRequest, type NewAttachment } from "./actions";

const STORAGE_BUCKET = "crm-documents";
/** A screenshot far above this is a photo of a screen, not a screenshot. */
const MAX_BYTES = 10 * 1024 * 1024;

/** Path segments can't contain arbitrary characters — same rule as
 * BolSection/CommodityPhotoTiles's sanitizeFileName. */
function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.length > 150 ? cleaned.slice(-150) : cleaned;
}

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type PendingFile = {
  key: string;
  file: File;
  previewUrl: string;
  /** Only ever set while a submit is in flight. */
  state: "ready" | "uploading" | "uploaded" | "failed";
};

/**
 * The Upgrades composer — title, details, and screenshots.
 *
 * TWO BUGS SHAPED THIS FILE, both about a screenshot going missing.
 *
 * 1. PASTE USED TO DEPEND ON FOCUS. The paste handler sat on the dashed drop
 *    zone (a div with tabIndex=0), so Ctrl+V only worked while that exact
 *    div held focus. Measured against the old build: pasting while the
 *    cursor was in Details captured nothing, in Title nothing, with nothing
 *    focused nothing — silently, every time. The reported symptom ("I pasted
 *    it, then clicked away and it vanished") was really this: the first
 *    paste landed, the user clicked into Details to type, and every paste
 *    after that died with no error and no thumbnail.
 *
 *    The listener is now on the DOCUMENT for as long as the composer is
 *    mounted, so a screenshot is caught wherever the cursor happens to be.
 *    It only ever intercepts clipboard payloads that actually contain an
 *    image, so pasting text into Title or Details still behaves normally.
 *
 * 2. SUBMIT USED TO CLEAR THE FORM EVEN WHEN THE UPLOAD FAILED. The old
 *    sequence created the request row first, then uploaded; a failed upload
 *    left a posted request with no evidence, wiped the composer, and showed
 *    "Posted, but one or more screenshots failed to upload" — with nothing
 *    left to retry from. Now every screenshot is uploaded BEFORE the request
 *    is created, and a failure aborts the submit with everything still on
 *    screen. Nothing is cleared until the server has confirmed the whole
 *    report landed.
 *
 * Object URLs are revoked in exactly two places — removing one file, and
 * unmounting — never on blur, and never while a preview is still on screen.
 */
export function UpgradeComposer({ orgId }: { orgId: string }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const addFiles = useCallback((incoming: FileList | File[] | null) => {
    if (!incoming) return;
    const all = Array.from(incoming);
    const images = all.filter((f) => f.type.startsWith("image/"));

    if (all.length > 0 && images.length === 0) {
      setNotice("That wasn't an image — copy a screenshot and paste again.");
      return;
    }

    const tooBig = images.filter((f) => f.size > MAX_BYTES);
    const usable = images.filter((f) => f.size <= MAX_BYTES);

    if (tooBig.length) {
      setNotice(
        `${tooBig.length === 1 ? "That screenshot is" : `${tooBig.length} screenshots are`} over ${prettyBytes(MAX_BYTES)} and wasn't added.`,
      );
    } else if (usable.length) {
      setNotice(null);
    }

    if (!usable.length) return;

    setPending((prev) => [
      ...prev,
      ...usable.map((file) => ({
        key: `${file.name}-${file.size}-${file.lastModified}-${prev.length}-${crypto.randomUUID()}`,
        file,
        previewUrl: URL.createObjectURL(file),
        state: "ready" as const,
      })),
    ]);
    setPosted(false);
  }, []);

  /**
   * Document-level paste. Scoped by MOUNT rather than by focus: this
   * component only exists on the Upgrades page, so listening broadly here
   * cannot affect anything else, and it is the only way a paste is caught no
   * matter which field the cursor is in.
   */
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items || items.length === 0) return;

      const images: File[] = [];
      let sawAnyFile = false;
      for (const item of Array.from(items)) {
        if (item.kind !== "file") continue;
        sawAnyFile = true;
        if (!item.type.startsWith("image/")) continue;
        const file = item.getAsFile();
        if (file) images.push(file);
      }

      if (images.length) {
        e.preventDefault();
        addFiles(images);
        return;
      }

      // A file was pasted but none of it was an image — say so, because
      // silence here is the whole original complaint.
      if (sawAnyFile) {
        setNotice("That wasn't an image — copy a screenshot and paste again.");
        return;
      }

      // Plain text on the clipboard: leave the event completely alone so
      // pasting into Title or Details still works as normal.
    }

    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [addFiles]);

  /**
   * Revoke previews only when the composer itself goes away.
   *
   * The ref is written in an effect rather than during render — mutating it
   * inline would be a render side effect, and under the React Compiler a
   * render can be discarded or replayed, which would leave this holding a
   * list that was never committed and revoke a URL still on screen. Exactly
   * the class of lifecycle bug this file exists to fix.
   */
  const pendingRef = useRef<PendingFile[]>([]);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(() => {
    return () => {
      pendingRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, []);

  function removePending(key: string) {
    setPending((prev) => {
      const found = prev.find((p) => p.key === key);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((p) => p.key !== key);
    });
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }

  async function submit() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Tell us what you'd like changed or removed.");
      return;
    }
    setError(null);
    setNotice(null);
    setPosted(false);
    setSubmitting(true);

    // The id is generated here so each screenshot can go straight to its
    // final path before the request exists. Nothing is written to the
    // database until every upload has succeeded.
    const requestId = crypto.randomUUID();
    const supabase = createSupabaseBrowserClient();
    const uploaded: NewAttachment[] = [];
    const uploadedPaths: string[] = [];

    setPending((prev) => prev.map((p) => ({ ...p, state: "uploading" as const })));

    for (const p of pending) {
      const storagePath = `${orgId}/upgrades/${requestId}/${crypto.randomUUID()}-${sanitizeFileName(p.file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, p.file, { contentType: p.file.type || undefined, upsert: false });

      if (uploadError) {
        // STOP. Do not create the request, do not clear anything. The user
        // keeps their text and every screenshot and can press Post again.
        setPending((prev) =>
          prev.map((x) => ({ ...x, state: x.key === p.key ? "failed" : "ready" })),
        );
        if (uploadedPaths.length) {
          await supabase.storage.from(STORAGE_BUCKET).remove(uploadedPaths);
        }
        setSubmitting(false);
        setError(
          `"${p.file.name}" didn't upload, so nothing was submitted. Your report is still here — check your connection and press Post again.`,
        );
        return;
      }

      uploadedPaths.push(storagePath);
      uploaded.push({
        fileName: p.file.name,
        storagePath,
        mimeType: p.file.type || null,
        sizeBytes: p.file.size,
      });
      setPending((prev) => prev.map((x) => (x.key === p.key ? { ...x, state: "uploaded" } : x)));
    }

    const created = await createUpgradeRequest({
      id: requestId,
      title: trimmedTitle,
      body: body.trim() || null,
      attachments: uploaded,
    });

    if (!created.ok) {
      // The request did not persist, so the screenshots that went up with it
      // are orphans — take them back out rather than leave them in the
      // bucket forever.
      if (uploadedPaths.length) {
        await supabase.storage.from(STORAGE_BUCKET).remove(uploadedPaths);
      }
      setPending((prev) => prev.map((p) => ({ ...p, state: "ready" as const })));
      setSubmitting(false);
      setError(created.error);
      return;
    }

    // Only now — everything is on the server.
    pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setTitle("");
    setBody("");
    setPending([]);
    setSubmitting(false);
    setPosted(true);
    router.refresh();
  }

  const shotCount = pending.length;

  return (
    <Card>
      <CardHead title="New request" hint="Visible to the whole team — Brent sees every request" />
      <div className="flex flex-col gap-2 p-4">
        {error && (
          <p
            role="alert"
            className="rounded-[5px] border border-bad/30 bg-bad-bg px-2.5 py-2 text-[12.5px] text-bad"
          >
            {error}
          </p>
        )}
        {posted && !error && (
          <p
            role="status"
            className="flex items-center gap-1.5 rounded-[5px] border border-ok/30 bg-ok-bg px-2.5 py-2 text-[12.5px] font-semibold text-ok"
          >
            <IconCheck width={14} height={14} />
            Request submitted — it&apos;s on the board below.
          </p>
        )}
        {notice && !error && (
          <p className="rounded-[5px] border border-warn/30 bg-warn-bg px-2.5 py-2 text-[12.5px] text-warn">
            {notice}
          </p>
        )}

        <label className="flex w-full flex-col gap-1">
          <span className={LABEL}>
            What do you want changed or removed?<span className="ml-1 text-accent">*</span>
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Remove the old Pipeline tab from Companies"
            className={`w-full min-w-0 ${CONTROL_SIZE} ${CONTROL}`}
          />
        </label>

        <label className="flex w-full flex-col gap-1">
          <span className={LABEL}>Details (optional)</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="What went wrong, and what you expected to happen instead"
            className={`w-full min-w-0 resize-y py-1.5 leading-snug sm:py-1 ${CONTROL} text-[13.5px] sm:text-[12.5px]`}
          />
        </label>

        <div className="flex flex-col gap-1">
          <span className={LABEL}>
            Screenshots
            {shotCount > 0 && (
              <span className="ml-1.5 font-semibold text-fg-muted">
                · {shotCount} attached
              </span>
            )}
          </span>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors ${
              dragOver ? "border-accent bg-accent-bg" : "border-line-strong"
            }`}
          >
            <p className="text-[13px] font-medium text-fg">
              Press Ctrl/Cmd+V anywhere on this page to paste a screenshot
            </p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex h-9 items-center rounded-lg bg-accent px-4 text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              Choose files
            </button>
            <p className="text-[12px] text-fg-subtle">
              or drag them here · images up to {prettyBytes(MAX_BYTES)}
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {shotCount > 0 && (
            <div className="mt-1 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {pending.map((p) => (
                <div
                  key={p.key}
                  className={`group relative aspect-square overflow-hidden rounded-lg border bg-inset ${
                    p.state === "failed" ? "border-bad" : "border-line-strong"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.previewUrl} alt={p.file.name} className="h-full w-full object-cover" />

                  {p.state === "uploading" && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[10px] font-bold uppercase tracking-wide text-white">
                      Uploading
                    </span>
                  )}
                  {p.state === "uploaded" && (
                    <span className="absolute inset-0 flex items-center justify-center bg-ok/70 text-white">
                      <IconCheck width={18} height={18} />
                    </span>
                  )}
                  {p.state === "failed" && (
                    <span className="absolute inset-0 flex items-center justify-center bg-bad/75 text-[10px] font-bold uppercase tracking-wide text-white">
                      Failed
                    </span>
                  )}

                  {!submitting && (
                    <button
                      type="button"
                      onClick={() => removePending(p.key)}
                      aria-label={`Remove ${p.file.name}`}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-lg:h-8 max-lg:w-8 max-lg:opacity-70"
                    >
                      <IconX width={12} height={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors disabled:opacity-60 ${BTN_PRIMARY}`}
          >
            {submitting ? "Posting…" : "Post request"}
          </button>
        </div>
      </div>
    </Card>
  );
}
