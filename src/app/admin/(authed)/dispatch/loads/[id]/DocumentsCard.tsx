"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadLoadDocument, deleteLoadDocument } from "../actions";

export type LoadDoc = {
  id: string;
  kind: string;
  name: string;
  url: string | null;
  sizeBytes: number | null;
  mime: string | null;
};

const KINDS: { kind: string; label: string }[] = [
  { kind: "rate_con", label: "Rate confirmation" },
  { kind: "bol", label: "Bill of lading" },
  { kind: "pod", label: "Proof of delivery" },
];

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

/** Documents card — one fixed row per paperwork type, each with its own upload. */
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
          <DocRow
            key={k.kind}
            loadId={loadId}
            kind={k.kind}
            label={k.label}
            doc={docs.find((d) => d.kind === k.kind) ?? null}
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

function DocViewer({ doc, onClose }: { doc: LoadDoc; onClose: () => void }) {
  const isImage = (doc.mime ?? "").startsWith("image/");
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
                className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-blue-700 hover:underline"
              >
                Open ↗
              </a>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="text-[18px] leading-none text-fg-subtle transition-colors hover:text-fg"
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

function DocRow({
  loadId,
  kind,
  label,
  doc,
  last,
  onView,
}: {
  loadId: string;
  kind: string;
  label: string;
  doc: LoadDoc | null;
  last: boolean;
  onView: (doc: LoadDoc) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onPick(file: File | undefined) {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    setBusy(true);
    setErr(null);
    try {
      const res = await uploadLoadDocument(loadId, fd);
      if (!res.ok) {
        setErr(res.reason);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function onDelete() {
    if (!doc) return;
    if (!window.confirm(`Delete the ${label.toLowerCase()} file?`)) return;
    setBusy(true);
    try {
      await deleteLoadDocument(doc.id, loadId);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={last ? "py-2.5" : "border-b border-line py-2.5"}>
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-2">
        {doc ? (
          <CheckIcon />
        ) : (
          <span className="h-[15px] w-[15px] shrink-0 rounded-full border border-line-strong" />
        )}
        <span className="min-w-0">
          <span className="block text-[13px] text-fg">{label}</span>
          {doc ? (
            <span className="block truncate font-mono text-[10px] text-fg-subtle">
              {doc.name}
            </span>
          ) : null}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-1.5">
        {doc ? (
          <>
            <button
              type="button"
              onClick={() => onView(doc)}
              className="rounded-md border border-line-strong bg-card px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-blue-700 transition-colors hover:bg-elevated"
            >
              View
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="rounded-md border border-red-300 bg-card px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              Delete file
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="rounded-md border border-red-700 bg-red-600 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "Uploading…" : "Upload file"}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
      </span>
    </div>
      {err ? (
        <p className="mt-1.5 text-[11px] text-red-700" role="alert">
          {err}
        </p>
      ) : null}
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
