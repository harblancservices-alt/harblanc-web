"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createLoadDocUploadUrl,
  recordLoadDocuments,
  deleteLoadDocument,
} from "@/actions/tms-v2/documents";
import type { RecordDoc } from "@/lib/domain/load-documents";
import { uploadFileToSignedUrl } from "@/lib/storage/client-upload";
import type { LoadDocumentItem } from "@/lib/data/loads";
import { IconTrash } from "@/lib/nav/icons";
import { BolSigner, type BolRole } from "./BolSigner";
import { BolScanner } from "./BolScanner";

/**
 * Load Detail's Documents section — direct-to-storage upload (V1's signed-
 * URL primitive, ported unchanged via actions/tms-v2/documents.ts), a flat
 * per-kind list, delete, BOL receiver/carrier e-signature, and (Phase 5C)
 * camera-first capture per doc type: BOL gets V1's in-browser scan+dewarp
 * (ported unchanged) with a plain file-picker fallback; POD gets a rear-
 * camera confirm step before the shutter opens, since it's the doc a
 * driver captures standing at the dock, one-handed, every delivery.
 */

const KINDS: { kind: string; label: string }[] = [
  { kind: "rate_con", label: "Rate confirmation" },
  { kind: "bol", label: "Bill of lading" },
  { kind: "pod", label: "Proof of delivery" },
];

const ACCEPT = "image/*,application/pdf";

export function DocumentsSection({ loadId, docs }: { loadId: string; docs: LoadDocumentItem[] }) {
  const [signing, setSigning] = useState<{ doc: LoadDocumentItem; role: BolRole } | null>(null);
  const [scanning, setScanning] = useState(false);

  function handleSign(doc: LoadDocumentItem, role: BolRole) {
    const anchorId = doc.signedFromDocId ?? doc.id;
    const original = docs.find((o) => o.id === anchorId) ?? doc;
    setSigning({ doc: original, role });
  }

  return (
    <div className="flex flex-col gap-3">
      {KINDS.map((k) => (
        <DocKindBlock
          key={k.kind}
          loadId={loadId}
          kind={k.kind}
          label={k.label}
          docs={docs.filter((d) => d.kind === k.kind)}
          onSign={handleSign}
          onScan={k.kind === "bol" ? () => setScanning(true) : undefined}
        />
      ))}

      {signing ? (
        <BolSigner loadId={loadId} doc={signing.doc} role={signing.role} onClose={() => setSigning(null)} />
      ) : null}
      {scanning ? <BolScanner loadId={loadId} onClose={() => setScanning(false)} /> : null}
    </div>
  );
}

function isImageDoc(d: LoadDocumentItem): boolean {
  return (d.mime ?? "").startsWith("image/");
}

const BOL_ROLES: { key: BolRole; label: string; short: string }[] = [
  { key: "receiver", label: "Receiver", short: "Rcv" },
  { key: "carrier", label: "Carrier", short: "Car" },
];

