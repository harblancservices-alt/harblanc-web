"use client";

import { useRef, useState } from "react";
import type { ClipboardEvent, DragEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Card, CardHead, BTN_PRIMARY } from "../_shell/ui";
import { LABEL, CONTROL } from "../_shell/form";
import { IconX } from "../_shell/icons";
import { createUpgradeRequest, addUpgradeAttachment } from "./actions";

const STORAGE_BUCKET = "crm-documents";

/** Path segments can't contain arbitrary characters — same rule as
 * BolSection/CommodityPhotoTiles's sanitizeFileName. */
function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.length > 150 ? cleaned.slice(-150) : cleaned;
}

type PendingFile = { key: string; file: File; previewUrl: string };

/**
 * The Upgrades board's "New request" composer — title, optional details, and
 * a screenshots area that takes images via paste (Ctrl/Cmd+V while it's
 * focused), drag-and-drop, or a file picker. Screenshots are held as local
 * File objects (with object-URL previews) until Post — the request row has
 * to exist first, since each screenshot's storage path is scoped to
 * `<org_id>/upgrades/<request_id>/...`, so Post is a three-step sequence:
 * create the request (actions.ts::createUpgradeRequest), upload each file
 * straight to Supabase Storage from the browser (same direct-upload
 * mechanism as BolSection/CommodityPhotoTiles — server actions cap the
 * request body well under a screenshot's size), then record each one's
 * metadata row (actions.ts::addUpgradeAttachment). A failed screenshot
 * upload doesn't roll back the request — it's already posted, just flagged
 * as missing an attachment, same as the other upload flows' per-file error
 * handling.
 */
export function UpgradeComposer({ orgId }: { orgId: string }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function addFiles(fileList: FileList | File[] | null) {
    if (!fileList) return;
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    setPending((prev) => [
      ...prev,
      ...files.map((file) => ({
        key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
  }

  function removePending(key: string) {
    setPending((prev) => {
      const found = prev.find((p) => p.key === key);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((p) => p.key !== key);
    });
  }

  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;
    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }

  async function submit() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Tell us what you'd like changed or removed.");
      return;
    }
    setError(null);
    setSubmitting(true);

    const created = await createUpgradeRequest({ title: trimmedTitle, body: body.trim() || null });
    if (!created.ok) {
      setSubmitting(false);
      setError(created.error);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    let attachmentError: string | null = null;
    for (const p of pending) {
      const storagePath = `${orgId}/upgrades/${created.id}/${crypto.randomUUID()}-${sanitizeFileName(p.file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, p.file, { contentType: p.file.type || undefined, upsert: false });

      if (uploadError) {
        attachmentError = "Posted, but one or more screenshots failed to upload.";
        continue;
      }

      const res = await addUpgradeAttachment(created.id, {
        fileName: p.file.name,
        storagePath,
        mimeType: p.file.type || null,
        sizeBytes: p.file.size,
      });
      if (!res.ok) attachmentError = "Posted, but one or more screenshots failed to upload.";
    }

    pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setTitle("");
    setBody("");
    setPending([]);
    setSubmitting(false);
    setError(attachmentError);
    router.refresh();
  }

  return (
    <Card>
      <CardHead title="New request" hint="Visible to the whole team — Brent sees every request" />
      <div className="flex flex-col gap-3 p-4">
        {error && (
          <p className="border border-bad/30 bg-bad-bg px-3 py-2 text-[13px] text-bad">{error}</p>
        )}

        <label className="flex w-full flex-col gap-1.5">
          <span className={LABEL}>
            What do you want changed or removed?<span className="ml-1 text-accent">*</span>
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Remove the old Pipeline tab from Companies"
            className={`h-11 w-full ${CONTROL}`}
          />
        </label>

        <label className="flex w-full flex-col gap-1.5">
          <span className={LABEL}>Details (optional)</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Anything else Brent should know"
            className={`w-full resize-y py-2.5 leading-relaxed ${CONTROL}`}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className={LABEL}>Screenshots</span>
          <div
            tabIndex={0}
            onPaste={onPaste}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center gap-2 border-2 border-dashed px-4 py-6 text-center outline-none transition-colors ${
              dragOver ? "border-accent bg-accent/5" : "border-line-strong"
            }`}
          >
            <p className="text-[13px] font-medium text-fg">
              Click here and paste (Ctrl/Cmd+V), drag &amp; drop, or
            </p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex h-9 items-center rounded-lg bg-accent px-4 text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              Choose files
            </button>
            <p className="text-[12px] text-fg-subtle">Images only, multiple allowed</p>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {pending.length > 0 && (
            <div className="mt-1 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {pending.map((p) => (
                <div
                  key={p.key}
                  className="group relative aspect-square overflow-hidden border border-line-strong bg-inset"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.previewUrl} alt={p.file.name} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePending(p.key)}
                    aria-label={`Remove ${p.file.name}`}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <IconX width={12} height={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors ${BTN_PRIMARY}`}
          >
            {submitting ? "Posting…" : "Post request"}
          </button>
        </div>
      </div>
    </Card>
  );
}
