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
}: {
  token: string;
  initialUploads: IntakeUploadRow[];
  /** Hide the upload affordance when the estimate is declined / dead. */
  disabled?: boolean;
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
    <section className="mt-10 border-t border-neutral-800 pt-10">
      <header>
        <p className="flex items-center gap-3 font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
          <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
          Documents &amp; Photos
        </p>
        <h2 className="mt-3 text-xl font-display tracking-tight text-white sm:text-2xl">
          Attach supporting files
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-neutral-400">
          Optional but helpful — photos of the freight, dimension or
          weight documents, product spec sheets, pickup/delivery
          paperwork, or anything that helps dispatch quote the lane
          accurately. Images (JPG, PNG, WEBP) and PDFs up to 15&nbsp;MB
          each.
        </p>
      </header>

      {!disabled ? (
        <>
          {/* Optional note that applies to the next upload batch. */}
          <label className="mt-6 block">
            <span className="font-mono text-[10px] tracking-[0.22em] text-neutral-400 uppercase">
              Note for next upload (optional)
            </span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. shipper paperwork, freight from front"
              className="mt-2 block w-full border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-red-500 focus:outline-none"
              maxLength={200}
            />
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={pickFiles}
              disabled={isPending}
              className="inline-flex items-center gap-2 border border-red-600 bg-red-600 px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Uploading…" : "Add files"}
            </button>
            <p className="font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase">
              JPG · PNG · WEBP · PDF
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
            <p className="mt-3 border border-red-800 bg-red-950/40 px-3 py-2 font-mono text-[11px] tracking-wide text-red-300">
              {error}
            </p>
          ) : null}
        </>
      ) : null}

      {/* Upload list. Empty state, optimistic rows, and confirmed
          rows all share one rendering pass. */}
      <div className="mt-6">
        {uploads.length === 0 ? (
          <p className="border border-neutral-800 bg-neutral-900/40 px-4 py-6 font-mono text-[11px] tracking-[0.18em] text-neutral-500 uppercase">
            No documents uploaded yet.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {uploads.map((u) => (
              <li
                key={u.id}
                className={
                  "flex items-start gap-3 border border-neutral-800 bg-neutral-900/40 px-3 py-3 " +
                  (u.pending ? "opacity-60" : "")
                }
              >
                {/* Type icon */}
                <span
                  aria-hidden
                  className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center border border-neutral-700 bg-neutral-950 font-mono text-[10px] font-bold uppercase tracking-wide text-red-400"
                >
                  {isImage(u.mimeType) ? "IMG" : "PDF"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {u.originalFilename}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] tracking-wide text-neutral-500 uppercase">
                    {formatSize(u.sizeBytes)}
                    {u.pending ? " · uploading" : ""}
                  </p>
                  {u.note ? (
                    <p className="mt-1 text-xs italic text-neutral-400">
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
                    className="shrink-0 border border-neutral-700 bg-neutral-950 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-300 transition-colors hover:border-red-700 hover:text-red-300 disabled:opacity-50"
                  >
                    {u.deleting ? "Removing" : "Remove"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
