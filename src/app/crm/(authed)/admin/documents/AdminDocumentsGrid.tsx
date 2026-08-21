"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Card, CardHead, BTN_PRIMARY } from "../../_shell/ui";
import { IconRateConfirmation, IconBillOfLading } from "../../_shell/icons";
import { formatDate } from "../../_shell/format";
import { getSignedPdfUrl } from "../../shipments/pdfClient";
import { DocViewer, type ViewerDoc } from "@/components/ui/DocViewer";
import { createOrgDocument, deleteOrgDocument } from "./actions";
import type { AdminBlankTemplate, AdminOrgUpload } from "../types";

const STORAGE_BUCKET = "crm-documents";
const ACCEPT = "application/pdf,image/*";
const GRID_CLASS = "grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5";

function typeIcon(t: AdminBlankTemplate["docType"]) {
  return t === "bill_of_lading" ? <IconBillOfLading width={14} height={14} /> : <IconRateConfirmation width={14} height={14} />;
}

/** Generic file icon for an org upload's thumbnail block — no dedicated
 * "file" icon exists in _shell/icons.tsx, and none of the doc-type icons
 * there (Rate Confirmation, BOL) fit an arbitrary upload. */
function IconFile({ width = 32, height = 32 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.length > 150 ? cleaned.slice(-150) : cleaned;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type PreviewTarget =
  | { kind: "template"; template: AdminBlankTemplate }
  | { kind: "upload"; upload: AdminOrgUpload };

/**
 * Documents tab — the two blank master templates (read-only, generator
 * output) and org-level uploads (insurance certs, W9s, agreements — user-
 * managed) together in one 5-across grid. Upload goes straight from the
 * browser to Storage (bucket "crm-documents") using the signed-in user's own
 * session/RLS, same mechanism as accounts/[id]/BolSection.tsx — only the
 * metadata is written server-side after, via ./actions.ts::createOrgDocument.
 * Viewing either card type opens the same shared DocViewer; uploads pass
 * `onDelete` (DocViewer's own built-in confirm-then-delete flow), templates
 * don't, since templates aren't deletable — enforced again server-side in
 * deleteOrgDocument, not just by omitting the button.
 */
export function AdminDocumentsGrid({
  templates,
  uploads,
  orgId,
}: {
  templates: AdminBlankTemplate[];
  uploads: AdminOrgUpload[];
  orgId: string;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function openTemplate(t: AdminBlankTemplate) {
    if (!t.storagePath) return;
    setError(null);
    setPreview({ kind: "template", template: t });
    setPreviewUrl(null);
    const url = await getSignedPdfUrl(t.storagePath);
    setPreviewUrl(url);
    if (!url) setError("Could not open this template. Please try again.");
  }

  async function openUpload(u: AdminOrgUpload) {
    setError(null);
    setPreview({ kind: "upload", upload: u });
    setPreviewUrl(null);
    const url = await getSignedPdfUrl(u.storagePath);
    setPreviewUrl(url);
    if (!url) setError("Could not open this file. Please try again.");
  }

  async function handleFile(file: File) {
    setError(null);
    if (file.type !== "application/pdf" && !file.type.startsWith("image/")) {
      setError("Only PDF or image files are accepted.");
      return;
    }
    setUploading(true);
    const supabase = createSupabaseBrowserClient();
    const storagePath = `${orgId}/org-docs/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (uploadError) {
      setUploading(false);
      setError("Upload failed. Please try again.");
      return;
    }
    const res = await createOrgDocument({ fileName: file.name, storagePath, mimeType: file.type || null, sizeBytes: file.size });
    setUploading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  async function handleDelete(id: string) {
    const res = await deleteOrgDocument(id);
    if (!res.ok) {
      setError(res.error);
      throw new Error(res.error);
    }
    router.refresh();
  }

  const previewDoc: ViewerDoc | null = preview
    ? preview.kind === "template"
      ? { name: preview.template.fileName ?? `${preview.template.label} Template.pdf`, url: previewUrl, isImage: false }
      : { name: preview.upload.fileName, url: previewUrl, isImage: Boolean(preview.upload.mimeType?.startsWith("image/")) }
    : null;

  return (
    <div className="space-y-4">
      {error && <Card className="border-bad/30 bg-bad-bg px-4 py-2.5 text-[13px] text-bad">{error}</Card>}

      <Card>
        <CardHead
          title="Documents"
          hint="Master templates and org-level files"
          right={
            <>
              <button
                type="button"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
                className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-[13px] font-bold transition-colors disabled:opacity-60 ${BTN_PRIMARY}`}
              >
                {uploading ? "Uploading…" : "Upload document"}
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
            </>
          }
        />
        <div className={GRID_CLASS}>
          {templates.map((t) => {
            const hasFile = Boolean(t.storagePath);
            return (
              <div
                key={t.docType}
                role={hasFile ? "button" : undefined}
                tabIndex={hasFile ? 0 : undefined}
                onClick={hasFile ? () => openTemplate(t) : undefined}
                onKeyDown={
                  hasFile
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") openTemplate(t);
                      }
                    : undefined
                }
                className={`flex flex-col overflow-hidden rounded-lg border border-line-strong bg-card text-left shadow-e1 ${
                  hasFile ? "cursor-pointer transition-shadow hover:shadow-e2" : "opacity-80"
                }`}
              >
                <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-inset">
                  {t.thumbUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.thumbUrl} alt={t.label} className="h-full w-full object-cover object-top" />
                  )}
                </div>
                <div className="flex flex-col gap-1 p-3">
                  <div className="flex items-center gap-1.5">
                    <span className="shrink-0 text-accent">{typeIcon(t.docType)}</span>
                    <span className="text-[13.5px] font-bold text-fg">{t.label}</span>
                  </div>
                  <p className="text-[12px] text-fg-subtle">{hasFile ? "Blank master template" : "No template on file yet"}</p>
                </div>
              </div>
            );
          })}

          {uploads.map((u) => (
            <div
              key={u.id}
              role="button"
              tabIndex={0}
              onClick={() => openUpload(u)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") openUpload(u);
              }}
              className="flex cursor-pointer flex-col overflow-hidden rounded-lg border border-line-strong bg-card text-left shadow-e1 transition-shadow hover:shadow-e2"
            >
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-inset text-fg-subtle">
                <IconFile width={32} height={32} />
              </div>
              <div className="flex flex-col gap-1 p-3">
                <p className="truncate text-[13.5px] font-bold text-fg">{u.fileName}</p>
                <p className="text-[12px] text-fg-subtle">
                  {[formatDate(u.createdAt), formatBytes(u.sizeBytes)].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
          ))}

          {templates.length === 0 && uploads.length === 0 && (
            <p className="col-span-full py-10 text-center text-[13px] text-fg-muted">No documents yet.</p>
          )}
        </div>
      </Card>

      {previewDoc && (
        <DocViewer
          doc={previewDoc}
          onClose={() => {
            setPreview(null);
            setPreviewUrl(null);
          }}
          onDelete={preview?.kind === "upload" ? () => handleDelete(preview.upload.id) : undefined}
          deleteLabel="Delete"
        />
      )}
    </div>
  );
}
