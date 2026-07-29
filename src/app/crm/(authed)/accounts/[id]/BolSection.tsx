"use client";

import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Card, CardHead } from "../../_shell/ui";
import { formatDateTime } from "../../_shell/format";
import { createBolDocument, deleteBolDocument } from "./bol-actions";

export type CrmBolDocument = {
  id: string;
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  uploaderName: string | null;
};

type UploadItem = {
  key: string;
  name: string;
  status: "uploading" | "saving" | "error";
  error?: string;
};

const STORAGE_BUCKET = "crm-documents";
const ACCEPT = "application/pdf,image/*";
/** Signed URLs are generated on demand and only ever used immediately (open
 * in a new tab) — short-lived is enough, this just avoids handing out a
 * long-lived link for a file in a private bucket. */
const SIGNED_URL_TTL_SECONDS = 300;

function isAcceptedFile(file: File): boolean {
  return file.type === "application/pdf" || file.type.startsWith("image/");
}

/** Path segments can't contain arbitrary characters — keep letters, digits,
 * dot, dash, underscore; collapse everything else to "_". Trimmed to a
 * sane length so a very long original name can't blow out the object path. */
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

/**
 * The company profile's BOL tab — upload, list, view, and delete Bills of
 * Lading (crm_documents, kind='bol'). Uploads go straight from the browser
 * to Supabase Storage (bucket "crm-documents") using the signed-in user's own
 * session/RLS, under `<org_id>/bol/<account_id>/<uuid>-<sanitizedFileName>` —
 * NEVER through a server action, since those cap the request body around
 * 1MB and a BOL photo/PDF routinely exceeds that. Only the metadata (file
 * name, storage path, mime type, size) is written server-side afterward, via
 * bol-actions.ts::createBolDocument.
 */
export function BolSection({
  accountId,
  orgId,
  documents,
}: {
  accountId: string;
  orgId: string;
  documents: CrmBolDocument[];
}) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function uploadOne(file: File) {
    const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setUploads((prev) => [...prev, { key, name: file.name, status: "uploading" }]);

    if (!isAcceptedFile(file)) {
      setUploads((prev) =>
        prev.map((u) =>
          u.key === key
            ? { ...u, status: "error", error: "Only PDF or image files are accepted." }
            : u,
        ),
      );
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const storagePath = `${orgId}/bol/${accountId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, {
        contentType: file.type || undefined,
        upsert: false,
      });

    if (uploadError) {
      setUploads((prev) =>
        prev.map((u) =>
          u.key === key
            ? { ...u, status: "error", error: "Upload failed. Please try again." }
            : u,
        ),
      );
      return;
    }

    setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, status: "saving" } : u)));

    const res = await createBolDocument(accountId, {
      fileName: file.name,
      storagePath,
      mimeType: file.type || null,
      sizeBytes: file.size,
    });

    if (!res.ok) {
      setUploads((prev) =>
        prev.map((u) => (u.key === key ? { ...u, status: "error", error: res.error } : u)),
      );
      return;
    }

    setUploads((prev) => prev.filter((u) => u.key !== key));
    router.refresh();
  }

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    Array.from(fileList).forEach((file) => {
      void uploadOne(file);
    });
  }

  function dismissUpload(key: string) {
    setUploads((prev) => prev.filter((u) => u.key !== key));
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  async function view(doc: CrmBolDocument) {
    setListError(null);
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(doc.storagePath, SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) {
      setListError("Could not open this file. Please try again.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  function remove(doc: CrmBolDocument) {
    if (!window.confirm(`Delete "${doc.fileName}"? This can't be undone from here.`)) return;
    setListError(null);
    setBusyId(doc.id);
    void deleteBolDocument(doc.id, accountId).then((res) => {
      setBusyId(null);
      if (res.ok) router.refresh();
      else setListError(res.error);
    });
  }

  return (
    <Card>
      <CardHead
        title="Bills of Lading"
        hint={documents.length ? `${documents.length} on file` : undefined}
      />

      <div className="border-b border-line-strong px-5 py-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
            dragOver ? "border-accent bg-accent/5" : "border-line-strong"
          }`}
        >
          <p className="text-[13.5px] font-medium text-fg">
            Drag & drop a BOL here, or
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex h-9 items-center rounded-lg bg-accent px-4 text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            Choose file
          </button>
          <p className="text-[12px] text-fg-subtle">PDF or image (photo of the paperwork)</p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {uploads.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {uploads.map((u) => (
              <li
                key={u.key}
                className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-[12.5px] ${
                  u.status === "error" ? "bg-bad-bg text-bad" : "bg-inset text-fg-muted"
                }`}
              >
                <span className="min-w-0 truncate">
                  {u.status === "uploading" && `Uploading ${u.name}…`}
                  {u.status === "saving" && `Saving ${u.name}…`}
                  {u.status === "error" && `${u.name}: ${u.error}`}
                </span>
                {u.status === "error" && (
                  <button
                    type="button"
                    onClick={() => dismissUpload(u.key)}
                    className="shrink-0 font-semibold text-bad hover:underline"
                  >
                    Dismiss
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {listError && (
        <p className="border-b border-line-strong bg-bad-bg px-5 py-2.5 text-[12.5px] text-bad">
          {listError}
        </p>
      )}

      {documents.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-fg-muted">
          No BOLs yet. Upload the pickup paperwork above.
        </p>
      ) : (
        <ul className="divide-y divide-line-strong">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold text-fg">{doc.fileName}</p>
                <p className="mt-0.5 text-[12px] text-fg-subtle">
                  {[formatBytes(doc.sizeBytes), formatDateTime(doc.createdAt), doc.uploaderName]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => view(doc)}
                  className="rounded-lg border border-line-strong bg-card px-3 py-1.5 text-[12.5px] font-semibold text-fg transition-colors hover:bg-inset"
                >
                  View
                </button>
                <button
                  type="button"
                  onClick={() => remove(doc)}
                  disabled={busyId === doc.id}
                  className="rounded-lg border border-bad/30 bg-bad-bg px-3 py-1.5 text-[12.5px] font-semibold text-bad transition-colors hover:bg-bad/10 disabled:opacity-60"
                >
                  {busyId === doc.id ? "…" : "Delete"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
