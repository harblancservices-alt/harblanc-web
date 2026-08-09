"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { IconPlus, IconX } from "../../_shell/icons";
import { createCommodityPhoto, deleteCommodityPhoto } from "./commodity-photo-actions";

export type CrmCommodityPhoto = {
  id: string;
  fileName: string;
  storagePath: string;
  /** Resolved server-side (the bucket is private) — null if signing failed,
   * in which case the tile falls back to a filename chip instead of an img. */
  signedUrl: string | null;
};

type UploadItem = { key: string; status: "uploading" | "saving" | "error"; error?: string };

const STORAGE_BUCKET = "crm-documents";

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.length > 150 ? cleaned.slice(-150) : cleaned;
}

/**
 * Reference photos of what this company actually ships (a pallet, a product
 * label, the dock) — a compact tile grid on the Company card, distinct from
 * the BOL tab's document list. Same upload mechanism as BolSection (browser
 * -direct to Supabase Storage, bucket "crm-documents"; a server action only
 * ever writes the crm_documents metadata row afterward) under
 * `<org_id>/commodity-photos/<account_id>/<uuid>-<name>` — see
 * commodity-photo-actions.ts for why this needs no new table or policy.
 */
export function CommodityPhotoTiles({
  accountId,
  orgId,
  photos,
}: {
  accountId: string;
  orgId: string;
  photos: CrmCommodityPhoto[];
}) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function uploadOne(file: File) {
    const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setUploads((prev) => [...prev, { key, status: "uploading" }]);

    if (!file.type.startsWith("image/")) {
      setUploads((prev) =>
        prev.map((u) => (u.key === key ? { ...u, status: "error", error: "Images only." } : u)),
      );
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const storagePath = `${orgId}/commodity-photos/${accountId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, { contentType: file.type || undefined, upsert: false });

    if (uploadError) {
      setUploads((prev) =>
        prev.map((u) =>
          u.key === key ? { ...u, status: "error", error: "Upload failed." } : u,
        ),
      );
      return;
    }

    setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, status: "saving" } : u)));

    const res = await createCommodityPhoto(accountId, {
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
    Array.from(fileList).forEach((file) => void uploadOne(file));
  }

  function remove(photo: CrmCommodityPhoto) {
    if (!window.confirm("Delete this photo?")) return;
    setError(null);
    setBusyId(photo.id);
    void deleteCommodityPhoto(photo.id, accountId).then((res) => {
      setBusyId(null);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div>
      {error && <p className="mb-2 text-[12px] text-bad">{error}</p>}
      <div className="grid grid-cols-4 gap-2">
        {photos.map((p) => (
          <div
            key={p.id}
            className="group relative aspect-square overflow-hidden rounded-lg border border-line-strong bg-inset"
          >
            {p.signedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.signedUrl} alt={p.fileName} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full items-center justify-center px-1.5 text-center text-[10px] text-fg-subtle">
                {p.fileName}
              </span>
            )}
            <button
              type="button"
              onClick={() => remove(p)}
              disabled={busyId === p.id}
              aria-label={`Delete ${p.fileName}`}
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-60"
            >
              {busyId === p.id ? "…" : <IconX width={12} height={12} />}
            </button>
          </div>
        ))}

        {uploads.map((u) => (
          <div
            key={u.key}
            className={`flex aspect-square items-center justify-center rounded-lg border px-1.5 text-center text-[10px] ${
              u.status === "error"
                ? "border-bad/40 bg-bad-bg text-bad"
                : "border-line-strong bg-inset text-fg-subtle"
            }`}
          >
            {u.status === "uploading" && "Uploading…"}
            {u.status === "saving" && "Saving…"}
            {u.status === "error" && (u.error || "Failed")}
          </div>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line-strong text-fg-subtle transition-colors hover:border-accent/40 hover:text-accent"
        >
          <IconPlus width={16} height={16} />
          <span className="text-[10.5px] font-semibold">Add photo</span>
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
