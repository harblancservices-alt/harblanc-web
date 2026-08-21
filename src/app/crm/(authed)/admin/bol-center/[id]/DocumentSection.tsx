"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Card, CardHead, BTN_PRIMARY, BTN_EDIT } from "../../../_shell/ui";
import { getSignedPdfUrl } from "../../../shipments/pdfClient";
import { loadPdfjs } from "@/lib/pdf/pdfjs";
import { attachBolDocument } from "../actions";

const STORAGE_BUCKET = "crm-documents";
const ACCEPT = "application/pdf,image/*";
const THUMB_TARGET_WIDTH = 220;

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.length > 150 ? cleaned.slice(-150) : cleaned;
}

export type BolDocument = { id: string; fileName: string; storagePath: string; mimeType: string | null };

/** Renders a small first-page-only preview so Brent can tell at a glance
 * which document is attached, without opening it. Images render natively
 * (the browser downscales); PDFs get page 1 rasterized small via pdf.js —
 * the same renderer DocViewer's full-screen PdfViewerPages uses, just one
 * page at a fraction of the resolution, since this is a glance-preview, not
 * the read surface. */
function DocumentThumbnail({ signedUrl, isImage, fileName }: { signedUrl: string; isImage: boolean; fileName: string }) {
  const [pdfPageSrc, setPdfPageSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isImage) return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(signedUrl);
        if (!resp.ok) throw new Error("fetch");
        const buf = new Uint8Array(await resp.arrayBuffer());
        const pdfjs = await loadPdfjs();
        const pdfDoc = await pdfjs.getDocument({ data: buf.slice() }).promise;
        const page = await pdfDoc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: THUMB_TARGET_WIDTH / base.width });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(vp.width);
        canvas.height = Math.ceil(vp.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("ctx");
        await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
        if (!cancelled) setPdfPageSrc(canvas.toDataURL("image/png"));
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedUrl, isImage]);

  if (isImage) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={signedUrl} alt={fileName} className="max-h-40 w-auto rounded-md border border-line-strong bg-white object-contain" />;
  }
  if (failed) {
    return <p className="text-[12px] text-fg-subtle">Preview unavailable — the file can still be opened.</p>;
  }
  if (!pdfPageSrc) {
    return <div className="h-40 w-[160px] animate-pulse rounded-md border border-line-strong bg-inset" />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={pdfPageSrc} alt={`${fileName} — page 1`} className="max-h-40 w-auto rounded-md border border-line-strong bg-white object-contain" />;
}

/**
 * The actual BOL image/PDF. Opens in its OWN browser tab/window (real
 * window.open, same mechanism BolSection.tsx's view() already uses) rather
 * than an in-app overlay — Brent needs to flip between the document and the
 * CRM, which a same-tab takeover doesn't allow. The browser's native PDF/
 * image viewer handles zoom once popped out. Reuses the existing
 * "crm-documents" bucket/RLS (no new viewer, no new bucket). Normally this
 * section just displays a document that arrived already attached via the
 * upstream intake; the upload control here is a fallback for a BOL entered
 * without one.
 */
export function DocumentSection({ bolId, orgId, document }: { bolId: string; orgId: string; document: BolDocument | null }) {
  const router = useRouter();
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!document) {
      setSignedUrl(null);
      return;
    }
    let cancelled = false;
    void getSignedPdfUrl(document.storagePath).then((url) => {
      if (!cancelled) {
        setSignedUrl(url);
        if (!url) setError("Could not load this file.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [document]);

  function openInNewWindow() {
    if (!signedUrl) return;
    window.open(signedUrl, "_blank", "noopener,noreferrer");
  }

  async function handleFile(file: File) {
    setError(null);
    if (file.type !== "application/pdf" && !file.type.startsWith("image/")) {
      setError("Only PDF or image files are accepted.");
      return;
    }
    setUploading(true);
    const supabase = createSupabaseBrowserClient();
    const storagePath = `${orgId}/bol-center/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (uploadError) {
      setUploading(false);
      setError("Upload failed. Please try again.");
      return;
    }
    const res = await attachBolDocument(bolId, { fileName: file.name, storagePath, mimeType: file.type || null, sizeBytes: file.size });
    setUploading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <CardHead title="Document" hint={document ? document.fileName : undefined} />
      <div className="flex flex-col gap-3 p-4">
        {error && <p className="text-[12.5px] text-bad">{error}</p>}

        {document ? (
          <>
            {signedUrl ? (
              <DocumentThumbnail signedUrl={signedUrl} isImage={Boolean(document.mimeType?.startsWith("image/"))} fileName={document.fileName} />
            ) : (
              <div className="h-40 w-[160px] animate-pulse rounded-md border border-line-strong bg-inset" />
            )}
            <div>
              <button
                type="button"
                disabled={!signedUrl}
                onClick={openInNewWindow}
                className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-[13px] font-bold transition-colors disabled:opacity-60 ${BTN_PRIMARY}`}
              >
                Open in new window ↗
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <p className="text-[13px] text-fg-muted">No document attached to this BOL yet.</p>
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className={`inline-flex h-9 items-center rounded-md px-3.5 text-[13px] font-bold transition-colors disabled:opacity-60 ${BTN_EDIT}`}
            >
              {uploading ? "Uploading…" : "Attach a file"}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void handleFile(file);
              }}
            />
          </div>
        )}
      </div>
    </Card>
  );
}
