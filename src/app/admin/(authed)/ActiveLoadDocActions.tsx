"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createLoadDocUploadUrl,
  recordLoadDocuments,
  type RecordDoc,
} from "./dispatch/loads/actions";
import { uploadFileToSignedUrl } from "@/lib/storage/client-upload";
import { Button } from "@/components/ui/Button";
import { BolScanner } from "./dispatch/loads/BolScanner";

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
 * dashboard.
 *
 *  - NONE attached yet → the "+ <Doc>" uploader button: opens a staging
 *    multi-file (camera / library / file) picker and saves under the given
 *    kind on that load (same action + bucket the load page uses).
 *  - ALREADY attached → a muted, NON-tappable "✓ <Doc>" indicator that just
 *    shows it's in there (no count, no add action). To add more of that kind,
 *    open the load detail (the card's top area links there).
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

  // Already attached → grayed-out "it's in there" indicator, not an add button.
  if (count > 0) {
    return (
      <span
        aria-label={`${label} attached`}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-line bg-elevated px-2.5 py-1.5 font-mono text-[11px] font-bold uppercase leading-none tracking-[0.08em] text-fg-subtle"
      >
        <span aria-hidden>✓</span> {label}
      </span>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="utility"
        size="sm"
        fullWidth
        onClick={() => setOpen(true)}
      >
        {kind === "bol" ? "+ Scan BOL" : `+ ${label}`}
      </Button>
      {open ? (
        kind === "bol" ? (
          // BOL is always a scan now — go straight into the scanner.
          <BolScanner loadId={loadId} onClose={() => setOpen(false)} />
        ) : (
          <DocModal
            loadId={loadId}
            broker={broker}
            lane={lane}
            kind={kind}
            onClose={() => setOpen(false)}
          />
        )
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
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [askCamera, setAskCamera] = useState(false);

  // POD = delivery photos: go straight to the rear camera (accept="image/*"
  // capture="environment") behind a quick "Open camera?" confirm. Rate Con /
  // BOL keep the normal photo/library/PDF picker.
  const isPod = kind === "pod";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

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
    const n = staged.length;
    setBusy(true);
    setErr(null);
    try {
      // Direct-to-storage: upload each file's bytes straight to the bucket via
      // a signed upload URL (bypasses the server-action / Vercel body limit),
      // then record the rows in one tiny metadata-only action call.
      const recorded: RecordDoc[] = [];
      for (const s of staged) {
        const f = s.file;
        const urlRes = await createLoadDocUploadUrl(loadId, f.name, f.type, f.size);
        if (!urlRes.ok) {
          setErr(urlRes.reason);
          return;
        }
        const upRes = await uploadFileToSignedUrl(
          urlRes.bucket,
          urlRes.path,
          urlRes.token,
          f,
        );
        if (!upRes.ok) {
          setErr(`Upload failed ("${f.name}"): ${upRes.reason}`);
          return;
        }
        recorded.push({
          storagePath: urlRes.path,
          originalFilename: f.name,
          mimeType: f.type,
          sizeBytes: f.size,
        });
      }
      const recRes = await recordLoadDocuments(loadId, kind, recorded);
      if (!recRes.ok) {
        setErr(recRes.reason);
        return;
      }
      // Clear confirmation, then auto-close so Brent can move on.
      setStaged([]);
      setOk(`Saved ${n} file${n === 1 ? "" : "s"}`);
      router.refresh();
      closeTimer.current = setTimeout(onClose, 1200);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed. Please try again.");
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
          <Button
            type="button"
            variant="cancel"
            size="sm"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
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

          <button
            type="button"
            onClick={() =>
              isPod ? setAskCamera(true) : inputRef.current?.click()
            }
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line-strong bg-card px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
          >
            {isPod
              ? staged.length > 0
                ? "Take another photo"
                : "Open camera"
              : staged.length > 0
                ? "+ Add more"
                : "+ Add photo / file"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={isPod ? "image/*" : ACCEPT}
            capture={isPod ? "environment" : undefined}
            multiple
            onChange={(e) => onPick(e.target.files)}
            className="hidden"
          />
          <p className="font-mono text-[10px] text-fg-subtle">
            {isPod
              ? "Opens your camera for a delivery photo · take more if you need."
              : "Take a photo, choose from your library, or pick a PDF · multiple files welcome."}
          </p>

          {ok ? (
            <p
              role="status"
              className="flex items-center gap-1.5 rounded-md border border-green-300 bg-green-50 px-2.5 py-1.5 text-[12px] font-semibold text-green-700"
            >
              <span aria-hidden>✓</span> {ok}
            </p>
          ) : null}

          {err ? (
            <p role="alert" className="text-[12px] font-semibold text-red-700">
              {err}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line bg-elevated px-4 py-3">
          <Button
            type="button"
            variant="cancel"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={onSubmit}
            disabled={busy || staged.length === 0 || ok != null}
            aria-busy={busy}
            leftIcon={
              busy ? (
                <span
                  aria-hidden
                  className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white"
                />
              ) : undefined
            }
          >
            {ok ? (
              "Saved ✓"
            ) : busy ? (
              "Uploading…"
            ) : (
              `Upload${staged.length > 0 ? ` ${staged.length}` : ""}`
            )}
          </Button>
        </div>
      </div>

      {/* POD-only: "Open camera?" yes/no before launching the rear camera. */}
      {askCamera ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            e.stopPropagation();
            setAskCamera(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Open camera"
            className="w-full max-w-xs rounded-lg border border-line-strong bg-card p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[15px] font-semibold text-fg">Open camera?</p>
            <p className="mt-1 text-[12px] text-fg-muted">
              Take a proof-of-delivery photo with your camera.
            </p>
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="cancel"
                size="sm"
                onClick={() => setAskCamera(false)}
              >
                No
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  setAskCamera(false);
                  inputRef.current?.click();
                }}
              >
                Open Camera
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