function DocKindBlock({
  loadId,
  kind,
  label,
  docs,
  onSign,
  onScan,
}: {
  loadId: string;
  kind: string;
  label: string;
  docs: LoadDocumentItem[];
  onSign: (doc: LoadDocumentItem, role: BolRole) => void;
  onScan?: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [askCamera, setAskCamera] = useState(false);

  const isPod = kind === "pod";
  const isBol = kind === "bol";

  async function onPick(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const recorded: RecordDoc[] = [];
      for (const f of files) {
        const urlRes = await createLoadDocUploadUrl(loadId, f.name, f.type, f.size);
        if (!urlRes.ok) {
          setErr(urlRes.reason);
          return;
        }
        const upRes = await uploadFileToSignedUrl(urlRes.bucket, urlRes.path, urlRes.token, f);
        if (!upRes.ok) {
          setErr(`Upload failed ("${f.name}"): ${upRes.reason}`);
          return;
        }
        recorded.push({ storagePath: urlRes.path, originalFilename: f.name, mimeType: f.type, sizeBytes: f.size });
      }
      const recRes = await recordLoadDocuments(loadId, kind, recorded);
      if (!recRes.ok) {
        setErr(recRes.reason);
        return;
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function onDelete(doc: LoadDocumentItem) {
    if (!confirm(`Delete "${doc.name}"? This can't be undone.`)) return;
    const res = await deleteLoadDocument(doc.id, loadId);
    if (!res.ok) {
      setErr(res.reason);
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-md border border-line px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-fg">
          {docs.length > 0 ? (
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ok text-[10px] font-bold text-white" aria-hidden>
              ✓
            </span>
          ) : (
            <span className="h-4 w-4 shrink-0 rounded-full border-2 border-line-strong" aria-hidden />
          )}
          {label}
          {docs.length > 0 ? (
            <span className="rounded-full bg-elevated px-1.5 py-0.5 text-[11px] font-semibold text-fg-muted">{docs.length}</span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {isBol ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="h-7 rounded-md border border-accent bg-accent px-2.5 text-[12px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              + Add file
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => (isBol ? onScan?.() : isPod ? setAskCamera(true) : inputRef.current?.click())}
            disabled={busy}
            className="h-7 rounded-md border border-accent bg-accent px-2.5 text-[12px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? "Uploading…" : isBol ? "+ Scan" : isPod ? "+ Take photo" : "+ Add"}
          </button>
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={isPod ? "image/*" : ACCEPT}
          capture={isPod ? "environment" : undefined}
          multiple
          className="hidden"
          onChange={(e) => onPick(e.target.files)}
        />
      </div>

      {isPod && askCamera ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAskCamera(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Open camera"
            className="w-full max-w-xs rounded-lg border border-line-strong bg-card p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[15px] font-semibold text-fg">Open camera?</p>
            <p className="mt-1 text-[12px] text-fg-muted">Take a proof-of-delivery photo with your camera.</p>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAskCamera(false)}
                className="h-8 rounded-md border border-line-strong bg-card px-3 text-[13px] font-medium text-fg hover:bg-elevated"
              >
                No
              </button>
              <button
                type="button"
                onClick={() => {
                  setAskCamera(false);
                  inputRef.current?.click();
                }}
                className="h-8 rounded-md border border-accent bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover"
              >
                Open camera
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {docs.length > 0 ? (
        <div className="mt-2 flex flex-col gap-1.5">
          {docs.map((d) => (
            <div key={d.id} className="rounded-md bg-elevated px-2.5 py-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="shrink-0 rounded-sm bg-card px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide text-fg-muted">
                  {isImageDoc(d) ? "IMG" : "PDF"}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg">{d.name}</span>
                {d.signedRoles.length > 0 ? (
                  <span className="shrink-0 rounded-full bg-ok-bg px-2 py-[1px] text-[10px] font-medium text-ok">
                    Signed: {d.signedRoles.join(" + ")}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex items-center justify-end gap-1.5">
                {d.url ? (
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-6 shrink-0 items-center rounded-md bg-info px-2 text-[11px] font-medium text-white hover:bg-info-hover"
                  >
                    View
                  </a>
                ) : null}
                {kind === "bol"
                  ? BOL_ROLES.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => onSign(d, r.key)}
                        className="h-6 shrink-0 rounded-md bg-info px-2 text-[11px] font-medium text-white hover:bg-info-hover"
                      >
                        {d.signedRoles.includes(r.key) ? `Re-sign ${r.short}` : `Sign ${r.short}`}
                      </button>
                    ))
                  : null}
                <button
                  type="button"
                  onClick={() => onDelete(d)}
                  aria-label="Delete"
                  title="Delete"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-bad text-white hover:opacity-90"
                >
                  <IconTrash className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {err ? <p className="mt-1.5 text-[12px] text-bad">{err}</p> : null}
    </div>
  );
}
