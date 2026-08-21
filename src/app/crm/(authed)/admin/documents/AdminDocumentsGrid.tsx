"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Card, CardHead, BTN_PRIMARY, BTN_EDIT, BTN_DANGER } from "../../_shell/ui";
import { IconRateConfirmation, IconBillOfLading } from "../../_shell/icons";
import { formatDate } from "../../_shell/format";
import { CONTROL } from "../../_shell/form";
import { getSignedPdfUrl } from "../../shipments/pdfClient";
import { createOrgDocument, renameOrgDocument, deleteOrgDocument } from "./actions";
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

/**
 * Documents tab — the two blank master templates (read-only, generator
 * output) and org-level uploads (insurance certs, W9s, agreements — user-
 * managed) together in one 5-across grid.
 *
 * Opening ANY doc (template or upload) pops a real separate browser
 * window/tab (window.open on a freshly-fetched signed URL) — the browser's
 * own native PDF/image view handles zoom there. No in-app overlay viewer;
 * Brent needs to flip between the document and the CRM, which a same-window
 * takeover doesn't allow (same reasoning as the BOL Center detail page's
 * "Open in new window").
 *
 * Rename/delete live behind a single header "Edit" toggle, not a per-card
 * control — Brent couldn't find/use the previous per-card "⋯" menu. Clicking
 * Edit swaps every upload card's title into a text input and reveals a
 * small Delete button; clicking Save persists whichever titles actually
 * changed and exits. Templates never get an input or a delete button, in
 * or out of edit mode — enforced again server-side in
 * renameOrgDocument/deleteOrgDocument regardless of what the UI shows.
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
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  async function openInNewWindow(key: string, storagePath: string, label: string) {
    setError(null);
    setOpening(key);
    const url = await getSignedPdfUrl(storagePath);
    setOpening(null);
    if (!url) {
      setError(`Could not open ${label}. Please try again.`);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
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

  function enterEditMode() {
    setError(null);
    setDrafts(Object.fromEntries(uploads.map((u) => [u.id, u.fileName])));
    setEditMode(true);
  }

  async function saveAndExitEditMode() {
    setError(null);
    setSaving(true);
    const changed = uploads.filter((u) => drafts[u.id]?.trim() && drafts[u.id].trim() !== u.fileName);
    for (const u of changed) {
      const res = await renameOrgDocument(u.id, drafts[u.id].trim());
      if (!res.ok) setError(res.error);
    }
    setSaving(false);
    setEditMode(false);
    if (changed.length) router.refresh();
  }

  async function handleDelete(u: AdminOrgUpload) {
    if (!window.confirm(`Delete "${u.fileName}"? This can't be undone.`)) return;
    setError(null);
    const res = await deleteOrgDocument(u.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

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
              {uploads.length > 0 &&
                (editMode ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={saveAndExitEditMode}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-[13px] font-bold transition-colors disabled:opacity-60 ${BTN_PRIMARY}`}
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={enterEditMode}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-[13px] font-bold transition-colors ${BTN_EDIT}`}
                  >
                    Edit
                  </button>
                ))}
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
                onClick={hasFile ? () => openInNewWindow(t.docType, t.storagePath!, t.label) : undefined}
                onKeyDown={
                  hasFile
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") openInNewWindow(t.docType, t.storagePath!, t.label);
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
                  <p className="text-[12px] text-fg-subtle">
                    {opening === t.docType ? "Opening…" : hasFile ? "Blank master template" : "No template on file yet"}
                  </p>
                </div>
              </div>
            );
          })}

          {uploads.map((u) => (
            <div key={u.id} className="flex flex-col overflow-hidden rounded-lg border border-line-strong bg-card text-left shadow-e1">
              <div
                role={editMode ? undefined : "button"}
                tabIndex={editMode ? undefined : 0}
                onClick={editMode ? undefined : () => openInNewWindow(u.id, u.storagePath, u.fileName)}
                onKeyDown={
                  editMode
                    ? undefined
                    : (e) => {
                        if (e.key === "Enter" || e.key === " ") openInNewWindow(u.id, u.storagePath, u.fileName);
                      }
                }
                className={`flex aspect-[4/3] items-center justify-center overflow-hidden bg-inset text-fg-subtle ${editMode ? "" : "cursor-pointer transition-shadow hover:shadow-e2"}`}
              >
                <IconFile width={32} height={32} />
              </div>
              <div className="flex flex-col gap-1.5 p-3">
                {editMode ? (
                  <>
                    <input
                      type="text"
                      value={drafts[u.id] ?? u.fileName}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [u.id]: e.target.value }))}
                      className={`w-full min-w-0 ${CONTROL}`}
                    />
                    <button
                      type="button"
                      onClick={() => handleDelete(u)}
                      className={`inline-flex h-7 items-center justify-center rounded-md px-2 text-[11.5px] font-bold transition-colors ${BTN_DANGER}`}
                    >
                      Delete
                    </button>
                  </>
                ) : (
                  <p className="truncate text-[13.5px] font-bold text-fg">{opening === u.id ? "Opening…" : u.fileName}</p>
                )}
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
    </div>
  );
}
