"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createLoadDocUploadUrl,
  recordLoadDocuments,
  deleteLoadDocument,
  type RecordDoc,
} from "@/actions/tms-v2/documents";
import { uploadFileToSignedUrl } from "@/lib/storage/client-upload";
import type { LoadDocumentItem } from "@/lib/data/loads";
import { BolSigner, type BolRole } from "./BolSigner";

/**
 * Load Detail's Documents section — direct-to-storage upload (V1's signed-
 * URL primitive, ported unchanged via actions/tms-v2/documents.ts), a
 * flat per-kind list, delete, and BOL receiver/carrier e-signature. No
 * full-screen DocViewer/in-browser scanner port (v2-design.md's "modernize,
 * don't copy legacy visuals") — View opens the signed URL in a new tab,
 * which is the same affordance the read-only list already had.
 */

const KINDS: { kind: string; label: string }[] = [
  { kind: "rate_con", label: "Rate confirmation" },
  { kind: "bol", label: "Bill of lading" },
  { kind: "pod", label: "Proof of delivery" },
];

const ACCEPT = "image/*,application/pdf";

export function DocumentsSection({ loadId, docs }: { loadId: string; docs: LoadDocumentItem[] }) {
  const [signing, setSigning] = useState<{ doc: LoadDocumentItem; role: BolRole } | null>(null);

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
        />
      ))}

      {signing ? (
        <BolSigner loadId={loadId} doc={signing.doc} role={signing.role} onClose={() => setSigning(null)} />
      ) : null}
    </div>
  );
}

function isImageDoc(d: LoadDocumentItem): boolean {
  return (d.mime ?? "").startsWith("image/");
}

const BOL_ROLES: { key: BolRole; label: string }[] = [
  { key: "receiver", label: "Receiver" },
  { key: "carrier", label: "Carrier" },
];

function DocKindBlock({
  loadId,
  kind,
  label,
  docs,
  onSign,
}: {
  loadId: string;
  kind: string;
  label: string;
  docs: LoadDocumentItem[];
  onSign: (doc: LoadDocumentItem, role: BolRole) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isPod = kind === "pod";

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
    await deleteLoadDocument(doc.id, loadId);
    router.refresh();
  }

  return (
    <div className="rounded-md border border-line px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-fg">
          {label}
          {docs.length > 0 ? <span className="ml-1.5 text-fg-muted">({docs.length})</span> : null}
        </span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="h-7 rounded-md border border-line-strong bg-card px-2.5 text-[12px] font-medium text-fg hover:bg-elevated disabled:opacity-50"
        >
          {busy ? "Uploading…" : isPod ? "+ Photo" : "+ Add"}
        </button>
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

      {docs.length > 0 ? (
        <div className="mt-2 flex flex-col gap-1.5">
          {docs.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-md bg-elevated px-2.5 py-1.5">
              <span className="shrink-0 rounded-sm bg-card px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide text-fg-muted">
                {isImageDoc(d) ? "IMG" : "PDF"}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg">{d.name}</span>
              {d.signedRoles.length > 0 ? (
                <span className="shrink-0 rounded-full bg-ok-bg px-2 py-[1px] text-[10px] font-medium text-ok">
                  Signed: {d.signedRoles.join(" + ")}
                </span>
              ) : null}
              {d.url ? (
                <a href={d.url} target="_blank" rel="noreferrer" className="shrink-0 text-[12px] font-medium text-accent hover:underline">
                  View
                </a>
              ) : null}
              {kind === "bol"
                ? BOL_ROLES.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => onSign(d, r.key)}
                      className="shrink-0 text-[12px] font-medium text-accent hover:underline"
                    >
                      {d.signedRoles.includes(r.key) ? `Re-sign ${r.label}` : `Sign ${r.label}`}
                    </button>
                  ))
                : null}
              <button
                type="button"
                onClick={() => onDelete(d)}
                className="shrink-0 text-[12px] font-medium text-bad hover:underline"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {err ? <p className="mt-1.5 text-[12px] text-bad">{err}</p> : null}
    </div>
  );
}
