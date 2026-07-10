"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createLoadDocUploadUrl,
  recordLoadDocuments,
  deleteLoadDocument,
  type RecordDoc,
} from "../actions";
import { uploadFileToSignedUrl } from "@/lib/storage/client-upload";
import { Button } from "@/components/ui/Button";
import { BolScanner } from "../BolScanner";
import { BolSigner } from "./BolSigner";

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

function isImageDoc(doc: LoadDoc): boolean {
  return (doc.mime ?? "").startsWith("image/");
}

/**
 * A signed BOL is the copy BolSigner writes as "<base> — signed.pdf" (em dash).
 * We tag it from that suffix — the marker we control when saving — so Brent
 * never has to read the truncated filename to tell the two BOLs apart.
 */
function isSignedBol(doc: LoadDoc): boolean {
  return doc.kind === "bol" && /[—–-]\s*signed\.pdf$/i.test(doc.name);
}

function docBaseName(name: string): string {
  return name.replace(/\.(pdf|jpe?g|png|webp|heic)$/i, "").trim();
}

/** "<base> — signed.pdf" → "<base>" so we can find the unsigned original. */
function unsignedBaseName(name: string): string {
  return name.replace(/\s*[—–-]\s*signed\.pdf$/i, "").trim();
}

/**
 * Documents card — one block per paperwork type (rate con / BOL / POD). Rows
 * are tap-to-open; viewing, signing and deleting all happen in the full-screen
 * DocViewer, so the rows themselves stay uncluttered.
 */
