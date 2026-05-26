"use client";

import { useRef, useState, useTransition } from "react";
import {
  uploadIntakeDocument,
  deleteIntakeUpload,
} from "./upload-actions";

/**
 * Customer-facing Documents & Photos uploader for the intake page.
 *
 * Lives below the main intake form. The customer can:
 *   - Drop / select images (jpg, png, webp) and PDF documents
 *   - Attach an optional note that applies to the next upload batch
 *   - Remove an upload they regret
 *
 * Each file is uploaded in its own server-action call so a partial
 * failure (one file too large, one wrong type) doesn't tear down the
 * whole batch — the customer sees per-file success/failure and the
 * good ones land. Optimistic UI: the local list shows what just
 * uploaded without waiting for a page refresh, but the underlying
 * persistence is the source of truth (revalidatePath in the action
 * refreshes the server-rendered list on next nav).
 */

export type IntakeUploadRow = {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  note: string | null;
  createdAt: string;
};

type LocalUploadRow = IntakeUploadRow & {
  /** Local-only marker so we can mark this row "uploading" before the
   *  server returns. Server-loaded rows are always false. */
  pending?: boolean;
  /** Tracks delete-in-flight per row. */
  deleting?: boolean;
};

const ACCEPT_ATTR = "image/jpeg,image/png,image/webp,application/pdf";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}

