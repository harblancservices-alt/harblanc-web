"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createLoadDocUploadUrl,
  recordLoadDocuments,
  deleteLoadDocument,
  type RecordDoc,
} from "../actions";
import { uploadFileToSignedUrl } from "@/lib/storage/client-upload";

export type LoadDoc = {
  id: string;
  kind: string;
  name: string;
  url: string | null;
  /** Small WebP thumbnail signed URL; falls back to `url` on the server. */
  thumbUrl: string | null;
  sizeBytes: number | null;
  mime: string | null;
};

const KINDS: { kind: string; label: string }[] = [
  { kind: "rate_con", label: "Rate confirmation" },
  { kind: "bol", label: "Bill of lading" },
  { kind: "pod", label: "Proof of delivery" },
];

// image/* (with NO capture attribute) is what makes mobile offer
// Take Photo / Photo Library / Choose File; application/pdf adds PDFs. Same
// setup Brent liked on the maintenance receipt uploader.
const ACCEPT = "image/*,application/pdf";

/**
 * Documents card — one block per paperwork type (rate con / BOL / POD). Each
 * supports MULTIPLE photos/files (multi-angle freight shots), uploaded via
 * the camera/library/file picker, shown back as thumbnails with view + delete.
 */
export function DocumentsCard({
  loadId,
  docs,
}: {
  loadId: string;
  docs: LoadDoc[];
}) {
  const [viewing, setViewing] = useState<LoadDoc | null>(null);

  return (
    <section className="overflow-hidden rounded-md border border-line bg-card">
      <header className="border-b border-line bg-card/70 px-3 py-2">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-fg-muted">
          Documents
        </p>
      </header>
      <div className="px-3">
        {KINDS.map((k, i) => (
          <DocKindBlock
            key={k.kind}
            loadId={loadId}
            kind={k.kind}
            label={k.label}
            docs={docs.filter((d) => d.kind === k.kind)}
            last={i === KINDS.length - 1}
            onView={setViewing}
          />
        ))}
      </div>

      {viewing ? (
        <DocViewer doc={viewing} onClose={() => setViewing(null)} />
      ) : null}
    </section>
  );
}

function isImageDoc(doc: LoadDoc): boolean {
  return (doc.mime ?? "").startsWith("image/");
}

function DocKindBlock({
  loadId,
  kind,
  label,
  docs,
  last,
  onView,
}: {
  loadId: string;
  kind: string;
  label: string;
  docs: LoadDoc[];
  last: boolean;
  onView: (doc: LoadDoc) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onPick(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    const n = files.length;
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      // Direct-to-storage: upload each file's bytes via a signed upload URL
      // (bypasses the server-action / Vercel body limit), then record the rows.
      const recorded: RecordDoc[] = [];
      for (const f of files) {
        const urlRes = await createLoadDocUploadUrl(loadId, f.name, f.type, f.size);
        if (!urlRes.ok) {
          setErr(urlRes.reason);
          return;
        }
        const upRes = await uploadFileToSignedUrl(
          urlRes.bucket,
          urlRes.path,
          urlRes.token,
          f,
        );
        if (!upRes.ok) {
          setErr(`Upload failed ("${f.name}"): ${upRes.reason}`);
          return;
        }
        recorded.push({
          storagePath: urlRes.path,
          originalFilename: f.name,
          mimeType: f.type,
          sizeBytes: f.size,
        });
      }
      const recRes = await recordLoadDocuments(loadId, kind, recorded);
      if (!recRes.ok) {
        setErr(recRes.reason);
        return;
      }
      setOk(`Saved ${n} file${n === 1 ? "" : "s"}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function onDelete(doc: LoadDoc) {
    if (!window.confirm(`Delete this ${label.toLowerCase()} file?`)) return;
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await deleteLoadDocument(doc.id, loadId);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const hasDocs = docs.length > 0;

  return (
    <div className={last ? "py-2.5" : "border-b border-line py-2.5"}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {hasDocs ? (
            <CheckIcon />
          ) : (
            <span className="h-[15px] w-[15px] shrink-0 rounded-full border border-line-strong" />
          )}
          <span className="text-[13px] text-fg">{label}</span>
          {hasDocs ? (
            <span className="shrink-0 rounded-full bg-elevated px-1.5 py-[1px] font-mono text-[10px] font-bold tabular-nums text-fg-muted">
              {docs.length}
            </span>
          ) : null}
        </span>

        <span className="shrink-0">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="rounded-md border border-red-700 bg-red-600 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "Uploading…" : hasDocs ? "+ Add" : "+ Add photo / file"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => onPick(e.target.files)}
          />
        </span>
      </div>

      {hasDocs ? (
        <div className="mt-2 space-y-1.5">
          {/* One compact row per file: type chip + name + View + Delete. No
              image preview is rendered — View opens the doc in the viewer. */}
          {docs.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-2 rounded-md border border-line bg-elevated px-2 py-1"
            >
              <span className="shrink-0 rounded-sm bg-card px-1.5 py-[1px] font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-fg-muted">
                {isImageDoc(d) ? "IMG" : "PDF"}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-fg">
                {d.name}
              </span>
              <button
                type="button"
                onClick={() => onView(d)}
                className="shrink-0 rounded-md border border-blue-700 bg-blue-600 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-white transition-colors hover:bg-blue-700"
              >
                View
              </button>
              <button
                type="button"
                onClick={() => onDelete(d)}
                disabled={busy}
                aria-label={`Delete ${d.name}`}
                className="shrink-0 rounded-md border border-red-700 bg-red-600 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {ok ? (
        <p
          className="mt-1.5 text-[11px] font-semibold text-green-700"
          role="status"
        >
          ✓ {ok}
        </p>
      ) : null}

      {err ? (
        <p className="mt-1.5 text-[11px] text-red-700" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}

function DocViewer({ doc, onClose }: { doc: LoadDoc; onClose: () => void }) {
  const isImage = isImageDoc(doc);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-line bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-line bg-elevated px-3.5 py-2">
          <span className="truncate font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-fg">
            {doc.name}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            {doc.url ? (
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-md border border-red-700 bg-red-600 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-red-700"
              >
                Open ↗
              </a>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-red-300 bg-card text-[16px] font-bold leading-none text-red-700 transition-colors hover:bg-red-50"
            >
              ×
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-canvas">
          {doc.url ? (
            isImage ? (
              <img src={doc.url} alt={doc.name} className="mx-auto block max-w-full" />
            ) : (
              <iframe
                src={doc.url}
                title={doc.name}
                className="h-[70vh] w-full"
              />
            )
          ) : (
            <p className="p-6 text-center text-[13px] text-fg-subtle">
              Preview unavailable.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <span className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}
