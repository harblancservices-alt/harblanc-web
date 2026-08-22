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

/** The displayed/editable title for a template card — whatever it's been
 * renamed to (file_name), falling back to the fixed type label ("Rate
 * Confirmation"/"Bill of Lading") until someone renames it or when no file
 * has ever been uploaded for that slot. */
function templateTitle(t: AdminBlankTemplate): string {
  return t.fileName || t.label;
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
 * Documents tab — the two blank master templates (generator output) and
 * org-level uploads (insurance certs, W9s, agreements) together in one
 * 5-across grid.
 *
 * Opening ANY doc (template or upload) pops a real separate browser
 * window/tab. `window.open` is called SYNCHRONOUSLY on the click itself
 * (before the signed-URL fetch), then navigated to the real URL once it
 * resolves — calling window.open only after an `await` is what silently got
 * this treated as a same-window/blocked-popup navigation by the browser
 * (Safari in particular blocks a popup that isn't a direct, synchronous
 * response to the user gesture); this two-step open-blank-then-navigate
 * pattern is the standard fix and is real, not a same-tab fallback.
 *
 * Rename/delete live behind a single header "Edit" toggle (always visible,
 * regardless of whether any uploads exist yet — a prior version gated it on
 * uploads.length, which hid it entirely for an org with only the 2
 * templates). In edit mode EVERY title is a text input, templates included;
 * Save persists whichever titles actually changed. Delete stays upload-only
 * — no delete control ever renders for a template card, and
 * deleteOrgDocument re-guards that server-side regardless of what the UI
 * shows.
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

  function openInNewWindow(key: string, storagePath: string, label: string) {
    setError(null);
    setOpening(key);
    // Synchronous, direct response to the click — browsers won't block this.
    const win = window.open("", "_blank");
    void getSignedPdfUrl(storagePath).then((url) => {
      setOpening(null);
      if (!url || !win) {
        win?.close();
        setError(`Could not open ${label}. Please try again.`);
        return;
      }
      win.location.href = url;
    });
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
    const seed: Record<string, string> = {};
    for (const t of templates) if (t.id) seed[t.id] = templateTitle(t);
    for (const u of uploads) seed[u.id] = u.fileName;
    setDrafts(seed);
    setEditMode(true);
  }

  async function saveAndExitEditMode() {
    setError(null);
    setSaving(true);
    const originalById = new Map<string, string>();
    for (const t of templates) if (t.id) originalById.set(t.id, templateTitle(t));
    for (const u of uploads) originalById.set(u.id, u.fileName);

    const changedIds = Object.keys(drafts).filter((id) => drafts[id]?.trim() && drafts[id].trim() !== originalById.get(id));
    for (const id of changedIds) {
      const res = await renameOrgDocument(id, drafts[id].trim());
      if (!res.ok) setError(res.error);
    }
    setSaving(false);
    setEditMode(false);
    if (changedIds.length) router.refresh();
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
              {editMode ? (
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
              )}
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
            const canEditTitle = editMode && Boolean(t.id);
            return (
              <div key={t.docType} className="flex flex-col overflow-hidden rounded-lg border border-line-strong bg-card text-left shadow-e1">
                <div
                  role={hasFile && !editMode ? "button" : undefined}
                  tabIndex={hasFile && !editMode ? 0 : undefined}
                  onClick={hasFile && !editMode ? () => openInNewWindow(t.docType, t.storagePath!, templateTitle(t)) : undefined}
                  onKeyDown={
                    hasFile && !editMode
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") openInNewWindow(t.docType, t.storagePath!, templateTitle(t));
                        }
                      : undefined
                  }
                  className={`flex aspect-[4/3] items-center justify-center overflow-hidden bg-inset ${
                    hasFile && !editMode ? "cursor-pointer transition-shadow hover:shadow-e2" : hasFile ? "" : "opacity-80"
                  }`}
                >
                  {t.thumbUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.thumbUrl} alt={templateTitle(t)} className="h-full w-full object-cover object-top" />
                  )}
                </div>
                <div className="flex flex-col gap-1.5 p-3">
                  {canEditTitle ? (
                    <input
                      type="text"
                      value={drafts[t.id as string] ?? templateTitle(t)}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [t.id as string]: e.target.value }))}
                      className={`w-full min-w-0 ${CONTROL}`}
                    />
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="shrink-0 text-accent">{typeIcon(t.docType)}</span>
                      <span className="truncate text-[13.5px] font-bold text-fg">
                        {opening === t.docType ? "Opening…" : templateTitle(t)}
                      </span>
                    </div>
                  )}
                  <p className="text-[12px] text-fg-subtle">{hasFile ? "Blank master template" : "No template on file yet"}</p>
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
