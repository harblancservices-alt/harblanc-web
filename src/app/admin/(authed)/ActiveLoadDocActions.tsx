"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadLoadDocument } from "./dispatch/loads/actions";

// Same picker setup as the maintenance receipt / load-document uploaders:
// image/* with NO capture → mobile offers Take Photo / Library / Choose File.
const ACCEPT = "image/*,application/pdf";

type StagedFile = { id: string; file: File };

export type DocKind = "rate_con" | "bol" | "pod";

const DOC_TITLE: Record<DocKind, string> = {
  rate_con: "Add rate confirmation",
  bol: "Add bill of lading",
  pod: "Add proof of delivery",
};

/**
 * Per-active-load document upload button (Rate Con / BOL / POD) on the
 * dashboard. Opens a staging multi-file (camera / library / file) uploader and
 * saves the files under the given kind on that load via uploadLoadDocument —
 * the same action and bucket the load page uses. The count folds into the
 * label ("Rate Con · 2") like the original POD button did.
 */
export function ActiveLoadDocButton({
  loadId,
  broker,
  lane,
  kind,
  label,
  count = 0,
}: {
  loadId: string;
  broker: string;
  lane: string;
  kind: DocKind;
  label: string;
  count?: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1 rounded-md border border-red-700 bg-red-600 px-2 py-2 text-center font-mono text-[10px] font-bold uppercase leading-tight tracking-[0.04em] text-white transition-colors hover:bg-red-700"
      >
        + {label}
        {count > 0 ? ` · ${count}` : ""}
      </button>
      {open ? (
        <DocModal
          loadId={loadId}
          broker={broker}
          lane={lane}
          kind={kind}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function DocModal({
  loadId,
  broker,
  lane,
  kind,
  onClose,
}: {
  loadId: string;
  broker: string;
  lane: string;
  kind: DocKind;
  onClose: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  function onPick(fileList: FileList | null) {
    const picked = Array.from(fileList ?? []);
    if (picked.length > 0) {
      setStaged((prev) => [
        ...prev,
        ...picked.map((file) => ({ id: crypto.randomUUID(), file })),
      ]);
    }
    if (inputRef.current) inputRef.current.value = ""; // allow re-picking
  }

  function removeStaged(id: string) {
    setStaged((prev) => prev.filter((s) => s.id !== id));
  }

  async function onSubmit() {
    if (busy) return;
    if (staged.length === 0) {
      setErr("Add at least one photo or file.");
      return;
    }
    const fd = new FormData();
    for (const s of staged) fd.append("files", s.file);
    fd.append("kind", kind);
    setBusy(true);
    setErr(null);
    try {
      const res = await uploadLoadDocument(loadId, fd);
      if (!res.ok) {
        setErr(res.reason);
        return;
      }
      router.refresh();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={DOC_TITLE[kind]}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-6"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="my-4 w-full max-w-md overflow-hidden rounded-lg border border-line-strong bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 bg-bar px-4 py-2.5">
          <span className="truncate font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-bar-fg">
            {DOC_TITLE[kind]}
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-sm border border-white/25 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-bar-fg transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>

        <div className="space-y-3 bg-elevated px-4 py-4">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-fg">{broker}</p>
            <p className="truncate text-[11px] text-fg-muted">{lane}</p>
          </div>

          {staged.length > 0 ? (
            <div className="space-y-1.5">
              {staged.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-line bg-card px-2.5 py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-muted">
                    {s.file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeStaged(s.id)}
                    disabled={busy}
                    aria-label={`Remove ${s.file.name}`}
                    className="shrink-0 rounded-sm border border-line-strong px-1.5 py-[1px] font-mono text-[11px] font-bold text-fg-subtle transition-colors hover:bg-elevated hover:text-red-700 disabled:opacity-50"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line-strong bg-card px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-fg-muted transition-colors hover:bg-elevated hover:text-fg">
            {staged.length > 0 ? "+ Add more" : "+ Add photo / file"}
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              multiple
              onChange={(e) => onPick(e.target.files)}
              className="hidden"
            />
          </label>
          <p className="font-mono text-[10px] text-fg-subtle">
            Take a photo, choose from your library, or pick a PDF · multiple
            files welcome.
          </p>

          {err ? (
            <p role="alert" className="text-[12px] font-semibold text-red-700">
              {err}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line bg-elevated px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-line-strong bg-card px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-fg transition-colors hover:bg-elevated disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy || staged.length === 0}
            aria-busy={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-700 bg-red-600 px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {busy ? (
              <>
                <span
                  aria-hidden
                  className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white"
                />
                Uploading…
              </>
            ) : (
              `Upload${staged.length > 0 ? ` ${staged.length}` : ""}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
