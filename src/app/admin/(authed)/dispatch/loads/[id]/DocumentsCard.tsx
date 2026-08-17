"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createLoadDocUploadUrl,
  recordLoadDocuments,
  deleteLoadDocument,
} from "../actions";
import type { RecordDoc } from "@/lib/domain/load-documents";
import { uploadFileToSignedUrl } from "@/lib/storage/client-upload";
import { Button } from "@/components/ui/Button";
import { DocViewer } from "@/components/ui/DocViewer";
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
  /** Roles signed on this BOL (via its original): ["receiver","carrier"]. */
  signedRoles?: string[];
  /** Set on a generated "— signed.pdf": the original doc it was stamped from. */
  signedFromDocId?: string | null;
};

export type BolRole = "receiver" | "carrier";
const BOL_ROLES: { key: BolRole; label: string }[] = [
  { key: "receiver", label: "Receiver" },
  { key: "carrier", label: "Carrier" },
];

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
  const [signing, setSigning] = useState<{ doc: LoadDoc; role: BolRole } | null>(
    null,
  );

  // The viewer owns the confirm step and closes itself — this just deletes at
  // the source and refreshes the card.
  async function handleDelete(doc: LoadDoc) {
    await deleteLoadDocument(doc.id, loadId);
    router.refresh();
  }

  // Always sign the ORIGINAL BOL (resolve it from a signed output via
  // signedFromDocId). The role's signature is stored separately and the signed
  // PDF is regenerated server-side from the original + all roles, so signing
  // one role never disturbs the other.
  function handleSign(doc: LoadDoc, role: BolRole) {
    const anchorId = doc.signedFromDocId ?? doc.id;
    const original = docs.find((o) => o.id === anchorId) ?? doc;
    setViewing(null);
    setSigning({ doc: original, role });
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
          doc={{
            name: viewing.name,
            url: viewing.url,
            isImage: isImageDoc(viewing),
          }}
          onClose={() => setViewing(null)}
          onDelete={() => handleDelete(viewing)}
          badge={
            (viewing.signedRoles ?? []).length > 0 ? (
              <SignedBadge roles={viewing.signedRoles ?? []} />
            ) : null
          }
          actions={
            viewing.kind === "bol" ? (
              <div className="flex items-center gap-1.5">
                {BOL_ROLES.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => handleSign(viewing, r.key)}
                    className="inline-flex h-9 items-center rounded-md border border-white/20 bg-white/[0.08] px-2.5 text-[12px] font-semibold text-bar-fg transition-colors hover:bg-white/15"
                  >
                    {(viewing.signedRoles ?? []).includes(r.key)
                      ? "Re-sign"
                      : "Sign"}{" "}
                    {r.label}
                  </button>
                ))}
              </div>
            ) : null
          }
        />
      ) : null}

      {signing ? (
        <BolSigner
          loadId={loadId}
          doc={signing.doc}
          role={signing.role}
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
              className="rounded-md border border-info bg-info px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-white transition-colors hover:border-info-hover hover:bg-info-hover disabled:opacity-50"
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
              name, and a role-aware "Signed" badge. */}
          {docs.map((d) => (
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
              {d.signedRoles && d.signedRoles.length > 0 ? (
                <SignedBadge roles={d.signedRoles} />
              ) : null}
              <span
                aria-hidden
                className="shrink-0 text-[15px] leading-none text-fg-subtle"
              >
                ›
              </span>
            </button>
          ))}
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

function SignedBadge({ roles }: { roles: string[] }) {
  const labels = roles.map(
    (r) => BOL_ROLES.find((br) => br.key === r)?.label ?? r,
  );
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
      {labels.join(" + ")}
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