export function IntakeUploads({
  token,
  initialUploads,
  disabled,
  referenceLinksDefault,
}: {
  token: string;
  initialUploads: IntakeUploadRow[];
  /** Hide the upload affordance when the estimate is declined / dead. */
  disabled?: boolean;
  /** Optional reference-links textarea default. When provided, the
   *  uploader renders a `<textarea name="reference_links">` after the
   *  file list — same FormData name the server action already reads.
   *  No new server-side persistence layer is added: the textarea is a
   *  plain child of the parent intake <form>. */
  referenceLinksDefault?: string;
}) {
  const [uploads, setUploads] = useState<LocalUploadRow[]>(initialUploads);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function pickFiles() {
    fileInputRef.current?.click();
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);

    const files = Array.from(fileList);
    // Snapshot the note that applies to this batch, then clear it so
    // the next batch can carry a different one.
    const batchNote = note.trim();
    setNote("");

    startTransition(async () => {
      for (const file of files) {
        // Optimistic placeholder row.
        const tempId = `pending-${crypto.randomUUID()}`;
        const placeholder: LocalUploadRow = {
          id: tempId,
          originalFilename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          note: batchNote.length > 0 ? batchNote : null,
          createdAt: new Date().toISOString(),
          pending: true,
        };
        setUploads((prev) => [placeholder, ...prev]);

        const fd = new FormData();
        fd.append("file", file);
        if (batchNote.length > 0) fd.append("note", batchNote);
        const result = await uploadIntakeDocument(token, fd);

        if (!result.ok) {
          setError(`${file.name}: ${result.reason}`);
          setUploads((prev) => prev.filter((u) => u.id !== tempId));
          continue;
        }

        // Replace placeholder with the real row id from the server.
        setUploads((prev) =>
          prev.map((u) =>
            u.id === tempId
              ? { ...u, id: result.uploadId, pending: false }
              : u,
          ),
        );
      }
    });
  }

  async function removeUpload(uploadId: string) {
    if (!confirm("Remove this upload?")) return;
    setError(null);
    setUploads((prev) =>
      prev.map((u) => (u.id === uploadId ? { ...u, deleting: true } : u)),
    );

    startTransition(async () => {
      const result = await deleteIntakeUpload(token, uploadId);
      if (!result.ok) {
        setError(`Remove failed: ${result.reason}`);
        setUploads((prev) =>
          prev.map((u) =>
            u.id === uploadId ? { ...u, deleting: false } : u,
          ),
        );
        return;
      }
      setUploads((prev) => prev.filter((u) => u.id !== uploadId));
    });
  }

  return (
    // Matches IntakeForm's sectionCls so Documents & Photos reads as
    // another section of the same form, not a separate widget.
    <section className="border-l-4 border-l-red-600 bg-[#1a1a1a] p-5 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.7)] sm:p-6">
      <header>
        {/* Title rests on the card's red 4px left strip — no inline
            accent bar needed (would be a redundant brand mark). */}
        <h2 className="font-mono text-[13px] font-bold uppercase tracking-[0.18em] text-white">
          Documents &amp; Photos
        </h2>
        <p className="mt-1.5 font-mono text-[11px] leading-snug text-zinc-500">
          Optional supporting files — used by dispatch to verify freight
          details before scheduling.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-300">
          Attach freight photos, weight tickets, spec sheets, or
          pickup/delivery paperwork. JPG, PNG, WEBP, or PDF up to
          15&nbsp;MB per file.
        </p>
      </header>

      {!disabled ? (
        <>
          {/* Optional note that applies to the next upload batch. */}
          <label className="mt-5 block">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-300">
              Note for next upload (optional)
            </span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                // The uploader now lives inside the intake <form>, so
                // an Enter press here would otherwise bubble up and
                // submit the whole intake. The note is a label for the
                // next upload batch — it must never trigger a submit.
                if (e.key === "Enter") e.preventDefault();
              }}
              placeholder="e.g. shipper paperwork, freight from front"
              className="mt-2 block w-full border border-[#3a3a3a] bg-[#2e2e2e] px-3 py-3 text-sm text-white placeholder:text-neutral-500 transition-colors focus:border-red-600 focus:outline-none"
              maxLength={200}
            />
          </label>

          {/* Add-files button kept solid red — it IS the primary action
              of the uploader. The page-level Call dispatch CTA is
              outlined-red, so the two reds don't both shout at the
              customer at the same time. */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={pickFiles}
              disabled={isPending}
              className="inline-flex items-center gap-2 border border-red-700 bg-transparent px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-red-300 transition-colors hover:border-red-500 hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Uploading…" : "Add files"}
            </button>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
              JPG &middot; PNG &middot; WEBP &middot; PDF
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            onChange={(e) => {
              void handleFiles(e.target.files);
              // Reset so the same file can be re-selected if the customer
              // removed it and changed their mind.
              e.target.value = "";
            }}
            className="sr-only"
            aria-hidden
          />

          {error ? (
            <p className="mt-3 border border-red-800 bg-red-950/40 px-3 py-2 font-mono text-[11px] font-semibold tracking-wide text-red-200">
              {error}
            </p>
          ) : null}
        </>
      ) : null}

      {/* Upload list. Empty state, optimistic rows, and confirmed
          rows all share one rendering pass. */}
      <div className="mt-5">
        {uploads.length === 0 ? (
          <p className="border border-[#3a3a3a]/60 bg-[#2e2e2e] px-4 py-5 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            No files attached &middot; optional
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {uploads.map((u) => (
              <li
                key={u.id}
                className={
                  "flex items-start gap-3 border border-[#3a3a3a] bg-[#2e2e2e] px-3 py-3 " +
                  (u.pending ? "opacity-60" : "")
                }
              >
                {/* Type icon */}
                <span
                  aria-hidden
                  className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center border border-[#3a3a3a] bg-[#050505] font-mono text-[10px] font-bold uppercase tracking-wide text-red-400"
                >
                  {isImage(u.mimeType) ? "IMG" : "PDF"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {u.originalFilename}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                    {formatSize(u.sizeBytes)}
                    {u.pending ? " · uploading" : ""}
                  </p>
                  {u.note ? (
                    <p className="mt-1 text-xs italic text-zinc-300">
                      {u.note}
                    </p>
                  ) : null}
                </div>
                {!disabled && !u.pending ? (
                  <button
                    type="button"
                    onClick={() => removeUpload(u.id)}
                    disabled={u.deleting}
                    aria-label={`Remove ${u.originalFilename}`}
                    className="shrink-0 border border-neutral-600 bg-transparent px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-200 transition-colors hover:border-red-500 hover:text-red-400 disabled:opacity-50"
                  >
                    {u.deleting ? "Removing" : "Remove"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Optional reference links — moved here from the prior "Notes &
          links" section so all freight-context inputs live in one
          place. The textarea is a plain child of the parent intake
          <form>, so the existing server action keeps reading it from
          formData.get("reference_links") with no wiring changes. */}
      {referenceLinksDefault !== undefined ? (
        <div className="mt-6">
          <label
            htmlFor="reference_links"
            className="block font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-300"
          >
            Reference links
          </label>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Paste any product pages, spec sheets, shared folders, or
            reference links that help dispatch understand the freight.
          </p>
          <textarea
            id="reference_links"
            name="reference_links"
            defaultValue={referenceLinksDefault}
            rows={3}
            placeholder="https://…"
            className="mt-2 block w-full resize-y border border-[#3a3a3a] bg-[#2e2e2e] px-3 py-3 text-base text-white placeholder:text-neutral-500 transition-colors focus:border-red-600 focus:outline-none"
          />
        </div>
      ) : null}
    </section>
  );
}