export function DocumentsCard({
  loadId,
  docs,
}: {
  loadId: string;
  docs: LoadDoc[];
}) {
  const router = useRouter();
  const [viewing, setViewing] = useState<LoadDoc | null>(null);
  const [signing, setSigning] = useState<LoadDoc | null>(null);

  async function handleDelete(doc: LoadDoc) {
    if (!window.confirm("Delete this document? This can't be undone.")) return;
    await deleteLoadDocument(doc.id, loadId);
    setViewing(null);
    router.refresh();
  }

  // Sign an unsigned BOL, or "Re-sign" — which re-signs the ORIGINAL unsigned
  // BOL (not the already-signed copy, which would stack signatures) when we can
  // match it by base name; otherwise falls back to the doc in hand.
  function handleSign(doc: LoadDoc) {
    let target = doc;
    if (isSignedBol(doc)) {
      const base = unsignedBaseName(doc.name);
      const original = docs.find(
        (o) =>
          o.kind === "bol" &&
          !isSignedBol(o) &&
          docBaseName(o.name) === base,
      );
      if (original) target = original;
    }
    setViewing(null);
    setSigning(target);
  }

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
        <DocViewer
          doc={viewing}
          onClose={() => setViewing(null)}
          onSign={handleSign}
          onDelete={handleDelete}
        />
      ) : null}

      {signing ? (
        <BolSigner
          loadId={loadId}
          doc={signing}
          onClose={() => setSigning(null)}
        />
      ) : null}
    </section>
  );
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
  const [askCamera, setAskCamera] = useState(false);
  const [scanning, setScanning] = useState(false);

  // POD = delivery photos: jump straight to the rear camera (accept="image/*"
  // capture="environment") behind a quick "Open camera?" confirm.
  // BOL = always the in-browser document scanner (no plain file picker).
  // Rate Con keeps the normal photo/library/PDF picker.
  const isPod = kind === "pod";
  const isBol = kind === "bol";

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

        <span className="flex shrink-0 items-center gap-1.5">
          {/* BOL offers BOTH: the in-browser scanner AND a plain file picker
              (pick a gallery photo or a PDF from Files). Both save to the BOL
              via the same signed-upload path. */}
          {isBol ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="rounded-md border border-line-strong bg-elevated px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-fg transition-colors hover:bg-card disabled:opacity-50"
            >
              {busy ? "Uploading…" : "+ Add file"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() =>
              isBol
                ? setScanning(true)
                : isPod
                  ? setAskCamera(true)
                  : inputRef.current?.click()
            }
            disabled={busy}
            className="rounded-md border border-accent bg-accent px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-accent-hover hover:border-accent-hover disabled:opacity-50"
          >
            {busy
              ? "Uploading…"
              : isBol
                ? hasDocs
                  ? "+ Scan"
                  : "+ Scan BOL"
                : isPod
                  ? hasDocs
                    ? "+ Photo"
                    : "+ Take photo"
                  : hasDocs
                    ? "+ Add"
                    : "+ Add photo / file"}
          </button>
          {/* File picker input. BOL uses it for the "+ Add file" path (no
              capture, so mobile offers Photos/Files); POD forces the camera;
              rate con uses the standard photo/library/PDF picker. */}
          <input
            ref={inputRef}
            type="file"
            accept={isPod ? "image/*" : ACCEPT}
            capture={isPod ? "environment" : undefined}
            multiple
            className="hidden"
            onChange={(e) => onPick(e.target.files)}
          />
        </span>
      </div>

      {/* BOL scanner — replaces the file picker for bills of lading. */}
      {scanning ? (
        <BolScanner loadId={loadId} onClose={() => setScanning(false)} />
      ) : null}

      {/* POD-only: "Open camera?" yes/no before launching the rear camera. */}
      {askCamera ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setAskCamera(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Open camera"
            className="w-full max-w-xs rounded-lg border border-line-strong bg-card p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[15px] font-semibold text-fg">Open camera?</p>
            <p className="mt-1 text-[12px] text-fg-muted">
              Take a proof-of-delivery photo with your camera.
            </p>
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="cancel"
                size="sm"
                onClick={() => setAskCamera(false)}
              >
                No
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  setAskCamera(false);
                  inputRef.current?.click();
                }}
              >
                Open Camera
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {hasDocs ? (
        <div className="mt-2 space-y-1.5">
          {/* One tappable row per file — opens the full-screen viewer, where
              Sign / Re-sign / Delete live. Rows carry only a type chip, the
              name, and a "Signed" badge on the signed BOL copy. */}
          {docs.map((d) => {
            const signed = isSignedBol(d);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => onView(d)}
                className="flex w-full items-center gap-2 rounded-md border border-line bg-elevated px-2 py-2 text-left transition-colors hover:bg-card"
              >
                <span className="shrink-0 rounded-sm bg-card px-1.5 py-[1px] font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-fg-muted">
                  {isImageDoc(d) ? "IMG" : "PDF"}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-fg">
                  {d.name}
                </span>
                {signed ? <SignedBadge /> : null}
                <span
                  aria-hidden
                  className="shrink-0 text-[15px] leading-none text-fg-subtle"
                >
                  ›
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {ok ? (
        <p
          className="mt-1.5 text-[11px] font-semibold text-ok"
          role="status"
        >
          ✓ {ok}
        </p>
      ) : null}

      {err ? (
        <p className="mt-1.5 text-[11px] text-bad" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Full-screen document viewer. Fills the whole screen (no floating card),
 * shows the doc large, and carries a fixed action bar: Close + Open in the top
 * bar; Delete and (for BOLs) contextual Sign / Re-sign in the bottom bar.
 */
function DocViewer({
  doc,
  onClose,
  onSign,
  onDelete,
}: {
  doc: LoadDoc;
  onClose: () => void;
  onSign: (doc: LoadDoc) => void;
  onDelete: (doc: LoadDoc) => Promise<void>;
}) {
  const isImage = isImageDoc(doc);
  const isBol = doc.kind === "bol";
  const signed = isSignedBol(doc);
  const [deleting, setDeleting] = useState(false);

  // Lock background scroll while the viewer is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function del() {
    if (deleting) return;
    setDeleting(true);
    try {
      await onDelete(doc);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`View ${doc.name}`}
      className="fixed inset-0 z-[55] flex flex-col bg-black"
    >
      {/* Top bar: Close · name (+ Signed) · Open */}
      <div className="flex items-center gap-2 bg-bar px-3 py-2.5">
        <button
          type="button"
          onClick={onClose}
          className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-bar-fg transition-colors hover:bg-white/10"
        >
          <span className="text-[16px] leading-none">‹</span> Close
        </button>
        <span className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <span className="truncate text-[12px] font-semibold text-bar-fg">
            {doc.name}
          </span>
          {signed ? <SignedBadge /> : null}
        </span>
        {doc.url ? (
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-md px-1.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-bar-fg transition-colors hover:bg-white/10"
          >
            Open ↗
          </a>
        ) : (
          <span className="w-12 shrink-0" />
        )}
      </div>

      {/* Document — large & scrollable/pinchable */}
      <div className="min-h-0 flex-1 overflow-auto bg-neutral-900">
        {doc.url ? (
          isImage ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={doc.url}
              alt={doc.name}
              className="mx-auto block h-auto w-full max-w-4xl"
            />
          ) : (
            <iframe
              src={doc.url}
              title={doc.name}
              className="h-full w-full border-0"
            />
          )
        ) : (
          <p className="p-8 text-center text-[13px] text-white/60">
            Preview unavailable.
          </p>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-bar px-3 py-3">
        <Button
          type="button"
          variant="destructive"
          onClick={del}
          disabled={deleting}
          aria-busy={deleting}
        >
          {deleting ? "Deleting…" : "Delete"}
        </Button>
        {isBol ? (
          <Button type="button" variant="primary" onClick={() => onSign(doc)}>
            {signed ? "Re-sign" : "Sign"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function SignedBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-ok/40 bg-ok/15 px-2 py-[2px] font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-ok">
      <svg
        width="8"
        height="8"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
      Signed
    </span>
  );
}

function CheckIcon() {
  return (
    <span className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full bg-ok text-white">
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}
