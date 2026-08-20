"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Card, CardHead, BTN_PRIMARY } from "../../../_shell/ui";
import { DocViewer, type ViewerDoc } from "@/components/ui/DocViewer";
import { getSignedPdfUrl } from "../../../shipments/pdfClient";
import { attachBolDocument } from "../actions";

const STORAGE_BUCKET = "crm-documents";
const ACCEPT = "application/pdf,image/*";

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.length > 150 ? cleaned.slice(-150) : cleaned;
}

export type BolDocument = { id: string; fileName: string; storagePath: string; mimeType: string | null };

/**
 * The actual BOL image/PDF — reuses the shared full-screen DocViewer and the
 * existing "crm-documents" bucket/RLS exactly (no new viewer, no new
 * bucket). Normally this section just displays a document that arrived
 * already attached via the upstream intake; the upload control here is a
 * fallback for a BOL entered without one.
 */
export function DocumentSection({ bolId, orgId, document }: { bolId: string; orgId: string; document: BolDocument | null }) {
  const router = useRouter();
  const [viewerUrl, setViewerUrl] = useState<string | null | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function openViewer() {
    if (!document) return;
    setError(null);
    setViewerUrl(null);
    const url = await getSignedPdfUrl(document.storagePath);
    setViewerUrl(url);
    if (!url) setError("Could not open this file.");
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

  const doc: ViewerDoc | null = document && viewerUrl !== undefined
    ? { name: document.fileName, url: viewerUrl, isImage: Boolean(document.mimeType?.startsWith("image/")) }
    : null;

  return (
    <Card>
      <CardHead title="Document" hint={document ? document.fileName : undefined} />
      <div className="p-4">
        {error && <p className="mb-3 text-[12.5px] text-bad">{error}</p>}

        {document ? (
          <button
            type="button"
            onClick={openViewer}
            className={`inline-flex h-9 items-center rounded-md px-3.5 text-[13px] font-bold transition-colors ${BTN_PRIMARY}`}
          >
            View document
          </button>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <p className="text-[13px] text-fg-muted">No document attached to this BOL yet.</p>
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className={`inline-flex h-9 items-center rounded-md px-3.5 text-[13px] font-bold transition-colors disabled:opacity-60 ${BTN_PRIMARY}`}
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

      {doc && (
        <DocViewer
          doc={doc}
          onClose={() => setViewerUrl(undefined)}
        />
      )}
    </Card>
  );
}
