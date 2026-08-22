"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Card, CardHead, BTN_PRIMARY, BTN_EDIT } from "../../../_shell/ui";
import { getSignedPdfUrl } from "../../../shipments/pdfClient";
import { DocViewer, PdfViewerPages } from "@/components/ui/DocViewer";
import { attachBolDocument } from "../actions";

const STORAGE_BUCKET = "crm-documents";
const ACCEPT = "application/pdf,image/*";

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.length > 150 ? cleaned.slice(-150) : cleaned;
}

export type BolDocument = { id: string; fileName: string; storagePath: string; mimeType: string | null };

/**
 * The left-column document panel — embedded inline (not a click-to-reveal
 * thumbnail) so the source BOL is readable right next to the entity queue,
 * plus an "Open full-screen" escape hatch into the app's one shared DocViewer
 * (zoom controls, download) for a closer look. Same rendering primitives
 * DocumentSection.tsx used (getSignedPdfUrl, pdf.js via PdfViewerPages) —
 * PdfViewerPages is exported from DocViewer.tsx specifically so a smaller,
 * embedded presentation like this one can reuse it instead of writing a
 * second PDF renderer.
 */
export function DocumentPanel({ bolId, orgId, document }: { bolId: string; orgId: string; document: BolDocument | null }) {
  const router = useRouter();
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!document) return;
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

  const isImage = Boolean(document?.mimeType?.startsWith("image/"));

  return (
    <Card>
      <CardHead title="Document" hint={document ? document.fileName : "No document attached"} />
      <div className="flex flex-col gap-3 p-3">
        {error && <p className="text-[12.5px] text-bad">{error}</p>}

        {document ? (
          <>
            <div className="max-h-[75vh] overflow-y-auto rounded-md border border-line-strong bg-inset">
              {signedUrl ? (
                isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={signedUrl} alt={document.fileName} className="block w-full" />
                ) : (
                  <PdfViewerPages url={signedUrl} name={document.fileName} />
                )
              ) : (
                <div className="flex h-64 items-center justify-center">
                  <div className="h-40 w-[160px] animate-pulse rounded-md bg-elevated" />
                </div>
              )}
            </div>
            <button
              type="button"
              disabled={!signedUrl}
              onClick={() => setFullScreen(true)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-[13px] font-bold transition-colors disabled:opacity-60 ${BTN_PRIMARY}`}
            >
              Open full-screen ↗
            </button>
          </>
        ) : (
          <div className="flex flex-col items-start gap-2 py-6">
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

      {fullScreen && signedUrl && document && (
        <DocViewer doc={{ name: document.fileName, url: signedUrl, isImage }} onClose={() => setFullScreen(false)} />
      )}
    </Card>
  );
}
